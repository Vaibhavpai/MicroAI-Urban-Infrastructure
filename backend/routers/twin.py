from fastapi import APIRouter, HTTPException
from db.schemas import SimulationRequest
from db.crud import get_latest_reading
from services.model_loader import model_store, extract_asset_type

router = APIRouter()

@router.post("/twin")
async def digital_twin(req: SimulationRequest):
    try:
        extract_asset_type(req.asset_id)
    except ValueError as e:
        raise HTTPException(422, str(e))

    reading = await get_latest_reading(req.asset_id) or {}
    return model_store.simulate_trajectory(
        req.asset_id, reading, req.delay_days)