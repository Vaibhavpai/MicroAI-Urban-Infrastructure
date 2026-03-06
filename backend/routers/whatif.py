from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, List
from services.model_loader import model_store

router = APIRouter()

class WhatIfRequest(BaseModel):
    asset_id: str
    base_sensor_reading: Dict[str, Any]
    modifications: Dict[str, Any]

@router.post("/whatif", response_model=Dict[str, Any])
async def predict_whatif(request: WhatIfRequest):
    """
    Simulates a what-if scenario by modifying specific sensor values
    and running them through the ML model to see the risk impact.
    """
    asset_id = request.asset_id
    base_reading = request.base_sensor_reading
    modifications = request.modifications
    
    # 1. Run baseline prediction
    baseline_result = model_store.predict(asset_id, base_reading)
    baseline_score = baseline_result.get("risk_score", 0.0)
    baseline_level = baseline_result.get("risk_level", "LOW")
    baseline_factors = baseline_result.get("top_factors", [])
    
    # 2. Apply modifications to create simulated reading
    modified_reading = dict(base_reading)
    modified_reading.update(modifications)
    
    # 3. Run simulated prediction
    modified_result = model_store.predict(asset_id, modified_reading)
    modified_score = modified_result.get("risk_score", 0.0)
    modified_level = modified_result.get("risk_level", "LOW")
    modified_factors = modified_result.get("top_factors", [])
    
    # 4. Compute differences
    risk_delta = round(modified_score - baseline_score, 1)
    level_changed = baseline_level != modified_level
    
    # Find most impactful change by finding the max difference in feature impact
    most_impactful_change = None
    max_impact_diff = -1
    
    # Simple heuristic to identify changed features
    for feature, new_val in modifications.items():
        orig_val = base_reading.get(feature)
        if orig_val is not None:
             # Find corresponding SHAP impact if available
             base_impact = 0
             mod_impact = 0
             for f in baseline_factors:
                 if f["feature"] == feature: base_impact = f["impact"]
             for f in modified_factors:
                 if f["feature"] == feature: mod_impact = f["impact"]
                 
             impact_diff = abs(mod_impact - base_impact) * 100 # roughly converting SHAP to point impact
             if impact_diff >= max_impact_diff:
                 max_impact_diff = impact_diff
                 # Directional risk contribution: assume if delta is positive, this helped it
                 # This is a simplification for demo purposes
                 sign = 1 if risk_delta > 0 else -1
                 val = round(abs(risk_delta) * (impact_diff / max(0.01, sum(abs(f["impact"]) for f in modified_factors)) ), 1) if modified_factors else risk_delta
                 
                 # Ensure we give a readable value
                 contrib = val if val > 0 else risk_delta
                 if list(modifications.keys())[0] == feature and most_impactful_change is None:
                     contrib = risk_delta
                 
                 most_impactful_change = {
                     "feature": feature,
                     "original_value": orig_val,
                     "modified_value": new_val,
                     "risk_contribution": risk_delta # Simply attribute full delta for demo realism if 1 var changed
                 }

    # If no logic matched, just use the first modification
    if not most_impactful_change and modifications:
        k, v = list(modifications.items())[0]
        most_impactful_change = {
            "feature": k,
            "original_value": base_reading.get(k),
            "modified_value": v,
            "risk_contribution": risk_delta
        }
        
    return {
        "asset_id": asset_id,
        "baseline_risk_score": baseline_score,
        "modified_risk_score": modified_score,
        "risk_delta": risk_delta,
        "baseline_risk_level": baseline_level,
        "modified_risk_level": modified_level,
        "level_changed": level_changed,
        "baseline_top_factors": baseline_factors,
        "modified_top_factors": modified_factors,
        "most_impactful_change": most_impactful_change
    }
