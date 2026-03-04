import httpx
from typing import Optional


async def get_weather(lat: float, lng: float) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        f"&current=temperature_2m,precipitation,"
        f"relative_humidity_2m,wind_speed_10m"
        f"&forecast_days=1"
    )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            c    = data["current"]
            return {
                "temperature_c":    c["temperature_2m"],
                "precipitation_mm": c["precipitation"],
                "humidity_pct":     c["relative_humidity_2m"],
                "wind_speed_kmh":   c["wind_speed_10m"],
            }
    except Exception as e:
        print(f"⚠️  Open-Meteo unavailable ({e}) — using fallback")
        return {
            "temperature_c":    32.0,
            "precipitation_mm":  2.0,
            "humidity_pct":     72.0,
            "wind_speed_kmh":   18.0,
        }


def calculate_weather_risk_multiplier(weather: dict) -> float:
    multiplier = 1.0
    if weather["precipitation_mm"] > 5:
        multiplier += 0.25
    if weather["temperature_c"] > 38 or weather["temperature_c"] < 5:
        multiplier += 0.15
    if weather["humidity_pct"] > 80:
        multiplier += 0.10
    if weather["wind_speed_kmh"] > 60:
        multiplier += 0.10
    return round(multiplier, 2)


def calculate_correlation_score(asset_type: str, weather: dict) -> float:
    """
    How strongly does current weather correlate with failure risk
    for this asset type.
    """
    base = 0.50
    if asset_type == "bridge":
        # Wind + rain affect bridges most
        if weather["wind_speed_kmh"] > 40:   base += 0.20
        if weather["precipitation_mm"] > 5:  base += 0.15
        if weather["temperature_c"] > 38:    base += 0.10
    elif asset_type == "pipeline":
        # Temperature extremes + moisture
        if weather["temperature_c"] < 5:     base += 0.20
        if weather["humidity_pct"] > 80:     base += 0.15
        if weather["precipitation_mm"] > 10: base += 0.10
    elif asset_type == "road":
        # Rain + freeze-thaw
        if weather["precipitation_mm"] > 5:  base += 0.20
        if weather["temperature_c"] < 5:     base += 0.20
        if weather["humidity_pct"] > 80:     base += 0.10
    elif asset_type == "transformer":
        # Heat + humidity affect insulation
        if weather["temperature_c"] > 38:    base += 0.25
        if weather["humidity_pct"] > 80:     base += 0.20
    return round(min(base, 1.0), 2)


def build_risk_note(asset_type: str,
                    weather: dict, multiplier: float) -> str:
    notes = []
    if weather["precipitation_mm"] > 5:
        notes.append("heavy rainfall increases corrosion risk")
    if weather["temperature_c"] > 38:
        notes.append("extreme heat causes thermal expansion stress")
    elif weather["temperature_c"] < 5:
        notes.append("near-freezing temps risk freeze-thaw damage")
    if weather["humidity_pct"] > 80:
        notes.append("high humidity accelerates material degradation")
    if weather["wind_speed_kmh"] > 60:
        notes.append("high wind increases structural load")
    if not notes:
        return "Weather conditions within safe operational parameters."
    return f"Risk elevated ×{multiplier}: " + "; ".join(notes) + "."