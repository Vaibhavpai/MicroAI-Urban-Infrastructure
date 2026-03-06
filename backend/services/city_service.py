"""
City Service
============
Manages multi-city configurations and aggregated data for the 
Multi-City Comparison Dashboard. Ties into existing risk scores.
"""

from db.crud import get_all_assets, get_risk_score
from services.cost_engine import calculate_cost_of_inaction
from services.carbon_service import calculate_carbon_impact

CITIES = {
    "mumbai": {
        "name": "Mumbai",
        "lat": 19.076,
        "lng": 72.877,
        "assets": ["BRIDGE_001", "PIPE_042", "ROAD_012", "TRANSFORMER_007"],
        "population_millions": 20.7,
        "infrastructure_age_avg": 28,
        "federated_model_accuracy": 0.89
    },
    "delhi": {
        "name": "Delhi",
        "lat": 28.613,
        "lng": 77.209,
        "assets": ["BRIDGE_002", "PIPE_043", "ROAD_013", "TRANSFORMER_008"],
        "population_millions": 32.9,
        "infrastructure_age_avg": 34,
        "federated_model_accuracy": 0.86
    },
    "bangalore": {
        "name": "Bangalore",
        "lat": 12.971,
        "lng": 77.594,
        "assets": ["BRIDGE_001", "ROAD_012", "TRANSFORMER_007"], # Shared/duplicate IDs for demo
        "population_millions": 13.2,
        "infrastructure_age_avg": 19,
        "federated_model_accuracy": 0.92
    }
}

async def get_city_summary(city_id: str) -> dict:
    if city_id not in CITIES:
        return None
    
    city_config = CITIES[city_id]
    asset_ids = city_config["assets"]
    
    total_assets = len(asset_ids)
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    total_risk = 0.0
    highest_risk_score = -1
    highest_risk_asset = "None"
    
    total_co2_saved_kg = 0
    total_savings_inr = 0

    for aid in asset_ids:
        # Get risk score
        risk_doc = await get_risk_score(aid)
        score = risk_doc["risk_score"] if risk_doc else 35.0  # fallback
        
        total_risk += score
        
        if score > highest_risk_score:
            highest_risk_score = score
            highest_risk_asset = aid
            
        if score >= 80: critical_count += 1
        elif score >= 60: high_count += 1
        elif score >= 40: medium_count += 1
        else: low_count += 1
            
        # Cost savings (proactive vs reactive for 30 day delay)
        asset_type = aid.split('_')[0]
        cost_impact = calculate_cost_of_inaction(aid, asset_type, score, 30)
        total_savings_inr += cost_impact["savings"]
        
        # Carbon savings
        carbon_impact = calculate_carbon_impact(aid, asset_type)
        total_co2_saved_kg += carbon_impact["co2_saved_kg"]
        
    avg_risk = total_risk / total_assets if total_assets > 0 else 0

    return {
        "city_id": city_id,
        "city_name": city_config["name"],
        "lat": city_config["lat"],
        "lng": city_config["lng"],
        "total_assets": total_assets,
        "critical_count": critical_count,
        "high_count": high_count,
        "medium_count": medium_count,
        "low_count": low_count,
        "average_risk_score": round(avg_risk, 1),
        "highest_risk_asset": highest_risk_asset,
        "highest_risk_score": highest_risk_score,
        "total_co2_saved_kg": total_co2_saved_kg,
        "total_savings_inr": total_savings_inr,
        "federated_model_accuracy": city_config["federated_model_accuracy"],
        "alerts_last_24h": critical_count * 2 + high_count # Fake metric for demo
    }

async def get_city_comparison() -> dict:
    cities_data = []
    total_assets_monitored = 0
    total_risk = 0
    total_critical = 0
    
    for city_id in CITIES:
        summary = await get_city_summary(city_id)
        if summary:
            cities_data.append(summary)
            total_assets_monitored += summary["total_assets"]
            total_risk += summary["average_risk_score"] * summary["total_assets"]
            total_critical += summary["critical_count"]
            
    national_avg = total_risk / total_assets_monitored if total_assets_monitored > 0 else 0
    
    return {
        "cities": cities_data,
        "national_average_risk": round(national_avg, 1),
        "total_assets_monitored": total_assets_monitored,
        "total_critical_nationally": total_critical
    }

async def get_city_assets(city_id: str) -> list:
    if city_id not in CITIES:
        return []
        
    asset_ids = CITIES[city_id]["assets"]
    enriched_assets = []
    
    for aid in asset_ids:
        risk_doc = await get_risk_score(aid)
        score = risk_doc["risk_score"] if risk_doc else 35.0
        
        enriched_assets.append({
            "asset_id": aid,
            "asset_type": aid.split("_")[0],
            "risk_score": score,
            "city": CITIES[city_id]["name"]
        })
        
    # Sort by risk descending
    return sorted(enriched_assets, key=lambda x: x["risk_score"], reverse=True)
