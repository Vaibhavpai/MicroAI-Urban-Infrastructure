"""
AI Recommendation endpoint — uses Google Gemini API to generate
prevention recommendations based on SHAP explainability values.
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

logger = logging.getLogger("ai_recommend")

router = APIRouter()

GEMINI_API_KEY = "AIzaSyCQhPWYBMfPylzBmef_3A-8v39HzgH3NcU"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
)


# ── Request / Response schemas ───────────────────────────────────────────────
class ShapFactor(BaseModel):
    feature: str
    impact: float
    direction: str
    description: str


class AIRecommendRequest(BaseModel):
    asset_id: str
    asset_type: str
    risk_score: float
    risk_level: str
    top_factors: List[ShapFactor]


class Recommendation(BaseModel):
    title: str
    severity: str          # "critical" | "high" | "medium" | "low"
    prevention: str
    timeline: str
    estimated_impact: str


class AIRecommendResponse(BaseModel):
    asset_id: str
    recommendations: List[Recommendation]
    summary: str


# ── Prompt builder ───────────────────────────────────────────────────────────
def _build_prompt(req: AIRecommendRequest) -> str:
    factors_text = "\n".join(
        f"  - Feature: {f.feature}, SHAP Impact: {f.impact:.4f}, "
        f"Direction: {f.direction}, Detail: {f.description}"
        for f in req.top_factors
    )

    return f"""You are an expert infrastructure maintenance engineer and predictive-analytics advisor.

CONTEXT:
- Asset ID: {req.asset_id}
- Asset Type: {req.asset_type} (urban infrastructure)
- Current Risk Score: {req.risk_score}/100
- Risk Level: {req.risk_level}

SHAP EXPLAINABILITY VALUES (top contributing features to the risk prediction):
{factors_text}

TASK:
Based on the SHAP values above, generate exactly 4 actionable prevention recommendations.
Each recommendation must directly address one or more of the SHAP contributing features.

For each recommendation provide:
1. "title" — short actionable title (max 8 words)
2. "severity" — one of: "critical", "high", "medium", "low"
3. "prevention" — a detailed prevention action (2-3 sentences) specific to the asset type and the SHAP features
4. "timeline" — when to execute (e.g. "Immediate", "Within 48 hours", "Weekly", "Monthly")
5. "estimated_impact" — expected risk reduction (e.g. "Could reduce risk by 15-20%")

Also provide a "summary" field with a 1-2 sentence overall assessment.

Respond ONLY in valid JSON with this exact structure (no markdown, no code fences):
{{
  "recommendations": [
    {{
      "title": "...",
      "severity": "...",
      "prevention": "...",
      "timeline": "...",
      "estimated_impact": "..."
    }}
  ],
  "summary": "..."
}}"""


def _get_fallback_recommendations(req: AIRecommendRequest) -> AIRecommendResponse:
    recs = []
    for f in req.top_factors[:4]:
        severity = "high" if f.impact > 0.3 else ("medium" if f.impact > 0.15 else "low")
        timeline = "Immediate" if severity == "high" else "Within 7 days"
        recs.append(Recommendation(
            title=f"Inspect {f.feature.replace('_', ' ')}",
            severity=severity,
            prevention=f"System detected abnormal {f.direction} pattern in {f.feature}. Check sensor calibration and component wear.",
            timeline=timeline,
            estimated_impact=f"Could reduce risk contribution."
        ))
    
    return AIRecommendResponse(
        asset_id=req.asset_id,
        recommendations=recs,
        summary="AI service rate-limited. Serving standard proactive maintenance rules based on SHAP diagnostic factors."
    )


# ── Endpoint ─────────────────────────────────────────────────────────────────
@router.post("/ai-recommend", response_model=AIRecommendResponse)
async def ai_recommend(req: AIRecommendRequest):
    prompt = _build_prompt(req)

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1024,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(GEMINI_URL, json=payload)
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"Gemini API error: {e.response.status_code} — {e.response.text}")
        return _get_fallback_recommendations(req)
    except httpx.RequestError as e:
        logger.error(f"Gemini request failed: {e}")
        return _get_fallback_recommendations(req)
    except Exception as e:
        logger.error(f"Unexpected error in Gemini API call: {e}")
        return _get_fallback_recommendations(req)

    body = resp.json()
    raw_text = (
        body.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )

    # Parse the JSON from Gemini's response
    import json
    # Strip any stray markdown fences if Gemini adds them
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1]  # remove first line
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("\n", 1)[0]  # remove last line
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse Gemini response: {raw_text[:500]}")
        return _get_fallback_recommendations(req)

    return AIRecommendResponse(
        asset_id=req.asset_id,
        recommendations=parsed.get("recommendations", []),
        summary=parsed.get("summary", ""),
    )
