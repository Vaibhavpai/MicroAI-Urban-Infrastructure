"""
APScheduler-based sensor stream fallback.
Fetches assets from MongoDB and generates asset-type-specific readings.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import random
from datetime import datetime
from db.crud import insert_sensor_reading, get_all_assets

scheduler = AsyncIOScheduler()

# Sensor profiles per asset type (same as kafka_producer)
SENSOR_PROFILES = {
    "bridge": {
        "sensors": {
            "vibration_hz": {"baseline": 55, "noise": 5},
            "deflection_mm": {"baseline": 12.5, "noise": 1.5},
            "stress_load_kn": {"baseline": 520, "noise": 50},
            "wind_speed_kmh": {"baseline": 18, "noise": 4},
            "crack_width_mm": {"baseline": 0.3, "noise": 0.05},
            "acoustic_emission_db": {"baseline": 44, "noise": 4},
        },
    },
    "pipeline": {
        "sensors": {
            "flow_rate_lps": {"baseline": 85, "noise": 8},
            "pressure_bar": {"baseline": 12.0, "noise": 1.0},
            "temperature_c": {"baseline": 26, "noise": 3},
            "corrosion_mm": {"baseline": 1.2, "noise": 0.1},
            "moisture_pct": {"baseline": 35, "noise": 5},
            "ph_level": {"baseline": 7.2, "noise": 0.3},
        },
    },
    "road": {
        "sensors": {
            "surface_temp_c": {"baseline": 38, "noise": 3},
            "rutting_depth_mm": {"baseline": 6.5, "noise": 0.8},
            "traffic_load_kn": {"baseline": 450, "noise": 40},
            "moisture_pct": {"baseline": 25, "noise": 5},
            "roughness_iri": {"baseline": 2.8, "noise": 0.3},
            "deflection_mm": {"baseline": 0.45, "noise": 0.05},
        },
    },
    "transformer": {
        "sensors": {
            "oil_temp_c": {"baseline": 62, "noise": 4},
            "winding_temp_c": {"baseline": 78, "noise": 5},
            "load_pct": {"baseline": 72, "noise": 6},
            "dissolved_gas_ppm": {"baseline": 120, "noise": 15},
            "vibration_hz": {"baseline": 52, "noise": 5},
            "humidity_pct": {"baseline": 35, "noise": 4},
        },
    },
}

# Cached asset list (fetched on first run)
_cached_assets = None


async def _get_assets():
    """Fetch and cache assets from MongoDB."""
    global _cached_assets
    if _cached_assets is None:
        _cached_assets = await get_all_assets()
        print(f"📦 Sensor stream loaded {len(_cached_assets)} assets from MongoDB")
    return _cached_assets


def simulate_reading(asset_doc: dict) -> dict:
    asset_type = asset_doc.get("asset_type", "bridge")
    profile = SENSOR_PROFILES.get(asset_type, SENSOR_PROFILES["bridge"])

    # 5% chance of anomaly spike
    anomaly = random.random() < 0.05
    spike = 2.5 if anomaly else 1.0

    reading = {
        "asset_id": asset_doc["asset_id"],
        "asset_type": asset_type,
        "city": asset_doc.get("city", "Unknown"),
        "timestamp": datetime.utcnow(),
    }

    for sensor_key, sensor_cfg in profile["sensors"].items():
        value = random.gauss(sensor_cfg["baseline"] * spike, sensor_cfg["noise"])
        reading[sensor_key] = round(value, 3)

    reading["label"] = 1 if anomaly else 0
    reading["anomaly_score"] = round(
        random.uniform(0.6, 0.95) if anomaly else random.uniform(0.0, 0.2), 3
    )
    return reading


@scheduler.scheduled_job("interval", seconds=10)
async def stream_sensor_data():
    assets = await _get_assets()
    for asset_doc in assets:
        reading = simulate_reading(asset_doc)
        await insert_sensor_reading(reading)
    print(f"📡 Streamed readings for {len(assets)} assets at {datetime.utcnow().strftime('%H:%M:%S')}")


def start_stream():
    scheduler.start()
    print("✅ Sensor stream started — pushing every 10 seconds")