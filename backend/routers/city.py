from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from services.city_service import (
    get_city_comparison,
    get_city_summary,
    get_city_assets
)

router = APIRouter()

@router.get("/compare", response_model=Dict[str, Any])
async def read_city_comparison():
    """
    Returns aggregated health and risk data across 3 simulated cities.
    Used for the Multi-City Comparison Dashboard.
    """
    data = await get_city_comparison()
    return data

@router.get("/{city_id}/summary", response_model=Dict[str, Any])
async def read_city_summary(city_id: str):
    """
    Returns summary metrics for a specific city.
    """
    data = await get_city_summary(city_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    return data

@router.get("/{city_id}/assets", response_model=List[Dict[str, Any]])
async def read_city_assets(city_id: str):
    """
    Returns a list of assets belonging to the requested city along with their current risk scores.
    """
    data = await get_city_assets(city_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found or no assets")
    return data
