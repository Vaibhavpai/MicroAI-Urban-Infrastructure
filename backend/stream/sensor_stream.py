from apscheduler.schedulers.asyncio import AsyncIOScheduler
import random
from datetime import datetime
from db.crud import insert_sensor_reading

scheduler = AsyncIOScheduler()

ASSET_IDS = ["BRIDGE_001", "PIPE_042", "ROAD_012", "TRANSFORMER_007"]

# Each asset has a slightly different "baseline" to make data realistic
BASELINES = {
    "BRIDGE_001":      {"vibration_hz": 55, "temperature_c": 30, "stress_load_kn": 520, "moisture_pct": 40, "acoustic_emission_db": 44, "pressure_bar": 10.5},
    "PIPE_042":        {"vibration_hz": 45, "temperature_c": 26, "stress_load_kn": 480, "moisture_pct": 35, "acoustic_emission_db": 38, "pressure_bar": 12.0},
    "ROAD_012":        {"vibration_hz": 48, "temperature_c": 28, "stress_load_kn": 450, "moisture_pct": 25, "acoustic_emission_db": 36, "pressure_bar":  9.5},
    "TRANSFORMER_007": {"vibration_hz": 52, "temperature_c": 38, "stress_load_kn": 510, "moisture_pct": 30, "acoustic_emission_db": 42, "pressure_bar": 11.0},
}


def simulate_reading(asset_id: str) -> dict:
    b = BASELINES[asset_id]
    # 5% chance of anomaly spike on any reading
    anomaly = random.random() < 0.05
    spike = 2.5 if anomaly else 1.0

    return {
        "asset_id":             asset_id,
        "timestamp":            datetime.utcnow(),
        "vibration_hz":         round(random.gauss(b["vibration_hz"]        * spike, 5),   3),
        "temperature_c":        round(random.gauss(b["temperature_c"]       * spike, 3),   3),
        "stress_load_kn":       round(random.gauss(b["stress_load_kn"]      * spike, 50),  3),
        "moisture_pct":         round(random.gauss(b["moisture_pct"]        * spike, 5),   3),
        "acoustic_emission_db": round(random.gauss(b["acoustic_emission_db"]* spike, 4),   3),
        "pressure_bar":         round(random.gauss(b["pressure_bar"]        * spike, 1),   3),
        "label":         1 if anomaly else 0,
        "anomaly_score": round(random.uniform(0.6, 0.95) if anomaly else random.uniform(0.0, 0.2), 3),
    }


@scheduler.scheduled_job("interval", seconds=10)
async def stream_sensor_data():
    for asset_id in ASSET_IDS:
        reading = simulate_reading(asset_id)
        await insert_sensor_reading(reading)
    print(f"📡 Streamed readings for {len(ASSET_IDS)} assets at {datetime.utcnow().strftime('%H:%M:%S')}")


def start_stream():
    scheduler.start()
    print("✅ Sensor stream started — pushing every 10 seconds")