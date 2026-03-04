"""
Synthetic Data Generator — Pipeline Infrastructure Sensor Data
Uses market_pipe_thickness_loss_dataset.csv physical ranges as baselines.

Pipeline-specific sensor behavior:
  - pressure_bar         : primary failure driver (pressure surges)
  - vibration_hz         : flow-induced vibration
  - moisture_pct         : external corrosion indicator
  - acoustic_emission_db : internal crack / leak sounds
  - temperature_c        : thermal stress + fluid temp
  - corrosion_rate_mpy   : derived from real dataset corrosion_impact

NOTE: Thickness_Loss_mm and Material_Loss_Percent excluded — data leakage.

Outputs:
  data/raw/pipe_sensor_data.csv
  data/raw/pipe_asset_metadata.csv
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────

RANDOM_SEED          = 42
N_DAYS               = 365
FAILURE_RATE         = 0.03
DEGRADATION_WINDOW_H = 120   # 5-day gradual degradation (pipelines fail slowly)
N_PIPE_ASSETS        = 8
np.random.seed(RANDOM_SEED)

SENSOR_COLS = [
    "pressure_bar",
    "vibration_hz",
    "moisture_pct",
    "acoustic_emission_db",
    "temperature_c",
    "corrosion_rate_mpy",   # mils per year — derived from real dataset
]

# Baselines derived from real dataset physical ranges
# pressure: 150–2500 psi → converted to bar (1 psi = 0.0689 bar)
# temperature: -50 to 149.7°C → mean 42.6°C
# corrosion: 0–20% impact → mapped to mpy (mils per year)
PIPE_CONFIG = {
    "pressure_bar":         {"mean": 69.2,  "std": 15.0},  # ~1004 psi mean
    "vibration_hz":         {"mean": 42.0,  "std": 6.0},   # flow-induced
    "moisture_pct":         {"mean": 35.0,  "std": 8.0},   # external soil moisture
    "acoustic_emission_db": {"mean": 48.0,  "std": 5.0},   # internal flow sounds
    "temperature_c":        {"mean": 42.6,  "std": 15.0},  # from real dataset mean
    "corrosion_rate_mpy":   {"mean": 4.5,   "std": 1.8},   # mils/year
}

# Pipeline degradation profile:
# Pressure surge + acoustic spike = imminent leak/burst
PIPE_DEGRADE = {
    "pressure_bar":         2.4,   # pressure builds at weak point
    "acoustic_emission_db": 2.6,   # leak/crack sound amplifies
    "corrosion_rate_mpy":   2.2,   # corrosion accelerates
    "moisture_pct":         1.8,   # water ingress at crack site
    "vibration_hz":         1.6,   # flow turbulence increases
    "temperature_c":        1.3,   # heat from friction at leak point
}

# Pipeline subtypes — from real dataset material types
PIPE_SUBTYPES = {
    "WATER": {
        # Municipal water — moderate pressure, low temp
        "pressure_bar":   {"mean": 35.0,  "std": 8.0},
        "temperature_c":  {"mean": 18.0,  "std": 5.0},
        "moisture_pct":   {"mean": 45.0,  "std": 10.0},
    },
    "GAS": {
        # High pressure gas — from API 5L grades in dataset
        "pressure_bar":   {"mean": 120.0, "std": 25.0},
        "temperature_c":  {"mean": 35.0,  "std": 8.0},
        "acoustic_emission_db": {"mean": 52.0, "std": 6.0},
    },
    "OIL": {
        # High temp, high pressure — from ASTM grades
        "pressure_bar":   {"mean": 95.0,  "std": 20.0},
        "temperature_c":  {"mean": 75.0,  "std": 20.0},
        "corrosion_rate_mpy": {"mean": 6.5, "std": 2.5},
    },
}

PIPE_SUBTYPE_MAP = {
    f"PIPE_{i:03d}": (
        "WATER" if i < 3 else
        "GAS"   if i < 6 else
        "OIL"
    )
    for i in range(N_PIPE_ASSETS)
}


# ── Daily & Seasonal Patterns ──────────────────────────────────────────────────

def add_daily_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Pipelines see peak pressure during peak demand hours.
    Water: morning + evening demand peaks.
    Gas: morning heating peak.
    Temperature follows ambient cycle.
    """
    n    = len(series)
    t    = np.arange(n)
    hour = t % 24

    if col == "pressure_bar":
        # Demand peaks: 7am + 7pm
        morning = np.exp(-0.5 * ((hour - 7)  / 2) ** 2)
        evening = np.exp(-0.5 * ((hour - 19) / 2) ** 2)
        cycle   = 1 + 0.15 * (morning + evening)

    elif col == "vibration_hz":
        # Follows pressure cycle
        morning = np.exp(-0.5 * ((hour - 7)  / 2) ** 2)
        evening = np.exp(-0.5 * ((hour - 19) / 2) ** 2)
        cycle   = 1 + 0.10 * (morning + evening)

    elif col == "temperature_c":
        # Ambient temp peak at 2pm
        cycle = 1 + 0.08 * np.sin(2 * np.pi * (hour - 6) / 24)

    elif col == "acoustic_emission_db":
        # Louder during high flow (peak hours)
        cycle = 1 + 0.06 * np.sin(2 * np.pi * (hour - 4) / 24)

    elif col == "moisture_pct":
        # Higher at night (dew, reduced evaporation)
        cycle = 1 + 0.05 * np.cos(2 * np.pi * hour / 24)

    else:
        cycle = 1 + 0.03 * np.sin(2 * np.pi * t / 24)

    return series * cycle


def add_seasonal_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Annual patterns:
    - Winter: higher gas demand → higher pressure
    - Monsoon: higher moisture → corrosion acceleration
    - Summer: higher temperature → thermal expansion stress
    """
    n        = len(series)
    t        = np.arange(n)
    year_rad = 2 * np.pi * t / (N_DAYS * 24)

    if col == "pressure_bar":
        # Higher in winter (heating demand)
        seasonal = 1 + 0.12 * np.cos(year_rad)

    elif col == "temperature_c":
        # Summer peak
        seasonal = 1 + 0.20 * np.sin(year_rad - np.pi / 2)

    elif col == "moisture_pct":
        # Monsoon peak
        seasonal = 1 + 0.25 * np.sin(year_rad - np.pi / 3)

    elif col == "corrosion_rate_mpy":
        # Corrosion peaks in monsoon (humidity) and winter (freeze-thaw)
        seasonal = 1 + 0.15 * np.abs(np.sin(year_rad))

    elif col == "acoustic_emission_db":
        # Slightly higher in winter (thermal contraction cracks)
        seasonal = 1 + 0.05 * np.cos(year_rad)

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
    Pipeline-specific three-phase degradation:
    - Phase 1 (window → 2/3): slow corrosion buildup
    - Phase 2 (2/3 → 1/3): micro-leak formation, pressure fluctuation
    - Phase 3 (1/3 → failure): rapid burst / major leak
    """
    start   = max(0, failure_idx - window)
    seg_len = failure_idx - start + 1
    third   = seg_len // 3

    phase1 = np.linspace(0, 0.15, third)
    phase2 = 0.15 + np.linspace(0, 0.35, third) ** 1.5
    phase3 = 0.50 + 0.50 * np.linspace(0, 1, seg_len - 2*third) ** 2
    ramp   = np.concatenate([phase1, phase2, phase3])

    for col, peak_mult in PIPE_DEGRADE.items():
        if col in df.columns:
            mult = 1 + (peak_mult - 1) * ramp
            df.loc[start:failure_idx, col] = (
                df.loc[start:failure_idx, col].values * mult
            )
    return df


def inject_pressure_surge_events(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """
    Pipelines experience sudden pressure surges (water hammer effect).
    Short spikes without full failure — challenges anomaly detector.
    """
    n_events = max(10, int(n * 0.010))
    indices  = np.random.choice(np.arange(6, n - 6),
                                size=n_events, replace=False)
    for pi in indices:
        spike_len = np.random.randint(1, 5)   # 1-5 hour surge
        end = min(pi + spike_len, n - 1)
        df.loc[pi:end, "pressure_bar"]         *= np.random.uniform(1.4, 2.2)
        df.loc[pi:end, "vibration_hz"]         *= np.random.uniform(1.3, 1.8)
        df.loc[pi:end, "acoustic_emission_db"] *= np.random.uniform(1.5, 2.1)
    return df


# ── Per-Asset Generation ───────────────────────────────────────────────────────

def generate_pipe_asset(asset_id: str) -> pd.DataFrame:
    subtype   = PIPE_SUBTYPE_MAP[asset_id]
    overrides = PIPE_SUBTYPES[subtype]

    timestamps = pd.date_range("2023-01-01",
                               periods=N_DAYS * 24, freq="H")
    n = len(timestamps)

    data = {"asset_id": asset_id, "timestamp": timestamps}

    for col in SENSOR_COLS:
        cfg = PIPE_CONFIG[col].copy()
        if col in overrides:
            cfg = overrides[col]

        baseline = np.random.normal(cfg["mean"], cfg["std"], n)
        baseline = add_daily_cycle(baseline, col)
        baseline = add_seasonal_cycle(baseline, col)
        baseline = np.clip(baseline, 0, None)
        data[col] = baseline

    df = pd.DataFrame(data)
    df["label"]         = 0
    df["failure_type"]  = "none"
    df["pipe_subtype"]  = subtype

    # Inject pressure surge events (non-failure anomalies)
    df = inject_pressure_surge_events(df, n)

    # Inject failure events with degradation
    n_failures      = max(1, int(n * FAILURE_RATE))
    pool            = np.arange(DEGRADATION_WINDOW_H, n - 1)
    failure_indices = np.random.choice(pool, size=n_failures, replace=False)

    for fi in failure_indices:
        df = inject_degradation(df, fi, DEGRADATION_WINDOW_H)
        df.loc[fi, "label"]        = 1
        df.loc[fi, "failure_type"] = f"pipe_failure_{subtype.lower()}"

    return df


# ── Metadata ───────────────────────────────────────────────────────────────────

def generate_pipe_metadata() -> pd.DataFrame:
    rows     = []
    pipe_ids = [f"PIPE_{i:03d}" for i in range(N_PIPE_ASSETS)]

    # From real dataset: material types and grades
    MATERIALS = {
        "WATER": {"material": "PVC",           "grade": "ASTM D1785"},
        "GAS":   {"material": "Carbon Steel",  "grade": "API 5L X65"},
        "OIL":   {"material": "Stainless Steel","grade": "ASTM A106 Grade B"},
    }

    connectivity = {}
    for i, pid in enumerate(pipe_ids):
        connected = []
        if i > 0:
            connected.append(pipe_ids[i - 1])
        if i < len(pipe_ids) - 1:
            connected.append(pipe_ids[i + 1])
        connected.append(f"BRIDGE_{i:03d}")
        if i % 2 == 0:
            connected.append(f"TRANSFORMER_{i:03d}")
        connectivity[pid] = connected

    for asset_id in pipe_ids:
        subtype  = PIPE_SUBTYPE_MAP[asset_id]
        material = MATERIALS[subtype]

        # Pipe size from real dataset range: 50–1500mm
        pipe_size = int(np.random.choice([100, 200, 300, 500, 800, 1000, 1200]))

        # Pressure from real dataset range: 150–2500 psi
        max_pressure_psi = int(np.random.randint(150, 2500))

        rows.append({
            "asset_id":              asset_id,
            "asset_type":            "pipeline",
            "pipe_subtype":          subtype,
            "material":              material["material"],
            "grade":                 material["grade"],
            "pipe_size_mm":          pipe_size,
            "max_pressure_psi":      max_pressure_psi,
            "location_lat":          round(np.random.uniform(19.05, 19.15), 6),
            "location_lng":          round(np.random.uniform(72.82, 72.95), 6),
            "age_years":             int(np.random.randint(1, 25)),
            "criticality":           int(np.random.randint(3, 6)),
            "last_maintenance_date": str(
                pd.Timestamp("2023-01-01") -
                pd.Timedelta(days=int(np.random.randint(30, 730)))
            ),
            "connected_assets":      json.dumps(connectivity[asset_id]),
            "length_km":             round(np.random.uniform(0.5, 25.0), 2),
            "diameter_mm":           pipe_size,
        })
    return pd.DataFrame(rows)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    out_dir = Path("data/raw")
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Generating pipe sensor data...")
    frames = []
    for i in range(N_PIPE_ASSETS):
        asset_id = f"PIPE_{i:03d}"
        subtype  = PIPE_SUBTYPE_MAP[asset_id]
        print(f"  {asset_id} ({subtype})")
        frames.append(generate_pipe_asset(asset_id))

    sensor_df = pd.concat(frames, ignore_index=True)
    sensor_df = sensor_df.sort_values(
        ["asset_id", "timestamp"]
    ).reset_index(drop=True)

    sensor_df.to_csv(out_dir / "pipe_sensor_data.csv", index=False)

    total    = len(sensor_df)
    failures = int(sensor_df["label"].sum())
    surges   = int((sensor_df["pressure_bar"] >
                    sensor_df["pressure_bar"].mean() * 1.4).sum())

    print(f"\npipe_sensor_data.csv")
    print(f"  Rows           : {total:,}")
    print(f"  Assets         : {sensor_df['asset_id'].nunique()}")
    print(f"  Failures       : {failures:,}  ({failures/total*100:.2f}%)")
    print(f"  Pressure surges: ~{surges:,} elevated pressure timesteps")

    print("\nBy subtype:")
    summary = sensor_df.groupby("pipe_subtype")["label"].agg(
        total="count", failures="sum"
    )
    summary["failure_pct"] = (
        summary["failures"] / summary["total"] * 100
    ).round(2)
    print(summary.to_string())

    print("\nGenerating pipe metadata...")
    meta_df = generate_pipe_metadata()
    meta_df.to_csv(out_dir / "pipe_asset_metadata.csv", index=False)
    print(f"pipe_asset_metadata.csv  ({len(meta_df)} assets)")
    print("\nDone.")


if __name__ == "__main__":
    main()