from fastapi import APIRouter, HTTPException
from db.crud import get_asset
from services.carbon_service import calculate_carbon_impact

router = APIRouter()


@router.get("/{asset_id}")
async def carbon_impact(asset_id: str):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset {asset_id} not found")

    return calculate_carbon_impact(asset_id, asset["asset_type"])