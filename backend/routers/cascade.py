from fastapi import APIRouter, HTTPException
from db.schemas import CascadeRequest
from db.crud import get_asset
from services.model_loader import model_store, extract_asset_type

router = APIRouter()

@router.post("/cascade")
async def cascade(req: CascadeRequest):
    try:
        extract_asset_type(req.asset_id)
    except ValueError as e:
        raise HTTPException(422, str(e))

    asset     = await get_asset(req.asset_id)
    connected = asset.get("connected_assets", []) if asset else []
    return model_store.get_cascade(req.asset_id, connected)