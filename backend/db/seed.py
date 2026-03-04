"""Run once: python -m db.seed"""
import asyncio, random
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

ASSETS = [
    {"asset_id": "BRIDGE_001",      "asset_type": "bridge",
     "location_lat": 19.0760, "location_lng": 72.8777,
     "age_years": 32, "criticality": 5,
     "last_maintenance_date": "2023-08-15",
     "connected_assets": ["ROAD_012", "PIPE_042"]},
    {"asset_id": "PIPE_042",        "asset_type": "pipeline",
     "location_lat": 19.0820, "location_lng": 72.8830,
     "age_years": 18, "criticality": 4,
     "last_maintenance_date": "2024-01-10",
     "connected_assets": ["BRIDGE_001", "TRANSFORMER_007"]},
    {"asset_id": "ROAD_012",        "asset_type": "road",
     "location_lat": 19.0700, "location_lng": 72.8700,
     "age_years": 8,  "criticality": 3,
     "last_maintenance_date": "2024-03-22",
     "connected_assets": ["BRIDGE_001"]},
    {"asset_id": "TRANSFORMER_007", "asset_type": "transformer",
     "location_lat": 19.0900, "location_lng": 72.8900,
     "age_years": 14, "criticality": 5,
     "last_maintenance_date": "2023-11-05",
     "connected_assets": ["PIPE_042"]},
]

RISK_SEED = {
    "BRIDGE_001":      (82.3, "CRITICAL"),
    "PIPE_042":        (61.7, "HIGH"),
    "ROAD_012":        (44.5, "MEDIUM"),
    "TRANSFORMER_007": (77.9, "HIGH"),
}

def make_reading(asset_id, ts, anomaly=False):
    m = 3 if anomaly else 1
    return {
        "asset_id": asset_id, "timestamp": ts,
        "vibration_hz":         random.gauss(50 + (10 if anomaly else 0), 5*m),
        "temperature_c":        random.gauss(28, 3*m),
        "stress_load_kn":       random.gauss(500, 50*m),
        "moisture_pct":         random.gauss(30 + (15 if anomaly else 0), 5*m),
        "acoustic_emission_db": random.gauss(40, 4*m),
        "pressure_bar":         random.gauss(10, 1*m),
        "label":         1 if anomaly else 0,
        "anomaly_score": random.uniform(0.6, 0.95) if anomaly else random.uniform(0, 0.2),
    }

async def seed():
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB]

    for col in ["assets", "sensor_readings", "risk_scores", "alerts"]:
        await db[col].drop()

    await db.assets.insert_many(ASSETS)
    print(f"✅ Inserted {len(ASSETS)} assets")

    readings, now = [], datetime.utcnow()
    for a in ASSETS:
        for i in range(1008):   # 7 days × every 10 min
            ts = now - timedelta(minutes=10*i)
            readings.append(make_reading(a["asset_id"], ts, random.random() < 0.05))
    await db.sensor_readings.insert_many(readings)
    print(f"✅ Inserted {len(readings)} sensor readings")

    rs = [{"asset_id": aid, "risk_score": score,
           "confidence_lower": round(score-7.2, 1),
           "confidence_upper": round(score+6.8, 1),
           "risk_level": level, "last_updated": now}
          for aid, (score, level) in RISK_SEED.items()]
    await db.risk_scores.insert_many(rs)
    print(f"✅ Inserted risk scores")

    alerts = [
        {"alert_id": "ALT_0001", "asset_id": "BRIDGE_001",
         "risk_score": 82.3, "severity": "CRITICAL",
         "top_reason": "Vibration 42% above baseline",
         "sms_sent": False, "timestamp": now - timedelta(minutes=15)},
        {"alert_id": "ALT_0002", "asset_id": "TRANSFORMER_007",
         "risk_score": 77.9, "severity": "HIGH",
         "top_reason": "Temperature spike detected",
         "sms_sent": False, "timestamp": now - timedelta(minutes=5)},
    ]
    await db.alerts.insert_many(alerts)
    print(f"✅ Inserted seed alerts")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())