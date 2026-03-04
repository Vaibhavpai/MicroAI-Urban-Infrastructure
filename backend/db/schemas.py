from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class Asset(BaseModel):
    asset_id: str
    asset_type: str
    location_lat: float
    location_lng: float
    age_years: int
    criticality: int
    last_maintenance_date: Optional[str] = None
    connected_assets: Optional[List[str]] = []

class SensorReading(BaseModel):
    asset_id: str
    timestamp: datetime
    vibration_hz: Optional[float] = None
    temperature_c: Optional[float] = None
    stress_load_kn: Optional[float] = None
    moisture_pct: Optional[float] = None
    acoustic_emission_db: Optional[float] = None
    pressure_bar: Optional[float] = None
    label: int = 0
    anomaly_score: float = 0.0

class RiskScore(BaseModel):
    asset_id: str
    risk_score: float
    confidence_lower: float
    confidence_upper: float
    risk_level: str          # CRITICAL | HIGH | MEDIUM | LOW
    last_updated: datetime

class SHAPFactor(BaseModel):
    feature: str
    impact: float
    direction: str           # increasing | decreasing | stable
    description: str

class PredictionResponse(BaseModel):
    asset_id: str
    risk_score: float
    confidence_lower: float
    confidence_upper: float
    risk_level: str
    top_factors: List[SHAPFactor]

class AnomalyResponse(BaseModel):
    asset_id: str
    anomaly_timestamps: List[str]
    anomaly_scores: List[float]

class SimulationRequest(BaseModel):
    asset_id: str
    delay_days: int

class TrajectoryPoint(BaseModel):
    day: int
    risk_score: float

class SimulationResponse(BaseModel):
    trajectory: List[TrajectoryPoint]
    critical_threshold_day: Optional[int] = None

class CostResponse(BaseModel):
    asset_id: str
    preventive_cost: float
    reactive_cost: float
    savings: float
    roi_percent: float
    currency: str = "INR"

class WeatherResponse(BaseModel):
    asset_id: str
    current_weather: Dict[str, Any]
    weather_risk_multiplier: float
    correlation_score: float
    risk_note: str

class CarbonResponse(BaseModel):
    asset_id: str
    preventive_co2_kg: float
    reactive_co2_kg: float
    co2_saved_kg: float
    trees_equivalent: int

class CascadeAsset(BaseModel):
    asset_id: str
    cascade_risk: float
    distance: int

class CascadeResponse(BaseModel):
    source_asset: str
    affected_assets: List[CascadeAsset]
    total_assets_at_risk: int

class Alert(BaseModel):
    alert_id: str
    asset_id: str
    risk_score: float
    severity: str
    top_reason: str
    sms_sent: bool = False
    timestamp: datetime

class FederatedResponse(BaseModel):
    status: str
    rounds_completed: int
    global_model_accuracy: float
    participating_nodes: int
    message: str

# Updated schemas — add asset_type field

class RiskScore(BaseModel):
    asset_id: str
    asset_type: str                  # ← NEW
    risk_score: float
    confidence_lower: float
    confidence_upper: float
    risk_level: str
    last_updated: datetime

class PredictionResponse(BaseModel):
    asset_id: str
    asset_type: str                  # ← NEW
    risk_score: float
    confidence_lower: float
    confidence_upper: float
    risk_level: str
    top_factors: List[SHAPFactor]

class SimulationResponse(BaseModel):
    asset_id: str                    # ← NEW
    asset_type: str                  # ← NEW
    trajectory: List[TrajectoryPoint]
    critical_threshold_day: Optional[int] = None

class CascadeResponse(BaseModel):
    source_asset: str
    asset_type: str                  # ← NEW
    affected_assets: List[CascadeAsset]
    total_assets_at_risk: int

# NEW — request bodies for POST endpoints
class RiskRequest(BaseModel):
    asset_id: str
    sensor_readings: Optional[List[dict]] = []

class AnomalyRequest(BaseModel):
    asset_id: str
    sensor_readings: Optional[List[dict]] = []

class ExplainRequest(BaseModel):
    asset_id: str
    sensor_readings: Optional[List[dict]] = []

class CascadeRequest(BaseModel):
    asset_id: str