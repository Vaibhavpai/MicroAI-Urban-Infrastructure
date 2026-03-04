from fastapi import APIRouter, HTTPException
from db.schemas import RiskRequest
from db.crud import get_all_risk_scores, get_latest_reading, upsert_risk_score
from services.model_loader import model_store, extract_asset_type

router = APIRouter()

@router.get("/risk-scores")
async def all_risk_scores():
    return await get_all_risk_scores()

@router.post("/predict/risk")
async def predict_risk(req: RiskRequest):
    try:
        extract_asset_type(req.asset_id)
    except ValueError as e:
        raise HTTPException(422, str(e))

    reading = await get_latest_reading(req.asset_id) or {}
    result  = model_store.predict(req.asset_id, reading)

    # Persist updated risk score to MongoDB
    await upsert_risk_score({
        "asset_id":        result["asset_id"],
        "risk_score":      result["risk_score"],
        "confidence_lower": result["confidence_lower"],
        "confidence_upper": result["confidence_upper"],
        "risk_level":      result["risk_level"],
    })
    return result