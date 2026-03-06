import httpx
from config import settings


def get_severity(risk_score: float) -> str:
    if risk_score >= 80: return "CRITICAL"
    if risk_score >= 60: return "HIGH"
    if risk_score >= 40: return "MEDIUM"
    return "LOW"


def should_alert(risk_score: float) -> bool:
    return risk_score >= settings.RISK_THRESHOLD


async def send_alert(
    asset_id:   str,
    risk_score: float,
    top_reason: str,
    asset_type: str = "",
) -> bool:
    """
    POST alert payload to n8n webhook.
    Never crashes the app if n8n is unreachable.
    """
    if not settings.N8N_WEBHOOK_URL:
        print(f"[SKIP] N8N_WEBHOOK_URL not set — skipping alert for {asset_id}")
        return False

    payload = {
        "asset_id":   asset_id,
        "asset_type": asset_type,
        "risk_score": risk_score,
        "severity":   get_severity(risk_score),
        "top_reason": top_reason,
        "message": (
            f"[ALERT] INFRA ALERT: {asset_id} | "
            f"Risk: {risk_score:.1f}/100 | "
            f"Severity: {get_severity(risk_score)} | "
            f"Reason: {top_reason} | "
            f"Immediate inspection required."
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                settings.N8N_WEBHOOK_URL, json=payload)
            resp.raise_for_status()
            print(f"[OK] n8n alert sent — {asset_id} "
                  f"({get_severity(risk_score)})")
            return True
    except Exception as e:
        print(f"[FAIL] n8n alert failed (demo mode): {e}")
        return False