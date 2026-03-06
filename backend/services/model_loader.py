import os
import joblib
import numpy as np
import pandas as pd
from config import settings

ASSET_TYPES = ["BRIDGE", "PIPE", "ROAD", "TRANSFORMER"]

# Feature columns per asset type — must match training exactly
FEATURE_COLS = {
    "ROAD": [
        "vibration_hz", "temperature_c", "stress_load_kn",
        "moisture_pct", "acoustic_emission_db", "pressure_bar",
    ],
    "BRIDGE": [
        "acceleration_x", "acceleration_y", "acceleration_z",
        "temperature_c", "humidity_percent", "wind_speed_mps",
        "fft_peak_freq", "fft_magnitude",
    ],
    "PIPE": [
        "pressure_bar", "vibration_hz", "moisture_pct",
        "acoustic_emission_db", "temperature_c", "corrosion_rate_mpy",
    ],
    "TRANSFORMER": [
        "voltage_v", "current_a", "frequency_hz", "power_kw",
        "temperature_c", "oil_level_pct",
        "harmonic_distortion", "vibration_hz",
    ],
}


def extract_asset_type(asset_id: str) -> str:
    prefix = asset_id.split("_")[0].upper()
    if prefix not in ASSET_TYPES:
        raise ValueError(f"Unknown asset type prefix: '{prefix}'. "
                         f"Must be one of {ASSET_TYPES}")
    return prefix


def risk_level(score: float) -> str:
    if score >= 80: return "CRITICAL"
    if score >= 60: return "HIGH"
    if score >= 40: return "MEDIUM"
    return "LOW"


class ModelStore:
    def __init__(self, model_dir: str = "../ml/models/"):  # ← add ../
        self.model_dir  = model_dir
        self.stub_mode  = settings.STUB_MODE
        self._loaded    = False

        self.risk_scorers    = {}
        self.shap_explainers = {}
        self.scalers         = {}

        if not self.stub_mode:
            self._load(model_dir)
        else:
            print("[WARN] ModelStore running in STUB_MODE")

    def _load(self, model_dir: str):
        try:
            print("[INFO] Loading ML models...")
            for t in ASSET_TYPES:
                self.risk_scorers[t] = joblib.load(
                    os.path.join(model_dir, f"risk_model_{t}.pkl"))
                self.shap_explainers[t] = joblib.load(
                    os.path.join(model_dir, f"shap_explainer_{t}.pkl"))
                self.scalers[t]         = joblib.load(
                    os.path.join(model_dir, f"scaler_{t}.pkl"))
                print(f"   [OK] {t} models loaded")

            self._loaded = True
            print("[OK] All models loaded successfully")

        except Exception as e:
            print(f"[WARN] Model load failed -- falling back to STUB_MODE: {e}")
            self.stub_mode = True

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _reading_to_df(self, asset_type: str, reading: dict) -> pd.DataFrame:
        """Convert a raw MongoDB sensor reading dict to a feature DataFrame."""
        cols = FEATURE_COLS[asset_type]
        row  = {col: reading.get(col, 0.0) for col in cols}
        return pd.DataFrame([row])

    def _scale(self, asset_type: str, df: pd.DataFrame) -> np.ndarray:
        return self.scalers[asset_type].transform(df)

    # ── Public API ────────────────────────────────────────────────────────────

    def predict(self, asset_id: str, reading: dict) -> dict:
        asset_type = extract_asset_type(asset_id)

        if self.stub_mode:
            return self._stub_predict(asset_id, asset_type)

        df      = self._reading_to_df(asset_type, reading)
        scaled  = self._scale(asset_type, df)
        
        # Suppress mismatched device warning (model matches GPU, inference on CPU)
        model = self.risk_scorers[asset_type]
        model.set_params(device="cpu")
        
        proba   = model.predict_proba(df)[0][1]
        score   = round(float(proba) * 100, 1)

        # SHAP explanation
        shap_vals   = self.shap_explainers[asset_type].shap_values(df)
        shap_arr    = np.array(shap_vals)[0]
        cols        = FEATURE_COLS[asset_type]
        top_factors = self._build_shap_factors(cols, shap_arr)

        return {
            "asset_id":         asset_id,
            "asset_type":       asset_type,
            "risk_score":       score,
            "confidence_lower": round(max(0, score - 7.2), 1),
            "confidence_upper": round(min(100, score + 6.8), 1),
            "risk_level":       risk_level(score),
            "top_factors":      top_factors,
        }

    def explain(self, asset_id: str, reading: dict) -> dict:
        asset_type = extract_asset_type(asset_id)

        if self.stub_mode:
            return self._stub_explain(asset_id, asset_type)

        df        = self._reading_to_df(asset_type, reading)
        shap_vals = self.shap_explainers[asset_type].shap_values(df)
        shap_arr  = np.array(shap_vals)[0]
        cols      = FEATURE_COLS[asset_type]

        return {
            "asset_id":    asset_id,
            "asset_type":  asset_type,
            "top_factors": self._build_shap_factors(cols, shap_arr),
        }

    def detect_anomalies(self, asset_id: str, readings: list) -> dict:
        """
        Simple reconstruction-error anomaly detection using scaler.
        Full LSTM inference wired in Phase 4.
        For now: z-score based anomaly detection on latest readings.
        """
        asset_type = extract_asset_type(asset_id)
        cols       = FEATURE_COLS[asset_type]

        anomaly_timestamps, anomaly_scores = [], []

        for r in readings:
            try:
                df    = self._reading_to_df(asset_type, r)
                scaled = self._scale(asset_type, df)
                # Z-score anomaly: mean reconstruction error across features
                score = float(np.mean(np.abs(scaled[0])))
                # Normalize to 0–1 range (z-scores > 3 = anomaly)
                norm_score = round(min(score / 3.0, 1.0), 3)
                if norm_score > 0.5:
                    anomaly_timestamps.append(str(r.get("timestamp", "")))
                    anomaly_scores.append(norm_score)
            except Exception:
                continue

        return {
            "asset_id":            asset_id,
            "asset_type":          asset_type,
            "anomaly_timestamps":  anomaly_timestamps,
            "anomaly_scores":      anomaly_scores,
        }

    def simulate_trajectory(self, asset_id: str,
                             reading: dict, delay_days: int) -> dict:
        asset_type = extract_asset_type(asset_id)

        if self.stub_mode or not self._loaded:
            return self._stub_trajectory(asset_id, asset_type, delay_days)

        # Base score from current reading
        df    = self._reading_to_df(asset_type, reading)
        proba = self.risk_scorers[asset_type].predict_proba(df)[0][1]
        base  = float(proba) * 100

        trajectory, critical_day = [], None
        for day in range(delay_days + 1):
            score = min(100, base + day * (45 / max(delay_days, 1)))
            score = round(score + np.random.normal(0, 1.2), 1)
            trajectory.append({"day": day, "risk_score": score})
            if critical_day is None and score >= 80:
                critical_day = day

        return {
            "asset_id":               asset_id,
            "asset_type":             asset_type,
            "trajectory":             trajectory,
            "critical_threshold_day": critical_day,
        }

    def get_cascade(self, asset_id: str, connected_assets: list) -> dict:
        asset_type = extract_asset_type(asset_id)

        if self.stub_mode or not self._loaded:
            return self._stub_cascade(asset_id, asset_type, connected_assets)

        # Score source asset
        affected = []
        for i, cid in enumerate(connected_assets):
            try:
                ctype      = extract_asset_type(cid)
                base_score = 70.0
                cascade_risk = round(base_score * (0.7 - i * 0.08), 1)
                affected.append({
                    "asset_id":    cid,
                    "cascade_risk": max(0, cascade_risk),
                    "distance":    i + 1,
                })
            except ValueError:
                continue

        return {
            "source_asset":        asset_id,
            "asset_type":          asset_type,
            "affected_assets":     affected,
            "total_assets_at_risk": len(affected),
        }

    def loaded_types(self) -> list:
        return ASSET_TYPES if self._loaded else []

    # ── SHAP Helper ───────────────────────────────────────────────────────────

    def _build_shap_factors(self, cols: list,
                             shap_arr: np.ndarray) -> list:
        factors = []
        # Sort by absolute impact descending
        indices = np.argsort(np.abs(shap_arr))[::-1]
        for idx in indices[:5]:
            impact = float(shap_arr[idx])
            factors.append({
                "feature":     cols[idx],
                "impact":      round(abs(impact), 4),
                "direction":   "increasing" if impact > 0
                               else "decreasing" if impact < 0
                               else "stable",
                "description": self._shap_description(
                                   cols[idx], impact),
            })
        return factors

    def _shap_description(self, feature: str, impact: float) -> str:
        direction = "above" if impact > 0 else "below"
        pct       = round(abs(impact) * 100, 1)
        descs = {
            "vibration_hz":         f"Vibration {pct}% {direction} baseline",
            "temperature_c":        f"Temperature {pct}% {direction} normal range",
            "stress_load_kn":       f"Structural load {pct}% {direction} safe limit",
            "moisture_pct":         f"Moisture {pct}% {direction} threshold — corrosion risk",
            "acoustic_emission_db": f"Acoustic emission {pct}% {direction} baseline",
            "pressure_bar":         f"Pressure {pct}% {direction} operating range",
            "acceleration_x":       f"Lateral acceleration {pct}% {direction} normal",
            "acceleration_y":       f"Longitudinal acceleration {pct}% {direction} normal",
            "acceleration_z":       f"Vertical acceleration {pct}% {direction} normal",
            "humidity_percent":     f"Humidity {pct}% {direction} safe range",
            "wind_speed_mps":       f"Wind speed {pct}% {direction} design limit",
            "fft_peak_freq":        f"Resonance frequency {pct}% {direction} baseline",
            "fft_magnitude":        f"Vibration amplitude {pct}% {direction} normal",
            "corrosion_rate_mpy":   f"Corrosion rate {pct}% {direction} safe threshold",
            "voltage_v":            f"Voltage {pct}% {direction} nominal",
            "current_a":            f"Current {pct}% {direction} rated capacity",
            "frequency_hz":         f"Grid frequency {pct}% {direction} nominal 50Hz",
            "power_kw":             f"Power {pct}% {direction} rated load",
            "oil_level_pct":        f"Oil level {pct}% {direction} minimum threshold",
            "harmonic_distortion":  f"THD {pct}% {direction} acceptable limit",
        }
        return descs.get(feature,
               f"{feature} is {pct}% {direction} normal range")

    # ── Stubs (fallback) ──────────────────────────────────────────────────────

    FIXED_SCORES = {
        "BRIDGE_001": 82.3, "PIPE_042": 61.7,
        "ROAD_012":   44.5, "TRANSFORMER_007": 77.9,
    }

    def _stub_predict(self, asset_id: str, asset_type: str) -> dict:
        import random
        score = self.FIXED_SCORES.get(asset_id, random.uniform(30, 90))
        return {
            "asset_id":         asset_id,
            "asset_type":       asset_type,
            "risk_score":       round(score, 1),
            "confidence_lower": round(score - 7.2, 1),
            "confidence_upper": round(score + 6.8, 1),
            "risk_level":       risk_level(score),
            "top_factors": [
                {"feature": "vibration_hz", "impact": 0.34,
                 "direction": "increasing",
                 "description": "Vibration 34% above baseline"},
                {"feature": "temperature_c", "impact": 0.21,
                 "direction": "increasing",
                 "description": "Temperature above normal range"},
                {"feature": "moisture_pct", "impact": 0.18,
                 "direction": "stable",
                 "description": "Moisture within normal range"},
            ],
        }

    def _stub_explain(self, asset_id: str, asset_type: str) -> dict:
        return {
            "asset_id":   asset_id,
            "asset_type": asset_type,
            "top_factors": [
                {"feature": "vibration_hz", "impact": 0.34,
                 "direction": "increasing",
                 "description": "Vibration 34% above baseline"},
            ],
        }

    def _stub_trajectory(self, asset_id: str, asset_type: str,
                          delay_days: int) -> dict:
        import random
        base = self.FIXED_SCORES.get(asset_id, 60.0)
        trajectory, critical_day = [], None
        for day in range(delay_days + 1):
            score = min(100, base + day * (40 / max(delay_days, 1)))
            score = round(score + random.gauss(0, 1.5), 1)
            trajectory.append({"day": day, "risk_score": score})
            if critical_day is None and score >= 80:
                critical_day = day
        return {"asset_id": asset_id, "asset_type": asset_type,
                "trajectory": trajectory,
                "critical_threshold_day": critical_day}

    def _stub_cascade(self, asset_id: str, asset_type: str,
                       connected: list) -> dict:
        base = self.FIXED_SCORES.get(asset_id, 70.0)
        affected = [
            {"asset_id": cid,
             "cascade_risk": round(base * (0.7 - i * 0.1), 1),
             "distance": i + 1}
            for i, cid in enumerate(connected)
        ]
        return {"source_asset": asset_id, "asset_type": asset_type,
                "affected_assets": affected,
                "total_assets_at_risk": len(affected)}


# Singleton
model_store = ModelStore()