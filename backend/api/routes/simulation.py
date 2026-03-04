from fastapi import APIRouter
from db.schemas import SimulationRequest
from config import settings
import random

router = APIRouter()

FIXED = {"BRIDGE_001": 82.3, "PIPE_042": 61.7,
         "ROAD_012": 44.5, "TRANSFORMER_007": 77.9}

@router.post("")
async def simulate(req: SimulationRequest):
    base = FIXED.get(req.asset_id, 60.0)
    trajectory, critical_day = [], None
    for day in range(req.delay_days + 1):
        score = min(100, base + day * (40 / max(req.delay_days, 1)))
        score = round(score + random.gauss(0, 1.5), 1)
        trajectory.append({"day": day, "risk_score": score})
        if critical_day is None and score >= 80:
            critical_day = day
    return {"trajectory": trajectory, "critical_threshold_day": critical_day}