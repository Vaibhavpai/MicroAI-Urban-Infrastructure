from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

client: AsyncIOMotorClient = None

def get_db():
    return client[settings.MONGO_DB]

async def connect_db():
    global client
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB]
    # Indexes for fast time-series queries
    await db.sensor_readings.create_index([("asset_id", 1), ("timestamp", -1)])
    await db.sensor_readings.create_index([("anomaly_score", 1)])
    await db.risk_scores.create_index([("asset_id", 1)], unique=True)
    await db.alerts.create_index([("timestamp", -1)])
    print("[OK] MongoDB connected")

async def close_db():
    if client:
        client.close()