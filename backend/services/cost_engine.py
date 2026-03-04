REPAIR_COST_MULTIPLIERS = {
    "bridge":      {"base_preventive": 250_000, "reactive_multiplier": 7.4},
    "pipeline":    {"base_preventive": 180_000, "reactive_multiplier": 6.2},
    "road":        {"base_preventive": 120_000, "reactive_multiplier": 4.8},
    "transformer": {"base_preventive": 320_000, "reactive_multiplier": 8.1},
}
_DEFAULT = {"base_preventive": 200_000, "reactive_multiplier": 6.0}


def calculate_cost_of_inaction(
    asset_id:    str,
    asset_type:  str,
    risk_score:  float,
    delay_days:  int,
) -> dict:
    base = REPAIR_COST_MULTIPLIERS.get(asset_type.lower(), _DEFAULT)

    preventive   = base["base_preventive"]
    risk_factor  = 1 + (risk_score / 100) * 2
    delay_factor = 1 + (delay_days / 90) * 1.5
    reactive     = (preventive
                    * base["reactive_multiplier"]
                    * risk_factor
                    * delay_factor)
    savings = reactive - preventive
    roi     = (savings / preventive) * 100

    return {
        "asset_id":        asset_id,
        "preventive_cost": round(preventive),
        "reactive_cost":   round(reactive),
        "savings":         round(savings),
        "roi_percent":     round(roi, 1),
        "currency":        "INR",
    }