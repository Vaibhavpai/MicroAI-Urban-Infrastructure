"""
Kafka Sensor Producer — Standalone Script
==========================================
Fetches all assets from MongoDB on startup, then generates
asset-type-specific sensor readings every 5 seconds and publishes
each as a JSON message to the "sensor-readings" Kafka topic.

Each asset TYPE has its own unique set of sensors:
  - bridge:       vibration_hz, deflection_mm, stress_load_kn, wind_speed_kmh, crack_width_mm, acoustic_emission_db
  - pipeline:     flow_rate_lps, pressure_bar, temperature_c, corrosion_mm, moisture_pct, ph_level
  - road:         surface_temp_c, rutting_depth_mm, traffic_load_kn, moisture_pct, roughness_iri, deflection_mm
  - transformer:  oil_temp_c, winding_temp_c, load_pct, dissolved_gas_ppm, vibration_hz, humidity_pct

Run:  python -m stream.kafka_producer   (from backend/)
  or: python stream/kafka_producer.py
"""

import os
import sys
import json
import time
import random
import signal
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

# ── Kafka bootstrap ──────────────────────────────────────────────────────────
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC = "sensor-readings"
PUBLISH_INTERVAL = 5  # seconds

# ── Sensor definitions per asset type ────────────────────────────────────────
# Each asset type has 6 sensors with baseline values, noise std devs, and
# which sensors degrade over time for degrading assets.

SENSOR_PROFILES = {
    "bridge": {
        "sensors": {
            "vibration_hz":         {"baseline": 55,   "noise": 5,    "unit": "Hz"},
            "deflection_mm":        {"baseline": 12.5, "noise": 1.5,  "unit": "mm"},
            "stress_load_kn":       {"baseline": 520,  "noise": 50,   "unit": "kN"},
            "wind_speed_kmh":       {"baseline": 18,   "noise": 4,    "unit": "km/h"},
            "crack_width_mm":       {"baseline": 0.3,  "noise": 0.05, "unit": "mm"},
            "acoustic_emission_db": {"baseline": 44,   "noise": 4,    "unit": "dB"},
        },
        "degrade_sensors": ["vibration_hz", "crack_width_mm", "deflection_mm"],
    },
    "pipeline": {
        "sensors": {
            "flow_rate_lps": {"baseline": 85,   "noise": 8,   "unit": "L/s"},
            "pressure_bar":  {"baseline": 12.0, "noise": 1.0, "unit": "bar"},
            "temperature_c": {"baseline": 26,   "noise": 3,   "unit": "°C"},
            "corrosion_mm":  {"baseline": 1.2,  "noise": 0.1, "unit": "mm"},
            "moisture_pct":  {"baseline": 35,   "noise": 5,   "unit": "%"},
            "ph_level":      {"baseline": 7.2,  "noise": 0.3, "unit": "pH"},
        },
        "degrade_sensors": ["corrosion_mm", "pressure_bar"],
    },
    "road": {
        "sensors": {
            "surface_temp_c":   {"baseline": 38,   "noise": 3,    "unit": "°C"},
            "rutting_depth_mm": {"baseline": 6.5,  "noise": 0.8,  "unit": "mm"},
            "traffic_load_kn":  {"baseline": 450,  "noise": 40,   "unit": "kN"},
            "moisture_pct":     {"baseline": 25,   "noise": 5,    "unit": "%"},
            "roughness_iri":    {"baseline": 2.8,  "noise": 0.3,  "unit": "IRI"},
            "deflection_mm":    {"baseline": 0.45, "noise": 0.05, "unit": "mm"},
        },
        "degrade_sensors": ["rutting_depth_mm", "roughness_iri"],
    },
    "transformer": {
        "sensors": {
            "oil_temp_c":        {"baseline": 62,  "noise": 4,  "unit": "°C"},
            "winding_temp_c":    {"baseline": 78,  "noise": 5,  "unit": "°C"},
            "load_pct":          {"baseline": 72,  "noise": 6,  "unit": "%"},
            "dissolved_gas_ppm": {"baseline": 120, "noise": 15, "unit": "ppm"},
            "vibration_hz":      {"baseline": 52,  "noise": 5,  "unit": "Hz"},
            "humidity_pct":      {"baseline": 35,  "noise": 4,  "unit": "%"},
        },
        "degrade_sensors": ["oil_temp_c", "winding_temp_c", "dissolved_gas_ppm"],
    },
    "hospital": {
        "sensors": {
            "power_supply_v":            {"baseline": 230, "noise": 5,   "unit": "V"},
            "backup_generator_fuel_pct": {"baseline": 90,  "noise": 2,   "unit": "%"},
            "oxygen_pressure_bar":       {"baseline": 4.5, "noise": 0.2, "unit": "bar"},
            "hvac_air_quality_aqi":      {"baseline": 30,  "noise": 5,   "unit": "AQI"},
            "structural_vibration_hz":   {"baseline": 15,  "noise": 2,   "unit": "Hz"},
            "water_supply_pressure_bar": {"baseline": 3.0, "noise": 0.3, "unit": "bar"},
        },
        "degrade_sensors": ["oxygen_pressure_bar", "power_supply_v", "backup_generator_fuel_pct"],
    },
}

# ── State ────────────────────────────────────────────────────────────────────
_assets = []                # populated from MongoDB at startup
_reading_count = {}         # per-asset reading counter
_degradation_factor = {}    # per-asset multiplier (starts at 1.0)
_running = True

# Pick some assets to degrade (highest criticality or oldest)
_degrading_asset_ids = set()


def _init_state():
    """Initialize counters and degradation factors for all assets."""
    for a in _assets:
        aid = a["asset_id"]
        _reading_count[aid] = 0
        _degradation_factor[aid] = 1.0

    # Pick top 2-3 highest-criticality assets as degrading
    sorted_assets = sorted(_assets, key=lambda x: x.get("criticality", 0), reverse=True)
    for a in sorted_assets[:3]:
        _degrading_asset_ids.add(a["asset_id"])


def _update_degradation(asset_id: str):
    """
    Every 20 readings, increase degradation factor by 0.02
    for degrading assets. All others stay at 1.0.
    """
    _reading_count[asset_id] += 1
    if asset_id in _degrading_asset_ids:
        if _reading_count[asset_id] % 20 == 0:
            _degradation_factor[asset_id] += 0.02
            print(f"   ⚡ {asset_id} degradation factor → "
                  f"{_degradation_factor[asset_id]:.2f} "
                  f"(reading #{_reading_count[asset_id]})")


def generate_reading(asset_doc: dict) -> dict:
    """
    Generate a single sensor reading for an asset.
    Uses the asset's type to determine which sensors to emit.
    """
    asset_id = asset_doc["asset_id"]
    asset_type = asset_doc.get("asset_type", "bridge")
    profile = SENSOR_PROFILES.get(asset_type, SENSOR_PROFILES["bridge"])

    df = _degradation_factor.get(asset_id, 1.0)
    degrade_keys = profile["degrade_sensors"]

    # 5% chance of anomaly spike on any reading
    anomaly = random.random() < 0.05
    spike = 2.5 if anomaly else 1.0

    reading = {
        "asset_id": asset_id,
        "asset_type": asset_type,
        "city": asset_doc.get("city", "Unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    for sensor_key, sensor_cfg in profile["sensors"].items():
        baseline = sensor_cfg["baseline"]
        noise_std = sensor_cfg["noise"]
        # Apply degradation factor only to degradation-affected sensors
        factor = df if sensor_key in degrade_keys else 1.0
        value = random.gauss(baseline * spike * factor, noise_std)
        reading[sensor_key] = round(value, 3)

    _update_degradation(asset_id)
    return reading


def _shutdown_handler(signum, frame):
    global _running
    print("\n🛑 Shutdown signal received — stopping producer...")
    _running = False


def _fetch_assets_from_mongo():
    """Synchronously fetch all assets from MongoDB."""
    from config import settings

    async def _fetch():
        client = AsyncIOMotorClient(settings.MONGO_URI)
        db = client[settings.MONGO_DB]
        assets = await db.assets.find({}, {"_id": 0}).to_list(length=500)
        client.close()
        return assets

    return asyncio.run(_fetch())


def main():
    """Main producer loop — publishes to Kafka every PUBLISH_INTERVAL seconds."""
    global _running, _assets

    # Graceful shutdown on Ctrl+C / SIGTERM
    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    # ── Fetch assets from MongoDB ────────────────────────────────────────
    print("📦 Fetching assets from MongoDB...")
    try:
        _assets = _fetch_assets_from_mongo()
    except Exception as e:
        print(f"❌ Failed to fetch assets from MongoDB: {e}")
        sys.exit(1)

    if not _assets:
        print("❌ No assets found in MongoDB. Run seed first or add assets.")
        sys.exit(1)

    # Show what we found
    asset_types = {}
    for a in _assets:
        t = a.get("asset_type", "unknown")
        asset_types[t] = asset_types.get(t, 0) + 1

    print(f"✅ Loaded {len(_assets)} assets from MongoDB:")
    for t, count in sorted(asset_types.items()):
        print(f"   • {t}: {count} assets")
    print()

    _init_state()
    print(f"   Degrading assets (top criticality): {', '.join(_degrading_asset_ids)}")

    # ── Create Kafka producer ────────────────────────────────────────────
    try:
        from kafka import KafkaProducer
        from kafka.errors import NoBrokersAvailable
    except ImportError:
        print("❌ kafka-python not installed. Run: pip install kafka-python")
        sys.exit(1)

    print(f"🔌 Connecting to Kafka: {KAFKA_SERVERS}")
    max_retries = 10
    producer = None

    for attempt in range(1, max_retries + 1):
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_SERVERS.split(","),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                acks="all",
                retries=3,
                linger_ms=10,
            )
            print(f"✅ Kafka producer connected (attempt {attempt})")
            break
        except NoBrokersAvailable:
            wait = min(attempt * 2, 30)
            print(f"   ⏳ Kafka not ready (attempt {attempt}/{max_retries}), "
                  f"retrying in {wait}s...")
            time.sleep(wait)

    if producer is None:
        print("❌ Could not connect to Kafka after retries. Exiting.")
        sys.exit(1)

    # ── Produce loop ─────────────────────────────────────────────────────
    print(f"\n📡 Publishing to topic '{TOPIC}' every {PUBLISH_INTERVAL}s "
          f"for {len(_assets)} assets")
    print(f"   Press Ctrl+C to stop\n")

    batch_num = 0
    while _running:
        batch_num += 1
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")

        for asset_doc in _assets:
            reading = generate_reading(asset_doc)
            producer.send(
                TOPIC,
                key=asset_doc["asset_id"],
                value=reading,
            )

        producer.flush()
        print(f"   [{ts}] Batch #{batch_num} — {len(_assets)} readings published")

        # Sleep in small increments so we catch shutdown signals quickly
        for _ in range(PUBLISH_INTERVAL * 10):
            if not _running:
                break
            time.sleep(0.1)

    # ── Cleanup ──────────────────────────────────────────────────────────
    producer.flush()
    producer.close()
    print("✅ Producer shut down cleanly.")


if __name__ == "__main__":
    main()
