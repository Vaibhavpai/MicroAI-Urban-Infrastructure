from fastapi import APIRouter, HTTPException, Query
from db.crud import get_asset, get_risk_score, get_latest_reading
from services.cost_engine import calculate_cost_of_inaction
from services.model_loader import model_store, extract_asset_type

router = APIRouter()


@router.get("/{asset_id}")
async def cost_of_inaction(
    asset_id:   str,
    delay_days: int = Query(30, ge=1, le=365),
):
    # 1. Validate asset exists
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset {asset_id} not found")

    asset_type = asset["asset_type"]

    # 2. Risk score — stored first, fallback to live prediction
    risk_doc = await get_risk_score(asset_id)

    if risk_doc:
        risk_score = risk_doc["risk_score"]
        source     = "stored"
    else:
        # Fallback: run live prediction
        reading    = await get_latest_reading(asset_id) or {}
        result     = model_store.predict(asset_id, reading)
        risk_score = result["risk_score"]
        source     = "live"

    print(f"   Cost calc for {asset_id} | "
          f"risk={risk_score} ({source}) | delay={delay_days}d")

    return calculate_cost_of_inaction(
        asset_id, asset_type, risk_score, delay_days
    )