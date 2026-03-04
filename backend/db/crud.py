from datetime import datetime, timedelta
from typing import List, Optional
from db.database import get_db

# ── Sensor Readings ────────────────────────────────────────────────────────

async def insert_sensor_reading(reading: dict):
    db = get_db()
    await db.sensor_readings.insert_one(reading)

async def get_sensor_readings(asset_id: str, hours: int = 168) -> List[dict]:
    db = get_db()
    since = datetime.utcnow() - timedelta(hours=hours)
    cursor = db.sensor_readings.find(
        {"asset_id": asset_id, "timestamp": {"$gte": since}},
        {"_id": 0}
    ).sort("timestamp", -1).limit(1000)
    return await cursor.to_list(length=1000)

async def get_latest_reading(asset_id: str) -> Optional[dict]:
    db = get_db()
    return await db.sensor_readings.find_one(
        {"asset_id": asset_id},
        {"_id": 0},
        sort=[("timestamp", -1)]
    )

# ── Assets ─────────────────────────────────────────────────────────────────

async def get_all_assets() -> List[dict]:
    db = get_db()
    cursor = db.assets.find({}, {"_id": 0})
    return await cursor.to_list(length=100)

async def get_asset(asset_id: str) -> Optional[dict]:
    db = get_db()
    return await db.assets.find_one({"asset_id": asset_id}, {"_id": 0})

# ── Risk Scores ────────────────────────────────────────────────────────────

async def get_all_risk_scores() -> List[dict]:
    db = get_db()
    cursor = db.risk_scores.find({}, {"_id": 0})
    return await cursor.to_list(length=100)

async def get_risk_score(asset_id: str) -> Optional[dict]:
    db = get_db()
    return await db.risk_scores.find_one({"asset_id": asset_id}, {"_id": 0})

async def upsert_risk_score(data: dict):
    db = get_db()
    data["last_updated"] = datetime.utcnow()
    await db.risk_scores.update_one(
        {"asset_id": data["asset_id"]},
        {"$set": data},
        upsert=True
    )

# ── Anomalies ──────────────────────────────────────────────────────────────

async def get_anomalies(asset_id: str, limit: int = 50) -> List[dict]:
    db = get_db()
    cursor = db.sensor_readings.find(
        {"asset_id": asset_id, "anomaly_score": {"$gt": 0.5}},
        {"_id": 0, "timestamp": 1, "anomaly_score": 1}
    ).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)

# ── Alerts ─────────────────────────────────────────────────────────────────

async def get_all_alerts(limit: int = 100) -> List[dict]:
    db = get_db()
    cursor = db.alerts.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)

async def insert_alert(alert: dict):
    db = get_db()
    await db.alerts.insert_one(alert)

async def alert_exists_recently(asset_id: str, minutes: int = 30) -> bool:
    db = get_db()
    since = datetime.utcnow() - timedelta(minutes=minutes)
    doc = await db.alerts.find_one(
        {"asset_id": asset_id, "timestamp": {"$gte": since}}
    )
    return doc is not None

async def get_latest_readings_all_assets() -> list:
    """Returns the single most recent reading per asset — used by stream monitor."""
    db = get_db()
    pipeline = [
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$asset_id",
            "latest": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$project": {"_id": 0}}
    ]
    cursor = db.sensor_readings.aggregate(pipeline)
    return await cursor.to_list(length=100)