from fastapi import APIRouter, HTTPException, Query
from db.crud import get_all_assets, get_asset, get_sensor_readings, get_latest_readings_all_assets

router = APIRouter()

@router.get("")
async def list_assets():
    return await get_all_assets()

# ✅ Static routes MUST come before /{asset_id}
@router.get("/stream/status")
async def stream_status():
    latest = await get_latest_readings_all_assets()
    return {
        "stream_active": True,
        "assets_reporting": len(latest),
        "latest_readings": latest
    }

# ⚠️ Dynamic route always goes last
@router.get("/{asset_id}")
async def get_asset_detail(asset_id: str):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset {asset_id} not found")
    return asset

@router.get("/{asset_id}/sensors")
async def get_sensor_data(asset_id: str, hours: int = Query(168)):
    return await get_sensor_readings(asset_id, hours)