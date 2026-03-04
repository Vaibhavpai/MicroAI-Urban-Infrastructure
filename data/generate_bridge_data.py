"""
Synthetic Data Generator — Bridge Infrastructure Sensor Data
Uses real bridge_dataset.csv feature ranges as baselines for realism.

Bridge-specific sensor behavior:
  - acceleration_x/y/z  : primary (structural vibration from traffic/wind)
  - fft_peak_freq        : resonance frequency shift = structural change
  - fft_magnitude        : amplitude of dominant frequency
  - wind_speed_mps       : wind-induced oscillation driver
  - temperature_c        : thermal expansion stress
  - humidity_percent     : corrosion accelerator
  - degradation_score    : composite health index (NOT used as feature — target only)

Outputs:
  data/raw/bridge_sensor_data.csv
  data/raw/bridge_asset_metadata.csv

NOTE: degradation_score is intentionally excluded from FEATURES
      to prevent data leakage into the XGBoost model.
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────

RANDOM_SEED          = 42
N_DAYS               = 365
FAILURE_RATE         = 0.03
DEGRADATION_WINDOW_H = 96    # 4-day gradual degradation before failure
N_BRIDGE_ASSETS      = 8
np.random.seed(RANDOM_SEED)

SENSOR_COLS = [
    "acceleration_x",
    "acceleration_y",
    "acceleration_z",
    "temperature_c",
    "humidity_percent",
    "wind_speed_mps",
    "fft_peak_freq",
    "fft_magnitude",
]

# Baselines derived directly from real dataset stats
# (min/max/mean verified from bridge_dataset.csv analysis)
BRIDGE_CONFIG = {
    "acceleration_x":  {"mean":  0.000, "std": 0.35},
    "acceleration_y":  {"mean": -0.012, "std": 0.35},
    "acceleration_z":  {"mean":  0.001, "std": 0.35},
    "temperature_c":   {"mean": 25.2,   "std": 6.0},
    "humidity_percent":{"mean": 59.8,   "std": 12.0},
    "wind_speed_mps":  {"mean":  7.6,   "std": 3.5},
    "fft_peak_freq":   {"mean":  2.77,  "std": 1.0},
    "fft_magnitude":   {"mean":  0.796, "std": 0.28},
}

# Bridge degradation profile:
# Structural failure shows in acceleration amplitude + FFT shifts
BRIDGE_DEGRADE = {
    "acceleration_x":   2.2,   # structural oscillation amplifies
    "acceleration_y":   2.0,   # lateral sway increases
    "acceleration_z":   2.3,   # vertical bounce = deck failure
    "fft_peak_freq":    1.8,   # resonance frequency shifts
    "fft_magnitude":    2.5,   # amplitude of vibration spikes hard
    "wind_speed_mps":   1.3,   # wind coupling increases with damage
    "humidity_percent": 1.4,   # corrosion feedback
    "temperature_c":    1.2,   # thermal stress
}

# Bridge subtypes — different load/environment profiles
BRIDGE_SUBTYPES = {
    "SUSPENSION": {
        "acceleration_z":   {"mean": 0.003, "std": 0.45},  # more vertical
        "wind_speed_mps":   {"mean": 9.5,   "std": 4.0},   # exposed to wind
        "fft_peak_freq":    {"mean": 1.8,   "std": 0.8},   # lower resonance
    },
    "GIRDER": {
        "acceleration_x":   {"mean": 0.000, "std": 0.30},
        "fft_peak_freq":    {"mean": 3.2,   "std": 0.9},
        "fft_magnitude":    {"mean": 0.65,  "std": 0.22},
    },
    "ARCH": {
        "acceleration_y":   {"mean": 0.000, "std": 0.28},  # lateral stable
        "humidity_percent": {"mean": 65.0,  "std": 10.0},  # near water
        "fft_magnitude":    {"mean": 0.90,  "std": 0.30},
    },
}

BRIDGE_SUBTYPE_MAP = {
    f"BRIDGE_{i:03d}": (
        "SUSPENSION" if i < 2 else
        "GIRDER"     if i < 5 else
        "ARCH"
    )
    for i in range(N_BRIDGE_ASSETS)
}


# ── Seasonal & Daily Patterns ──────────────────────────────────────────────────

def add_daily_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Bridges see peak stress during rush hour traffic.
    Wind is typically higher in afternoon.
    Temperature peaks at 2pm.
    """
    n    = len(series)
    t    = np.arange(n)
    hour = t % 24

    if col in ("acceleration_x", "acceleration_y",
               "acceleration_z", "fft_magnitude"):
        # Rush hour double peak: 8am + 6pm
        morning = np.exp(-0.5 * ((hour - 8)  / 2) ** 2)
        evening = np.exp(-0.5 * ((hour - 18) / 2) ** 2)
        cycle   = 1 + 0.18 * (morning + evening)

    elif col == "wind_speed_mps":
        # Wind peaks in afternoon (~3pm)
        cycle = 1 + 0.15 * np.sin(2 * np.pi * (hour - 3) / 24)

    elif col == "temperature_c":
        # Peak at 2pm
        cycle = 1 + 0.10 * np.sin(2 * np.pi * (hour - 6) / 24)

    elif col == "humidity_percent":
        # Higher at night + early morning
        cycle = 1 + 0.07 * np.cos(2 * np.pi * hour / 24)

    elif col == "fft_peak_freq":
        # Frequency shifts slightly with temperature (thermal expansion)
        cycle = 1 + 0.03 * np.sin(2 * np.pi * hour / 24)

    else:
        cycle = 1 + 0.03 * np.sin(2 * np.pi * t / 24)

    return series * cycle


def add_seasonal_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Annual patterns:
    - Summer: higher temp → thermal expansion → FFT shift
    - Monsoon: higher humidity → corrosion → acceleration drift
    - Winter: higher wind → oscillation
    """
    n        = len(series)
    t        = np.arange(n)
    year_rad = 2 * np.pi * t / (N_DAYS * 24)

    if col == "temperature_c":
        seasonal = 1 + 0.18 * np.sin(year_rad - np.pi / 2)

    elif col == "humidity_percent":
        # Monsoon peak July-Sept
        seasonal = 1 + 0.22 * np.sin(year_rad - np.pi / 3)

    elif col == "wind_speed_mps":
        # Higher in winter
        seasonal = 1 + 0.12 * np.cos(year_rad)

    elif col in ("acceleration_x", "acceleration_y", "acceleration_z"):
        # Slight increase in monsoon (water load on deck)
        seasonal = 1 + 0.06 * np.sin(year_rad - np.pi / 4)

    elif col == "fft_peak_freq":
        # Frequency drops in summer (thermal softening)
        seasonal = 1 - 0.04 * np.sin(year_rad - np.pi / 2)

    else:
        seasonal = 1 + 0.03 * np.sin(year_rad)

    return series * seasonal


# ── Degradation ────────────────────────────────────────────────────────────────

def inject_degradation(
    df: pd.DataFrame,
    failure_idx: int,
    window: int
) -> pd.DataFrame:
    """
    Bridge-specific two-phase degradation:
    - Phase 1 (window → window/2): micro-crack formation, slow drift
    - Phase 2 (window/2 → failure): resonance shift + acceleration spike
    """
    start   = max(0, failure_idx - window)
    seg_len = failure_idx - start + 1
    half    = seg_len // 2

    # Phase 1: slow linear micro-cracking
    phase1 = np.linspace(0, 0.25, half)
    # Phase 2: accelerating structural failure
    phase2 = 0.25 + 0.75 * np.linspace(0, 1, seg_len - half) ** 2
    ramp   = np.concatenate([phase1, phase2])

    for col, peak_mult in BRIDGE_DEGRADE.items():
        if col in df.columns:
            mult = 1 + (peak_mult - 1) * ramp
            df.loc[start:failure_idx, col] = (
                df.loc[start:failure_idx, col].values * mult
            )
    return df


def inject_wind_events(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """
    Bridges experience sudden wind gusts — short spikes in acceleration
    and fft_magnitude without structural failure (label stays 0).
    Adds realism and challenges the anomaly detector.
    """
    n_events = max(8, int(n * 0.008))
    indices  = np.random.choice(np.arange(12, n - 12),
                                size=n_events, replace=False)
    for pi in indices:
        spike_len = np.random.randint(3, 12)   # 3-12 hour gust event
        end = min(pi + spike_len, n - 1)
        df.loc[pi:end, "wind_speed_mps"]  *= np.random.uniform(1.5, 2.5)
        df.loc[pi:end, "acceleration_z"]  *= np.random.uniform(1.3, 1.9)
        df.loc[pi:end, "fft_magnitude"]   *= np.random.uniform(1.4, 2.0)
        df.loc[pi:end, "acceleration_x"]  *= np.random.uniform(1.2, 1.6)
    return df


# ── Per-Asset Generation ───────────────────────────────────────────────────────

def generate_bridge_asset(asset_id: str) -> pd.DataFrame:
    subtype   = BRIDGE_SUBTYPE_MAP[asset_id]
    overrides = BRIDGE_SUBTYPES[subtype]

    timestamps = pd.date_range("2023-01-01",
                               periods=N_DAYS * 24, freq="H")
    n = len(timestamps)

    data = {"asset_id": asset_id, "timestamp": timestamps}

    for col in SENSOR_COLS:
        cfg = BRIDGE_CONFIG[col].copy()
        if col in overrides:
            cfg = overrides[col]

        baseline = np.random.normal(cfg["mean"], cfg["std"], n)

        # Acceleration is zero-mean — don't apply multiplicative cycles
        if col in ("acceleration_x", "acceleration_y", "acceleration_z"):
            noise = np.random.normal(0, cfg["std"] * 0.1, n)
            baseline = baseline + noise
        else:
            baseline = add_daily_cycle(baseline, col)
            baseline = add_seasonal_cycle(baseline, col)
            baseline = np.clip(baseline, 0, None)

        data[col] = baseline

    df = pd.DataFrame(data)
    df["label"]          = 0
    df["failure_type"]   = "none"
    df["bridge_subtype"] = subtype

    # Inject wind gust events (non-failure anomalies)
    df = inject_wind_events(df, n)

    # Inject failure events with degradation
    n_failures      = max(1, int(n * FAILURE_RATE))
    pool            = np.arange(DEGRADATION_WINDOW_H, n - 1)
    failure_indices = np.random.choice(pool, size=n_failures, replace=False)

    for fi in failure_indices:
        df = inject_degradation(df, fi, DEGRADATION_WINDOW_H)
        df.loc[fi, "label"]        = 1
        df.loc[fi, "failure_type"] = f"bridge_failure_{subtype.lower()}"

    return df


# ── Metadata ───────────────────────────────────────────────────────────────────

def generate_bridge_metadata() -> pd.DataFrame:
    rows      = []
    bridge_ids = [f"BRIDGE_{i:03d}" for i in range(N_BRIDGE_ASSETS)]

    # Bridges connect to roads and pipelines
    connectivity = {}
    for i, bid in enumerate(bridge_ids):
        connected = []
        if i > 0:
            connected.append(bridge_ids[i - 1])
        if i < len(bridge_ids) - 1:
            connected.append(bridge_ids[i + 1])
        connected.append(f"ROAD_{i:03d}")
        if i % 2 == 0:
            connected.append(f"PIPE_{i:03d}")
        connectivity[bid] = connected

    for asset_id in bridge_ids:
        subtype = BRIDGE_SUBTYPE_MAP[asset_id]
        rows.append({
            "asset_id":             asset_id,
            "asset_type":           "bridge",
            "bridge_subtype":       subtype,
            "location_lat":         round(np.random.uniform(19.05, 19.15), 6),
            "location_lng":         round(np.random.uniform(72.82, 72.95), 6),
            "age_years":            int(np.random.randint(5, 50)),
            "criticality":          int(np.random.randint(3, 6)),
            "last_maintenance_date": str(
                pd.Timestamp("2023-01-01") -
                pd.Timedelta(days=int(np.random.randint(30, 900)))
            ),
            "connected_assets":     json.dumps(connectivity[asset_id]),
            "span_meters":          int(np.random.randint(50, 500)),
            "lane_count":           int(np.random.randint(2, 8)),
            "daily_traffic_vehicles": int(np.random.randint(10000, 120000)),
            "n_sensors":            4,
        })
    return pd.DataFrame(rows)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    out_dir = Path("data/raw")
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Generating bridge sensor data...")
    frames = []
    for i in range(N_BRIDGE_ASSETS):
        asset_id = f"BRIDGE_{i:03d}"
        subtype  = BRIDGE_SUBTYPE_MAP[asset_id]
        print(f"  {asset_id} ({subtype})")
        frames.append(generate_bridge_asset(asset_id))

    sensor_df = pd.concat(frames, ignore_index=True)
    sensor_df = sensor_df.sort_values(
        ["asset_id", "timestamp"]
    ).reset_index(drop=True)

    sensor_df.to_csv(out_dir / "bridge_sensor_data.csv", index=False)

    total    = len(sensor_df)
    failures = int(sensor_df["label"].sum())
    gusts    = int((sensor_df["wind_speed_mps"] >
                    sensor_df["wind_speed_mps"].mean() * 1.5).sum())

    print(f"\nbridge_sensor_data.csv")
    print(f"  Rows         : {total:,}")
    print(f"  Assets       : {sensor_df['asset_id'].nunique()}")
    print(f"  Failures     : {failures:,}  ({failures/total*100:.2f}%)")
    print(f"  Wind events  : ~{gusts:,} elevated wind timesteps")

    print("\nBy subtype:")
    summary = sensor_df.groupby("bridge_subtype")["label"].agg(
        total="count", failures="sum"
    )
    summary["failure_pct"] = (
        summary["failures"] / summary["total"] * 100
    ).round(2)
    print(summary.to_string())

    print("\nGenerating bridge metadata...")
    meta_df = generate_bridge_metadata()
    meta_df.to_csv(out_dir / "bridge_asset_metadata.csv", index=False)
    print(f"bridge_asset_metadata.csv  ({len(meta_df)} assets)")
    print("\nDone.")


if __name__ == "__main__":
    main()