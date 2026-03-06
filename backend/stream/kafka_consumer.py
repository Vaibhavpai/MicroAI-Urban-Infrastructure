"""
Kafka Sensor Consumer — Async FastAPI Integration
===================================================
Subscribes to the "sensor-readings" topic and for each message:
  1. Writes the sensor reading to MongoDB via insert_sensor_reading()
  2. Runs ML risk scoring via model_store.predict()
  3. If risk_score > 75, triggers an alert via send_alert()

Runs as an asyncio background task inside the FastAPI lifespan —
never blocks the API event loop.
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("kafka_consumer")

# ── Configuration ────────────────────────────────────────────────────────────
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC = "sensor-readings"
GROUP_ID = "infrawatch-consumer"
POLL_TIMEOUT_MS = 500       # How long KafkaConsumer.poll() blocks
RECONNECT_DELAY = 10        # Seconds between reconnection attempts
MAX_RECONNECT_ATTEMPTS = 0  # 0 = infinite retries


class KafkaSensorConsumer:
    """
    Wraps kafka-python's KafkaConsumer in an async-friendly task.

    The blocking consumer.poll() is executed in a thread pool so it
    doesn't stall the FastAPI event loop. Each received message is
    then processed asynchronously (DB write, ML scoring, alerting).
    """

    def __init__(self):
        self._consumer = None
        self._task: Optional[asyncio.Task] = None
        self._running = False

    # ── Lifecycle ────────────────────────────────────────────────────────

    async def start(self):
        """Spin up the background consumer task."""
        if self._running:
            logger.warning("Consumer already running — skipping start()")
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("[START] Kafka consumer task created")

    async def stop(self):
        """Gracefully shut down the consumer and its background task."""
        self._running = False

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._consumer:
            try:
                self._consumer.close()
            except Exception:
                pass
            self._consumer = None

        logger.info("[STOP] Kafka consumer stopped")

    # ── Connection ───────────────────────────────────────────────────────

    def _connect(self) -> bool:
        """
        Create a KafkaConsumer instance.
        Returns True on success, False if broker is unreachable.
        """
        try:
            from kafka import KafkaConsumer
            from kafka.errors import NoBrokersAvailable

            self._consumer = KafkaConsumer(
                TOPIC,
                bootstrap_servers=KAFKA_SERVERS.split(","),
                group_id=GROUP_ID,
                auto_offset_reset="latest",
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                key_deserializer=lambda k: k.decode("utf-8") if k else None,
                consumer_timeout_ms=POLL_TIMEOUT_MS,
                session_timeout_ms=30_000,
                heartbeat_interval_ms=10_000,
            )
            logger.info(f"[OK] Kafka consumer connected to {KAFKA_SERVERS}")
            return True

        except Exception as e:
            logger.warning(f"[WARN] Kafka connection failed: {e}")
            self._consumer = None
            return False

    # ── Main loop ────────────────────────────────────────────────────────

    async def _run_loop(self):
        """
        Outer retry loop — keeps trying to connect to Kafka.
        Once connected, enters the inner poll loop.
        """
        attempt = 0
        loop = asyncio.get_event_loop()

        while self._running:
            attempt += 1

            # Try to connect
            connected = await loop.run_in_executor(None, self._connect)

            if not connected:
                if MAX_RECONNECT_ATTEMPTS and attempt >= MAX_RECONNECT_ATTEMPTS:
                    logger.error("[ERROR] Kafka: max reconnect attempts reached")
                    break
                logger.info(f"   Retrying Kafka in {RECONNECT_DELAY}s "
                            f"(attempt {attempt})...")
                await asyncio.sleep(RECONNECT_DELAY)
                continue

            # Connected — enter poll loop
            attempt = 0
            logger.info(f"[POLL] Consuming from topic '{TOPIC}'...")

            try:
                await self._poll_loop(loop)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"[WARN] Consumer error: {e} — reconnecting...")
                if self._consumer:
                    try:
                        self._consumer.close()
                    except Exception:
                        pass
                    self._consumer = None
                await asyncio.sleep(RECONNECT_DELAY)

    async def _poll_loop(self, loop):
        """
        Inner poll loop — reads messages from Kafka and processes them.
        Runs consumer.poll() in a thread pool to avoid blocking asyncio.
        """
        while self._running:
            # Poll in thread pool (blocking call)
            records = await loop.run_in_executor(
                None, self._poll_messages
            )

            if not records:
                # No messages — brief sleep then poll again
                await asyncio.sleep(0.1)
                continue

            # Process each message asynchronously
            for msg in records:
                if not self._running:
                    break
                try:
                    await self._process_message(msg)
                except Exception as e:
                    logger.error(f"   [ERROR] Message processing error: {e}")

    def _poll_messages(self) -> list:
        """
        Blocking poll — called from thread pool.
        Returns a flat list of ConsumerRecord objects.
        """
        if not self._consumer:
            return []

        try:
            raw = self._consumer.poll(timeout_ms=POLL_TIMEOUT_MS)
            messages = []
            for tp, records in raw.items():
                messages.extend(records)
            return messages
        except Exception:
            return []

    # ── Message processing pipeline ──────────────────────────────────────

    async def _process_message(self, msg):
        """
        Pipeline for each Kafka message:
          1. Parse and enrich the sensor reading
          2. Write to MongoDB
          3. Score with ML model
          4. Trigger alert if risk > threshold
        """
        reading = msg.value
        asset_id = reading.get("asset_id", "UNKNOWN")

        # 1. Enrich reading with datetime object for MongoDB
        if isinstance(reading.get("timestamp"), str):
            try:
                reading["timestamp"] = datetime.fromisoformat(
                    reading["timestamp"].replace("Z", "+00:00")
                )
            except Exception:
                reading["timestamp"] = datetime.utcnow()

        # 2. Write to database
        from db.crud import insert_sensor_reading
        await insert_sensor_reading(reading)

        # 3. ML risk scoring
        from services.model_loader import model_store
        try:
            risk_result = model_store.predict(asset_id, reading)
            risk_score = risk_result.get("risk_score", 0)
        except Exception as e:
            logger.debug(f"   ML scoring skipped for {asset_id}: {e}")
            return

        # 4. Persist risk score
        from db.crud import upsert_risk_score
        await upsert_risk_score({
            "asset_id":    asset_id,
            "risk_score":  risk_score,
            "risk_level":  risk_result.get("risk_level", "LOW"),
            "asset_type":  risk_result.get("asset_type", ""),
        })

        # 5. Alert if critical
        from config import settings
        if risk_score >= settings.RISK_THRESHOLD:
            from db.crud import alert_exists_recently
            from services.alert_service import send_alert

            # Dedup: skip if we alerted for this asset in the last 30 min
            already_alerted = await alert_exists_recently(asset_id, minutes=30)
            if not already_alerted:
                top_reason = "Kafka stream ML scoring"
                if risk_result.get("top_factors"):
                    top_reason = risk_result["top_factors"][0].get(
                        "description", top_reason
                    )

                # Fire n8n webhook
                await send_alert(
                    asset_id=asset_id,
                    risk_score=risk_score,
                    top_reason=top_reason,
                    asset_type=risk_result.get("asset_type", ""),
                )

                # Persist alert in DB
                from db.crud import insert_alert
                await insert_alert({
                    "alert_id":   f"KAFKA-{asset_id}-{int(datetime.utcnow().timestamp())}",
                    "asset_id":   asset_id,
                    "risk_score": risk_score,
                    "severity":   risk_result.get("risk_level", "HIGH"),
                    "top_reason": top_reason,
                    "timestamp":  datetime.utcnow(),
                    "source":     "kafka_consumer",
                    "sms_sent":   True,
                })

                logger.info(
                    f"[ALERT] {asset_id} — risk {risk_score:.1f} "
                    f"({risk_result.get('risk_level')})"
                )
            else:
                logger.debug(
                    f"   [SKIP] {asset_id} alert cooldown — skipped"
                )

        # Log a summary line
        status = "[CRIT]" if risk_score >= 75 else "[WARN]" if risk_score >= 50 else "[OK]"
        logger.info(
            f"   {status} {asset_id}: risk={risk_score:.1f} "
            f"| vib={reading.get('vibration_hz', 0):.1f} "
            f"| temp={reading.get('temperature_c', 0):.1f}"
        )


# ── Module-level singleton ───────────────────────────────────────────────────
kafka_consumer = KafkaSensorConsumer()
