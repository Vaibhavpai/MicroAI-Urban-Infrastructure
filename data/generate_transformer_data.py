"""
Synthetic Data Generator — Transformer / Grid Infrastructure Sensor Data
Uses smart_grid_dataset.csv feature ranges as baselines.

Transformer-specific sensor behavior:
  - voltage_v          : primary — voltage sag/surge = imminent fault
  - current_a          : overload detection
  - frequency_hz       : grid stability indicator
  - power_kw           : load monitoring
  - temperature_c      : winding/oil temperature (thermal failure)
  - oil_level_pct      : insulating oil degradation
  - harmonic_distortion: FFT summary — total harmonic distortion %
  - vibration_hz       : core/winding mechanical resonance

NOTE: Raw FFT_1..FFT_128 collapsed to harmonic_distortion (THD%)
      to avoid 128-feature curse of dimensionality on 1000 rows.

Outputs:
  data/raw/transformer_sensor_data.csv
  data/raw/transformer_asset_metadata.csv
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────

RANDOM_SEED          = 42
N_DAYS               = 365
FAILURE_RATE         = 0.03
DEGRADATION_WINDOW_H = 96    # 4-day degradation window
N_TRANSFORMER_ASSETS = 8
np.random.seed(RANDOM_SEED)

SENSOR_COLS = [
    "voltage_v",
    "current_a",
    "frequency_hz",
    "power_kw",
    "temperature_c",
    "oil_level_pct",
    "harmonic_distortion",
    "vibration_hz",
]

# Baselines derived directly from real smart_grid_dataset.csv stats
TRANSFORMER_CONFIG = {
    "voltage_v":           {"mean": 230.1,  "std": 10.1},   # from real dataset
    "current_a":           {"mean": 14.9,   "std": 2.1},    # from real dataset
    "frequency_hz":        {"mean": 50.0,   "std": 0.52},   # from real dataset
    "power_kw":            {"mean": 3.43,   "std": 0.50},   # from real dataset
    "temperature_c":       {"mean": 55.0,   "std": 8.0},    # transformer winding temp
    "oil_level_pct":       {"mean": 85.0,   "std": 5.0},    # insulating oil level
    "harmonic_distortion": {"mean": 4.2,    "std": 1.5},    # THD% (from FFT stats)
    "vibration_hz":        {"mean": 50.2,   "std": 3.0},    # 50Hz core hum
}

# Transformer degradation profile:
# Voltage sag + temperature spike + harmonic distortion = failure signature
TRANSFORMER_DEGRADE = {
    "voltage_v":           0.82,   # voltage drops (sag)
    "temperature_c":       2.8,    # winding overheats — primary failure signal
    "harmonic_distortion": 3.2,    # distortion spikes as insulation degrades
    "current_a":           2.1,    # current surges at fault
    "oil_level_pct":       0.75,   # oil level drops
    "vibration_hz":        2.0,    # core vibration increases
    "frequency_hz":        0.96,   # slight frequency deviation
    "power_kw":            1.8,    # power fluctuation
}

# Transformer subtypes
TRANSFORMER_SUBTYPES = {
    "DISTRIBUTION": {
        # 11kV/415V — most common urban transformer
        "voltage_v":    {"mean": 415.0, "std": 15.0},
        "current_a":    {"mean": 18.0,  "std": 3.0},
        "power_kw":     {"mean": 5.0,   "std": 0.8},
        "temperature_c":{"mean": 60.0,  "std": 10.0},
    },
    "TRANSMISSION": {
        # 132kV/33kV — high voltage transmission
        "voltage_v":    {"mean": 230.0, "std": 12.0},
        "current_a":    {"mean": 12.0,  "std": 2.0},
        "power_kw":     {"mean": 2.8,   "std": 0.4},
        "temperature_c":{"mean": 50.0,  "std": 7.0},
    },
    "INDUSTRIAL": {
        # Heavy load industrial transformer
        "voltage_v":    {"mean": 220.0, "std": 8.0},
        "current_a":    {"mean": 20.0,  "std": 4.0},
        "power_kw":     {"mean": 8.0,   "std": 1.5},
        "temperature_c":{"mean": 70.0,  "std": 12.0},
    },
}

TRANSFORMER_SUBTYPE_MAP = {
    f"TRANSFORMER_{i:03d}": (
        "DISTRIBUTION" if i < 3 else
        "TRANSMISSION" if i < 6 else
        "INDUSTRIAL"
    )
    for i in range(N_TRANSFORMER_ASSETS)
}


# ── Daily & Seasonal Patterns ──────────────────────────────────────────────────

def add_daily_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Transformers follow grid demand cycles.
    Peak load: 9am–6pm (commercial) + 7pm–10pm (residential).
    Temperature follows load + ambient cycle.
    Frequency dips slightly during peak demand.
    """
    n    = len(series)
    t    = np.arange(n)
    hour = t % 24

    if col in ("current_a", "power_kw"):
        # Commercial peak 9am + residential peak 8pm
        commercial  = np.exp(-0.5 * ((hour - 13) / 4) ** 2)
        residential = np.exp(-0.5 * ((hour - 20) / 2) ** 2)
        cycle       = 1 + 0.22 * commercial + 0.18 * residential
        # Night valley (2am–5am)
        night = np.exp(-0.5 * ((hour - 3) / 1.5) ** 2)
        cycle = cycle - 0.15 * night

    elif col == "voltage_v":
        # Voltage sags slightly during peak load
        commercial  = np.exp(-0.5 * ((hour - 13) / 4) ** 2)
        residential = np.exp(-0.5 * ((hour - 20) / 2) ** 2)
        cycle       = 1 - 0.015 * (commercial + residential)

    elif col == "temperature_c":
        # Follows load + ambient (peaks ~3pm)
        load    = np.exp(-0.5 * ((hour - 14) / 4) ** 2)
        ambient = np.sin(2 * np.pi * (hour - 6) / 24)
        cycle   = 1 + 0.12 * load + 0.05 * ambient

    elif col == "frequency_hz":
        # Dips during morning ramp-up (6-8am)
        ramp  = np.exp(-0.5 * ((hour - 7) / 1.5) ** 2)
        cycle = 1 - 0.003 * ramp

    elif col == "harmonic_distortion":
        # Higher during peak load (non-linear loads)
        peak  = np.exp(-0.5 * ((hour - 13) / 4) ** 2)
        cycle = 1 + 0.20 * peak

    elif col == "vibration_hz":
        # Follows load cycle
        cycle = 1 + 0.05 * np.sin(2 * np.pi * hour / 24)

    else:
        cycle = 1 + 0.02 * np.sin(2 * np.pi * t / 24)

    return series * cycle


def add_seasonal_cycle(series: np.ndarray, col: str) -> np.ndarray:
    """
    Annual patterns:
    - Summer: higher AC load → more current, higher temp
    - Winter: higher heating load → higher current
    - Monsoon: humidity affects insulation → higher harmonic distortion
    """
    n        = len(series)
    t        = np.arange(n)
    year_rad = 2 * np.pi * t / (N_DAYS * 24)

    if col in ("current_a", "power_kw"):
        # Two peaks: summer (AC) + winter (heating)
        summer = np.sin(year_rad - np.pi / 2)
        winter = -np.cos(year_rad)
        seasonal = 1 + 0.10 * np.abs(summer) + 0.08 * np.clip(winter, 0, 1)

    elif col == "temperature_c":
        # Peaks in summer
        seasonal = 1 + 0.18 * np.sin(year_rad - np.pi / 2)

    elif col == "harmonic_distortion":
        # Higher in monsoon (humidity + AC load)
        seasonal = 1 + 0.12 * np.sin(year_rad - np.pi / 3)

    elif col == "oil_level_pct":
        # Drops slowly over time + seasonal evaporation in summer
        time_decay = 1 - 0.08 * (t / (N_DAYS * 24))
        seasonal   = time_decay * (1 - 0.03 * np.sin(year_rad - np.pi / 2))
        return series * seasonal

    elif col == "voltage_v":
        # Slight sag in peak summer demand
        seasonal = 1 - 0.008 * np.sin(year_rad - np.pi / 2)

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
    Transformer-specific two-phase degradation:
    - Phase 1 (window → half): insulation degradation, slow temp rise
    - Phase 2 (half → failure): thermal runaway + voltage collapse
    """
    start   = max(0, failure_idx - window)
    seg_len = failure_idx - start + 1
    half    = seg_len // 2

    # Phase 1: slow insulation degradation
    phase1 = np.linspace(0, 0.30, half)
    # Phase 2: thermal runaway — exponential
    phase2 = 0.30 + 0.70 * (np.linspace(0, 1, seg_len - half) ** 1.8)
    ramp   = np.concatenate([phase1, phase2])

    for col, peak_mult in TRANSFORMER_DEGRADE.items():
        if col in df.columns:
            mult = 1 + (peak_mult - 1) * ramp
            # Voltage and oil_level DROP (mult < 1 for those)
            df.loc[start:failure_idx, col] = (
                df.loc[start:failure_idx, col].values * mult
            )
    return df


def inject_load_spike_events(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """
    Grid load spikes — sudden current/power surges without full failure.
    Common during industrial startups, AC switching storms.
    """
    n_events = max(12, int(n * 0.012))
    indices  = np.random.choice(np.arange(4, n - 4),
                                size=n_events, replace=False)
    for pi in indices:
        spike_len = np.random.randint(1, 4)
        end = min(pi + spike_len, n - 1)
        df.loc[pi:end, "current_a"]           *= np.random.uniform(1.4, 2.0)
        df.loc[pi:end, "power_kw"]            *= np.random.uniform(1.3, 1.9)
        df.loc[pi:end, "harmonic_distortion"] *= np.random.uniform(1.5, 2.5)
        df.loc[pi:end, "voltage_v"]           *= np.random.uniform(0.92, 0.97)
    return df


# ── Per-Asset Generation ───────────────────────────────────────────────────────

def generate_transformer_asset(asset_id: str) -> pd.DataFrame:
    subtype   = TRANSFORMER_SUBTYPE_MAP[asset_id]
    overrides = TRANSFORMER_SUBTYPES[subtype]

    timestamps = pd.date_range("2023-01-01",
                               periods=N_DAYS * 24, freq="H")
    n = len(timestamps)

    data = {"asset_id": asset_id, "timestamp": timestamps}

    for col in SENSOR_COLS:
        cfg = TRANSFORMER_CONFIG[col].copy()
        if col in overrides:
            cfg = overrides[col]

        baseline = np.random.normal(cfg["mean"], cfg["std"], n)
        baseline = add_daily_cycle(baseline, col)
        baseline = add_seasonal_cycle(baseline, col)
        baseline = np.clip(baseline, 0, None)
        data[col] = baseline

    df = pd.DataFrame(data)
    df["label"]               = 0
    df["failure_type"]        = "none"
    df["transformer_subtype"] = subtype

    # Inject load spike events
    df = inject_load_spike_events(df, n)

    # Inject failure events with degradation
    n_failures      = max(1, int(n * FAILURE_RATE))
    pool            = np.arange(DEGRADATION_WINDOW_H, n - 1)
    failure_indices = np.random.choice(pool, size=n_failures, replace=False)

    for fi in failure_indices:
        df = inject_degradation(df, fi, DEGRADATION_WINDOW_H)
        df.loc[fi, "label"]        = 1
        df.loc[fi, "failure_type"] = f"transformer_failure_{subtype.lower()}"

    return df


# ── Metadata ───────────────────────────────────────────────────────────────────

def generate_transformer_metadata() -> pd.DataFrame:
    rows             = []
    transformer_ids  = [f"TRANSFORMER_{i:03d}" for i in range(N_TRANSFORMER_ASSETS)]

    RATINGS = {
        "DISTRIBUTION": {"kva": 500,    "voltage_ratio": "11kV/415V"},
        "TRANSMISSION": {"kva": 10000,  "voltage_ratio": "132kV/33kV"},
        "INDUSTRIAL":   {"kva": 2000,   "voltage_ratio": "33kV/415V"},
    }

    connectivity = {}
    for i, tid in enumerate(transformer_ids):
        connected = []
        if i > 0:
            connected.append(transformer_ids[i - 1])
        if i < len(transformer_ids) - 1:
            connected.append(transformer_ids[i + 1])
        connected.append(f"PIPE_{i:03d}")
        if i % 2 == 0:
            connected.append(f"BRIDGE_{i:03d}")
        connectivity[tid] = connected

    for asset_id in transformer_ids:
        subtype = TRANSFORMER_SUBTYPE_MAP[asset_id]
        rating  = RATINGS[subtype]
        rows.append({
            "asset_id":              asset_id,
            "asset_type":            "transformer",
            "transformer_subtype":   subtype,
            "voltage_ratio":         rating["voltage_ratio"],
            "rated_kva":             rating["kva"],
            "location_lat":          round(np.random.uniform(19.05, 19.15), 6),
            "location_lng":          round(np.random.uniform(72.82, 72.95), 6),
            "age_years":             int(np.random.randint(2, 30)),
            "criticality":           int(np.random.randint(3, 6)),
            "last_maintenance_date": str(
                pd.Timestamp("2023-01-01") -
                pd.Timedelta(days=int(np.random.randint(30, 730)))
            ),
            "connected_assets":      json.dumps(connectivity[asset_id]),
            "cooling_type":          np.random.choice(["ONAN", "ONAF", "OFAF"]),
            "insulation_class":      np.random.choice(["A", "B", "F", "H"]),
        })
    return pd.DataFrame(rows)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    out_dir = Path("data/raw")
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Generating transformer sensor data...")
    frames = []
    for i in range(N_TRANSFORMER_ASSETS):
        asset_id = f"TRANSFORMER_{i:03d}"
        subtype  = TRANSFORMER_SUBTYPE_MAP[asset_id]
        print(f"  {asset_id} ({subtype})")
        frames.append(generate_transformer_asset(asset_id))

    sensor_df = pd.concat(frames, ignore_index=True)
    sensor_df = sensor_df.sort_values(
        ["asset_id", "timestamp"]
    ).reset_index(drop=True)

    sensor_df.to_csv(out_dir / "transformer_sensor_data.csv", index=False)

    total    = len(sensor_df)
    failures = int(sensor_df["label"].sum())
    spikes   = int((sensor_df["current_a"] >
                    sensor_df["current_a"].mean() * 1.4).sum())

    print(f"\ntransformer_sensor_data.csv")
    print(f"  Rows        : {total:,}")
    print(f"  Assets      : {sensor_df['asset_id'].nunique()}")
    print(f"  Failures    : {failures:,}  ({failures/total*100:.2f}%)")
    print(f"  Load spikes : ~{spikes:,} elevated current timesteps")

    print("\nBy subtype:")
    summary = sensor_df.groupby("transformer_subtype")["label"].agg(
        total="count", failures="sum"
    )
    summary["failure_pct"] = (
        summary["failures"] / summary["total"] * 100
    ).round(2)
    print(summary.to_string())

    print("\nGenerating transformer metadata...")
    meta_df = generate_transformer_metadata()
    meta_df.to_csv(out_dir / "transformer_asset_metadata.csv", index=False)
    print(f"transformer_asset_metadata.csv  ({len(meta_df)} assets)")
    print("\nDone.")


if __name__ == "__main__":
    main()