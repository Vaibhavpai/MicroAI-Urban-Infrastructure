from fastapi import APIRouter, HTTPException
from db.crud import get_asset, get_risk_score, get_latest_reading
from services.model_loader import model_store, extract_asset_type
from typing import List

router = APIRouter()


async def _get_risk(asset_id: str) -> float:
    """Get risk score — stored first, fallback to live prediction."""
    doc = await get_risk_score(asset_id)
    if doc:
        return doc["risk_score"]
    reading = await get_latest_reading(asset_id) or {}
    result  = model_store.predict(asset_id, reading)
    return result["risk_score"]


def _cascade_risk(source_risk: float,
                  distance: int,
                  asset_type: str) -> float:
    """
    Cascade risk decays with distance and varies by asset type.
    Critical assets (bridge, transformer) propagate failure harder.
    """
    decay = {
        "bridge":      0.72,
        "transformer": 0.68,
        "pipeline":    0.60,
        "road":        0.55,
    }
    factor = decay.get(asset_type.lower(), 0.60)
    risk   = source_risk * (factor ** distance)
    return round(min(risk, 100.0), 1)


@router.get("/{asset_id}")
async def cascade(asset_id: str):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset {asset_id} not found")

    try:
        extract_asset_type(asset_id)
    except ValueError as e:
        raise HTTPException(422, str(e))

    source_risk = await _get_risk(asset_id)
    connected   = asset.get("connected_assets", [])
    asset_type  = asset["asset_type"]

    # Build cascade tree — up to depth 2
    affected    = []
    seen        = {asset_id}

    # Depth 1 — directly connected
    for cid in connected:
        if cid in seen:
            continue
        seen.add(cid)
        c_risk = _cascade_risk(source_risk, 1, asset_type)
        affected.append({
            "asset_id":    cid,
            "cascade_risk": c_risk,
            "distance":    1,
        })

        # Depth 2 — connected to connected
        child = await get_asset(cid)
        if child:
            for gcid in child.get("connected_assets", []):
                if gcid in seen or gcid == asset_id:
                    continue
                seen.add(gcid)
                gc_risk = _cascade_risk(source_risk, 2, asset_type)
                affected.append({
                    "asset_id":    gcid,
                    "cascade_risk": gc_risk,
                    "distance":    2,
                })

    # Sort by cascade risk descending
    affected.sort(key=lambda x: x["cascade_risk"], reverse=True)

    return {
        "source_asset":         asset_id,
        "source_risk_score":    source_risk,
        "asset_type":           asset_type,
        "affected_assets":      affected,
        "total_assets_at_risk": len(affected),
    }