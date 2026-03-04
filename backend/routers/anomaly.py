from fastapi import APIRouter, HTTPException
from db.schemas import AnomalyRequest
from db.crud import get_sensor_readings
from services.model_loader import model_store, extract_asset_type

router = APIRouter()

@router.post("/anomaly")
async def detect_anomaly(req: AnomalyRequest):
    try:
        extract_asset_type(req.asset_id)
    except ValueError as e:
        raise HTTPException(422, str(e))

    readings = await get_sensor_readings(req.asset_id, hours=24)
    return model_store.detect_anomalies(req.asset_id, readings)