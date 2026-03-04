from fastapi import APIRouter
from db.crud import get_all_risk_scores, get_asset
from config import settings

router = APIRouter()

STUB_SHAP = [
    {"feature": "vibration_hz",    "impact": 0.34, "direction": "increasing",
     "description": "Vibration 34% above baseline — structural fatigue risk"},
    {"feature": "moisture_pct",    "impact": 0.21, "direction": "increasing",
     "description": "Elevated moisture accelerating corrosion"},
    {"feature": "stress_load_kn",  "impact": 0.18, "direction": "stable",
     "description": "Load within normal operational range"},
]

FIXED = {"BRIDGE_001": 82.3, "PIPE_042": 61.7,
         "ROAD_012": 44.5, "TRANSFORMER_007": 77.9}

def risk_level(s): 
    return "CRITICAL" if s>=80 else "HIGH" if s>=60 else "MEDIUM" if s>=40 else "LOW"

@router.get("/risk-scores")
async def all_risk_scores():
    return await get_all_risk_scores()

@router.get("/predict/{asset_id}")
async def predict(asset_id: str):
    # ── STUB_MODE (flip to False at Hour 10 when Dev A models are ready) ──
    if settings.STUB_MODE:
        score = FIXED.get(asset_id, 65.0)
        return {
            "asset_id": asset_id,
            "risk_score": score,
            "confidence_lower": round(score - 7.2, 1),
            "confidence_upper": round(score + 6.8, 1),
            "risk_level": risk_level(score),
            "top_factors": STUB_SHAP,
        }
    # TODO Hour 10: from services.ml_service import ml_service
    # reading = await get_latest_reading(asset_id)
    # return ml_service.predict(asset_id, reading)