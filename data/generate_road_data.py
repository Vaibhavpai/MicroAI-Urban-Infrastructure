"""
Synthetic Data Generator — Road Infrastructure Sensor Data
Generates realistic multi-variable time-series with gradual degradation.

Road-specific sensor behavior:
  - stress_load_kn     : primary failure driver (heavy traffic load)
  - vibration_hz       : secondary (surface deterioration)
  - moisture_pct       : seasonal (rain + freeze-thaw cycles)
  - acoustic_emission_db: crack/pothole formation sounds
  - temperature_c      : asphalt softening in heat
  - pressure_bar       : sub-surface pressure (drainage)

Outputs:
  data/raw/road_sensor_data.csv
  data/raw/road_asset_metadata.csv
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
RANDOM_SEED     = 42
N_DAYS          = 365
FAILURE_RATE    = 0.03          # ~3% timesteps are failure events
DEGRADATION_WINDOW_H = 72       # 3-day gradual degradation before failure
N_ROAD_ASSETS   = 10            # generate 10 road segments
np.random.seed(RANDOM_SEED)

SENSOR_COLS = [
    "vibration_hz",
    "temperature_c",
    "stress_load_kn",
    "moisture_pct",
    "acoustic_emission_db",
    "pressure_bar",
]

# Road-specific sensor baselines
# Roads run hotter, carry heavier loads, more surface vibration than bridges
ROAD_CONFIG = {
    "vibration_hz":         {"mean": 35,   "std": 6},    # surface vibration from traffic
    "temperature_c":        {"mean": 32,   "std": 6},    # asphalt absorbs heat
    "stress_load_kn":       {"mean": 1200, "std": 150},  # heavy vehicle loads
    "moisture_pct":         {"mean": 42,   "std": 7},    # rain + drainage
    "acoustic_emission_db": {"mean": 58,   "std": 6},    # traffic + crack sounds
    "pressure_bar":         {"mean": 3.2,  "std": 0.4},  # subsurface pressure
}

# Road degradation profile:
# stress and acoustic spike hardest — structural overload + crack formation
ROAD_DEGRADE = {
    "stress_load_kn":       2.0,   # load concentration at weak spots
    "acoustic_emission_db": 2.1,   # cracks + pothole formation sounds
    "vibration_hz":         1.9,   # surface roughness increases
    "moisture_pct":         1.6,   # water ingress into cracks
    "temperature_c":        1.3,   # heat retention in damaged asphalt
    "pressure_bar":         1.2,   # subsurface pressure from water pooling
}

# Road subtypes — different traffic/environment profiles
ROAD_SUBTYPES = {
    "HIGHWAY": {
        "stress_load_kn":  {"mean": 1800, "std": 200},  # heavy trucks
        "vibration_hz":    {"mean": 45,   "std": 7},
        "temperature_c":   {"mean": 35,   "std": 5},
    },
    "URBAN": {
        "stress_load_kn":  {"mean": 900,  "std": 100},  # mixed traffic
        "vibration_hz":    {"mean": 30,   "std": 5},
        "temperature_c":   {"mean": 30,   "std": 6},
    },
    "RURAL": {
        "stress_load_kn":  {"mean": 600,  "std": 80},   # lighter loads
        "vibration_hz":    {"mean": 25,   "std": 4},
        "temperature_c":   {"mean": 28,   "std": 7},
    },
}

# Assign subtypes to road assets
ROAD_SUBTYPE_MAP = {
    f"ROAD_{i:03d}": (
        "HIGHWAY" if i < 3 else
        "URBAN"   if i < 7 else
        "RURAL"
    )
    for i in range(N_ROAD_ASSETS)
}


# ─────────────────────────────────────────────
# SEASONAL PATTERNS (road-specific)
# ─────────────────────────────────────────────

def add_daily_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Roads have strong daily traffic cycles.
    Peak stress/vibration during rush hours (8am, 6pm).
    Temperature peaks at 2pm.
    """
    n = len(series)
    t = np.arange(n)
    hour = t % 24

    if col in ("stress_load_kn", "vibration_hz", "acoustic_emission_db"):
        # Double peak: morning rush (8am) + evening rush (6pm)
        morning = np.exp(-0.5 * ((hour - 8)  / 2) ** 2)
        evening = np.exp(-0.5 * ((hour - 18) / 2) ** 2)
        cycle   = 1 + 0.20 * (morning + evening)
    elif col == "temperature_c":
        # Single peak at 2pm
        cycle = 1 + 0.12 * np.sin(2 * np.pi * (t - 6 * n // (N_DAYS * 24)) / 24)
    elif col == "moisture_pct":
        # Higher at night (dew) and early morning
        cycle = 1 + 0.08 * np.cos(2 * np.pi * t / 24)
    else:
        cycle = 1 + 0.04 * np.sin(2 * np.pi * t / 24)

    return series * cycle


def add_seasonal_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Annual seasonality:
    - Summer: higher temp, higher stress (thermal expansion)
    - Monsoon: higher moisture, pressure
    - Winter: lower traffic stress
    """
    n = len(series)
    t = np.arange(n)

    if col == "temperature_c":
        # Peak in June-July (hour ~4300)
        seasonal = 1 + 0.15 * np.sin(2 * np.pi * t / (N_DAYS * 24) - np.pi / 2)
    elif col == "moisture_pct":
        # Peak in monsoon (July-Sept, hours ~4400–6600)
        seasonal = 1 + 0.20 * np.sin(2 * np.pi * t / (N_DAYS * 24) - np.pi / 3)
    elif col == "stress_load_kn":
        # Slightly lower in winter holidays
        seasonal = 1 - 0.05 * np.cos(2 * np.pi * t / (N_DAYS * 24))
    else:
        seasonal = 1 + 0.03 * np.sin(2 * np.pi * t / (N_DAYS * 24))

    return series * seasonal


# ─────────────────────────────────────────────
# DEGRADATION
# ─────────────────────────────────────────────

def inject_degradation(
    df: pd.DataFrame,
    failure_idx: int,
    window: int
) -> pd.DataFrame:
    """
    Road-specific degradation:
    - Phase 1 (window to window/2): slow micro-cracking
    - Phase 2 (window/2 to failure): rapid structural failure
    Two-phase ramp is more realistic than single quadratic for roads.
    """
    start    = max(0, failure_idx - window)
    seg_len  = failure_idx - start + 1
    half     = seg_len // 2

    # Phase 1: slow linear ramp (micro-cracking)
    phase1 = np.linspace(0, 0.3, half)
    # Phase 2: accelerating quadratic ramp (structural failure)
    phase2 = 0.3 + 0.7 * np.linspace(0, 1, seg_len - half) ** 2
    ramp   = np.concatenate([phase1, phase2])

    for col, peak_mult in ROAD_DEGRADE.items():
        if col in df.columns:
            mult = 1 + (peak_mult - 1) * ramp
            df.loc[start:failure_idx, col] = (
                df.loc[start:failure_idx, col].values * mult
            )
    return df


def inject_pothole_events(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """
    Roads have sudden pothole events — short spikes in vibration + acoustic
    without full structural failure (label stays 0).
    Adds realism and challenges the anomaly detector.
    """
    pothole_indices = np.random.choice(
        np.arange(24, n - 24), 
        size=max(5, int(n * 0.005)),  # ~0.5% of timesteps
        replace=False
    )
    for pi in pothole_indices:
        spike_len = np.random.randint(2, 8)   # 2-8 hour spike
        end = min(pi + spike_len, n - 1)
        df.loc[pi:end, "vibration_hz"]         *= np.random.uniform(1.3, 1.8)
        df.loc[pi:end, "acoustic_emission_db"] *= np.random.uniform(1.4, 2.0)
        df.loc[pi:end, "stress_load_kn"]       *= np.random.uniform(1.1, 1.4)
    return df


# ─────────────────────────────────────────────
# PER-ASSET GENERATION
# ─────────────────────────────────────────────

def generate_road_asset(asset_id: str) -> pd.DataFrame:
    subtype     = ROAD_SUBTYPE_MAP[asset_id]
    overrides   = ROAD_SUBTYPES[subtype]

    timestamps = pd.date_range("2023-01-01", periods=N_DAYS * 24, freq="H")
    n = len(timestamps)

    # Build baseline with subtype overrides
    data = {"asset_id": asset_id, "timestamp": timestamps}
    for col in SENSOR_COLS:
        cfg = ROAD_CONFIG[col].copy()
        if col in overrides:
            cfg = overrides[col]
        baseline = np.random.normal(cfg["mean"], cfg["std"], n)
        baseline = add_daily_cycle(baseline, col)
        baseline = add_seasonal_cycle(baseline, col)
        data[col] = np.clip(baseline, 0, None)

    df = pd.DataFrame(data)
    df["label"]        = 0
    df["failure_type"] = "none"
    df["road_subtype"] = subtype

    # Inject pothole events (non-failure anomalies)
    df = inject_pothole_events(df, n)

    # Inject failure events with degradation
    n_failures = max(1, int(n * FAILURE_RATE))
    pool       = np.arange(DEGRADATION_WINDOW_H, n - 1)
    failure_indices = np.random.choice(pool, size=n_failures, replace=False)

    for fi in failure_indices:
        df = inject_degradation(df, fi, DEGRADATION_WINDOW_H)
        df.loc[fi, "label"]        = 1
        df.loc[fi, "failure_type"] = f"road_failure_{subtype.lower()}"

    return df


# ─────────────────────────────────────────────
# METADATA
# ─────────────────────────────────────────────

def generate_road_metadata() -> pd.DataFrame:
    rows = []
    road_ids = [f"ROAD_{i:03d}" for i in range(N_ROAD_ASSETS)]

    # Road segments connect to each other (chain) + to bridges
    connectivity = {}
    for i, rid in enumerate(road_ids):
        connected = []
        if i > 0:
            connected.append(road_ids[i - 1])
        if i < len(road_ids) - 1:
            connected.append(road_ids[i + 1])
        # Some roads connect to bridges
        if i % 3 == 0:
            connected.append(f"BRIDGE_{i // 3:03d}")
        connectivity[rid] = connected

    for asset_id in road_ids:
        subtype = ROAD_SUBTYPE_MAP[asset_id]
        rows.append({
            "asset_id":               asset_id,
            "asset_type":             "road",
            "road_subtype":           subtype,
            "location_lat":           round(np.random.uniform(19.05, 19.15), 6),
            "location_lng":           round(np.random.uniform(72.82, 72.95), 6),
            "age_years":              int(np.random.randint(3, 30)),
            "criticality":            int(np.random.randint(1, 6)),
            "last_maintenance_date":  str(
                pd.Timestamp("2023-01-01") -
                pd.Timedelta(days=int(np.random.randint(30, 730)))
            ),
            "connected_assets":       json.dumps(connectivity[asset_id]),
            "surface_type":           np.random.choice(
                ["asphalt", "concrete", "composite"]
            ),
            "lane_count":             int(np.random.randint(2, 8)),
            "daily_traffic_vehicles": int(np.random.randint(5000, 80000)),
        })
    return pd.DataFrame(rows)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    out_dir = Path(__file__).parent / "raw"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Generating road sensor data...")
    frames = []
    for i in range(N_ROAD_ASSETS):
        asset_id = f"ROAD_{i:03d}"
        subtype  = ROAD_SUBTYPE_MAP[asset_id]
        print(f"  {asset_id} ({subtype})")
        frames.append(generate_road_asset(asset_id))

    sensor_df = pd.concat(frames, ignore_index=True)
    sensor_df = sensor_df.sort_values(
        ["asset_id", "timestamp"]
    ).reset_index(drop=True)
    sensor_df.to_csv(out_dir / "road_sensor_data.csv", index=False)

    total    = len(sensor_df)
    failures = int(sensor_df["label"].sum())
    potholes = int(
        (sensor_df["vibration_hz"] > sensor_df["vibration_hz"].mean() * 1.3).sum()
    )

    print(f"\nroad_sensor_data.csv")
    print(f"  Rows          : {total:,}")
    print(f"  Assets        : {sensor_df['asset_id'].nunique()}")
    print(f"  Failures      : {failures:,}  ({failures/total*100:.2f}%)")
    print(f"  Pothole events: ~{potholes:,} elevated vibration timesteps")

    print("\nBy subtype:")
    summary = sensor_df.groupby("road_subtype")["label"].agg(
        total="count", failures="sum"
    )
    summary["failure_pct"] = (summary["failures"] / summary["total"] * 100).round(2)
    print(summary.to_string())

    print("\nGenerating road metadata...")
    meta_df = generate_road_metadata()
    meta_df.to_csv(out_dir / "road_asset_metadata.csv", index=False)
    print(f"road_asset_metadata.csv  ({len(meta_df)} assets)")
    print("\nDone.")


if __name__ == "__main__":
    main()