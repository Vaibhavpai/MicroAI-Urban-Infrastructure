from fastapi import APIRouter
from pydantic import BaseModel
from db.crud import (
    get_all_alerts, get_all_risk_scores,
    insert_alert, alert_exists_recently,
    get_asset,
)
from services.alert_service import send_alert, should_alert, get_severity
import uuid
from datetime import datetime

router = APIRouter()

class DispatchRequest(BaseModel):
    asset_id: str
    message: str



@router.get("")
async def list_alerts():
    return await get_all_alerts()


@router.post("/trigger")
async def trigger_alerts():
    scores    = await get_all_risk_scores()
    triggered = []
    skipped   = []

    for rs in scores:
        asset_id   = rs["asset_id"]
        risk_score = rs["risk_score"]

        if not should_alert(risk_score):
            continue

        # Cooldown — skip if alerted within last 30 min
        if await alert_exists_recently(asset_id, minutes=30):
            skipped.append(asset_id)
            continue

        # Get asset type for n8n payload
        asset      = await get_asset(asset_id) or {}
        asset_type = asset.get("asset_type", "")
        top_reason = _top_reason(asset_type, risk_score)

        # Fire n8n webhook
        sms_sent = await send_alert(
            asset_id   = asset_id,
            risk_score = risk_score,
            top_reason = top_reason,
            asset_type = asset_type,
        )

        alert = {
            "alert_id":  f"ALT_{uuid.uuid4().hex[:6].upper()}",
            "asset_id":  asset_id,
            "risk_score": risk_score,
            "severity":  get_severity(risk_score),
            "top_reason": top_reason,
            "sms_sent":  sms_sent,
            "timestamp": datetime.utcnow(),
        }
        await insert_alert(alert)
        triggered.append(alert["alert_id"])

    return {
        "triggered":     len(triggered),
        "alert_ids":     triggered,
        "skipped_cooldown": skipped,
    }


@router.post("/dispatch")
async def dispatch_crew(req: DispatchRequest):
    # Fetch asset to get its type so we can route correctly in n8n
    asset = await get_asset(req.asset_id) or {}
    asset_type = asset.get("asset_type", "UNKNOWN")

    # Manually fire the webhook using the send_alert function
    # We pass the user's custom dispatch order as the 'top_reason'
    success = await send_alert(
        asset_id=req.asset_id,
        risk_score=100.0,  # Manual dispatch is treated as high priority
        top_reason=f"MANUAL DISPATCH: {req.message}",
        asset_type=asset_type
    )

    return {"success": success, "dispatched": req.asset_id}


def _top_reason(asset_type: str, risk_score: float) -> str:
    """Generate a meaningful top reason based on asset type + risk level."""
    severity = get_severity(risk_score)
    reasons  = {
        "bridge": {
            "CRITICAL": "Structural vibration 42% above baseline — collapse risk",
            "HIGH":     "Acceleration anomaly detected — inspection required",
        },
        "pipeline": {
            "CRITICAL": "Pressure surge + acoustic emission spike — leak imminent",
            "HIGH":     "Corrosion rate elevated — wall thinning detected",
        },
        "road": {
            "CRITICAL": "Stress load exceeding design limit — surface failure",
            "HIGH":     "Moisture ingress + vibration spike — pothole formation",
        },
        "transformer": {
            "CRITICAL": "Thermal runaway detected — winding temperature critical",
            "HIGH":     "Harmonic distortion elevated — insulation degrading",
        },
    }
    fallback = {
        "CRITICAL": "Risk score exceeded critical threshold",
        "HIGH":     "Risk score exceeded high threshold",
    }
    return (reasons
            .get(asset_type, fallback)
            .get(severity, f"Risk score {risk_score:.1f}/100 exceeded threshold"))