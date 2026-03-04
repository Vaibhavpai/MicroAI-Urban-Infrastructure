from fastapi import APIRouter, HTTPException
from db.crud import get_asset
from services.weather_service import (
    get_weather,
    calculate_weather_risk_multiplier,
    calculate_correlation_score,
    build_risk_note,
)

router = APIRouter()


@router.get("/{asset_id}")
async def weather_risk(asset_id: str):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset {asset_id} not found")

    lat        = asset["location_lat"]
    lng        = asset["location_lng"]
    asset_type = asset["asset_type"]

    # Live call to Open-Meteo
    weather    = await get_weather(lat, lng)
    multiplier = calculate_weather_risk_multiplier(weather)
    corr_score = calculate_correlation_score(asset_type, weather)
    risk_note  = build_risk_note(asset_type, weather, multiplier)

    return {
        "asset_id":                asset_id,
        "current_weather":         weather,
        "weather_risk_multiplier": multiplier,
        "correlation_score":       corr_score,
        "risk_note":               risk_note,
    }