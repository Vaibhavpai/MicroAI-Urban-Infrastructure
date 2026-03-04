CARBON_FACTORS = {
    "bridge":      {"preventive_kg": 120, "reactive_kg": 890},
    "pipeline":    {"preventive_kg":  85, "reactive_kg": 620},
    "road":        {"preventive_kg":  60, "reactive_kg": 430},
    "transformer": {"preventive_kg":  95, "reactive_kg": 710},
}
_DEFAULT = {"preventive_kg": 100, "reactive_kg": 700}

TREES_PER_KG_CO2_PER_YEAR = 22  # 1 tree absorbs ~22kg CO2/year


def calculate_carbon_impact(asset_id: str, asset_type: str) -> dict:
    factors = CARBON_FACTORS.get(asset_type.lower(), _DEFAULT)
    saved   = factors["reactive_kg"] - factors["preventive_kg"]
    trees   = round(saved / TREES_PER_KG_CO2_PER_YEAR)
    return {
        "asset_id":          asset_id,
        "preventive_co2_kg": factors["preventive_kg"],
        "reactive_co2_kg":   factors["reactive_kg"],
        "co2_saved_kg":      saved,
        "trees_equivalent":  trees,
    }