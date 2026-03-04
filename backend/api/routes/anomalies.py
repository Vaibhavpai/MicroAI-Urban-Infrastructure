from fastapi import APIRouter, Query
from db.crud import get_anomalies
from config import settings
import random
from datetime import datetime, timedelta

router = APIRouter()

@router.get("")
async def list_anomalies(asset_id: str = Query(...)):
    if settings.STUB_MODE:
        now = datetime.utcnow()
        ts = [str(now - timedelta(hours=i*3)) for i in range(5)]
        scores = [round(random.uniform(0.6, 0.95), 3) for _ in range(5)]
        return {"asset_id": asset_id,
                "anomaly_timestamps": ts,
                "anomaly_scores": scores}
    docs = await get_anomalies(asset_id)
    return {
        "asset_id": asset_id,
        "anomaly_timestamps": [str(d["timestamp"]) for d in docs],
        "anomaly_scores": [d["anomaly_score"] for d in docs],
    }