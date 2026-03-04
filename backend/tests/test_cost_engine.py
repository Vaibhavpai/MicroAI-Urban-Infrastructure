"""
Unit tests for cost engine + carbon service.
Run: pytest tests/test_cost_engine.py -v
"""
import pytest
from services.cost_engine import calculate_cost_of_inaction
from services.carbon_service import calculate_carbon_impact
import httpx

BASE = "http://localhost:8000"


# ── Unit tests (no server needed) ─────────────────────────────────────────────

def test_cost_bridge_high_risk():
    result = calculate_cost_of_inaction(
        "BRIDGE_001", "bridge", 82.3, 30)
    assert result["preventive_cost"] == 250_000
    assert result["reactive_cost"]   >  result["preventive_cost"]
    assert result["savings"]         >  0
    assert result["roi_percent"]     >  0
    assert result["currency"]        == "INR"
    print(f"\n✅ Bridge cost: preventive=₹{result['preventive_cost']:,} "
          f"reactive=₹{result['reactive_cost']:,} "
          f"ROI={result['roi_percent']}%")


def test_cost_road_low_risk():
    result = calculate_cost_of_inaction(
        "ROAD_012", "road", 20.0, 10)
    assert result["preventive_cost"] == 120_000
    assert result["reactive_cost"]   >  result["preventive_cost"]
    print(f"\n✅ Road cost (low risk): ₹{result['reactive_cost']:,}")


def test_cost_increases_with_delay():
    r30  = calculate_cost_of_inaction("PIPE_042", "pipeline", 65.0, 30)
    r90  = calculate_cost_of_inaction("PIPE_042", "pipeline", 65.0, 90)
    r180 = calculate_cost_of_inaction("PIPE_042", "pipeline", 65.0, 180)
    assert r90["reactive_cost"]  > r30["reactive_cost"]
    assert r180["reactive_cost"] > r90["reactive_cost"]
    print(f"\n✅ Cost increases with delay: "
          f"30d=₹{r30['reactive_cost']:,} "
          f"90d=₹{r90['reactive_cost']:,} "
          f"180d=₹{r180['reactive_cost']:,}")


def test_cost_increases_with_risk():
    r_low  = calculate_cost_of_inaction("BRIDGE_001", "bridge", 20.0, 30)
    r_high = calculate_cost_of_inaction("BRIDGE_001", "bridge", 90.0, 30)
    assert r_high["reactive_cost"] > r_low["reactive_cost"]
    print(f"\n✅ Cost increases with risk: "
          f"low=₹{r_low['reactive_cost']:,} "
          f"high=₹{r_high['reactive_cost']:,}")


def test_carbon_bridge():
    result = calculate_carbon_impact("BRIDGE_001", "bridge")
    assert result["preventive_co2_kg"] == 120
    assert result["reactive_co2_kg"]   == 890
    assert result["co2_saved_kg"]      == 770
    assert result["trees_equivalent"]  == 35
    print(f"\n✅ Bridge carbon: saved={result['co2_saved_kg']}kg "
          f"trees={result['trees_equivalent']}")


def test_carbon_transformer():
    result = calculate_carbon_impact("TRANSFORMER_007", "transformer")
    assert result["preventive_co2_kg"] == 95
    assert result["reactive_co2_kg"]   == 710
    assert result["co2_saved_kg"]      == 615
    print(f"\n✅ Transformer carbon: saved={result['co2_saved_kg']}kg")


def test_carbon_all_asset_types():
    for asset_type in ["bridge", "pipeline", "road", "transformer"]:
        result = calculate_carbon_impact(f"TEST_001", asset_type)
        assert result["co2_saved_kg"]     > 0
        assert result["trees_equivalent"] > 0
        assert result["reactive_co2_kg"]  > result["preventive_co2_kg"]
    print(f"\n✅ All asset types have valid carbon factors")


# ── Integration tests (server must be running) ─────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id,delay", [
    ("BRIDGE_001", 30),
    ("ROAD_012",   60),
    ("PIPE_042",   90),
])
async def test_cost_endpoint(asset_id, delay):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/cost-of-inaction/{asset_id}",
            params={"delay_days": delay}
        )
    assert r.status_code == 200
    data = r.json()
    assert data["asset_id"]        == asset_id
    assert data["preventive_cost"] >  0
    assert data["reactive_cost"]   >  data["preventive_cost"]
    assert data["savings"]         >  0
    assert data["roi_percent"]     >  0
    assert data["currency"]        == "INR"
    print(f"\n✅ Cost endpoint {asset_id} delay={delay}d: "
          f"ROI={data['roi_percent']}%")


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id", [
    "BRIDGE_001", "TRANSFORMER_007"
])
async def test_carbon_endpoint(asset_id):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/carbon-impact/{asset_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["asset_id"]          == asset_id
    assert data["co2_saved_kg"]      >  0
    assert data["trees_equivalent"]  >  0
    assert data["reactive_co2_kg"]   >  data["preventive_co2_kg"]
    print(f"\n✅ Carbon {asset_id}: "
          f"saved={data['co2_saved_kg']}kg "
          f"trees={data['trees_equivalent']}")


@pytest.mark.asyncio
async def test_weather_endpoint():
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{BASE}/weather-risk/BRIDGE_001")
    assert r.status_code == 200
    data = r.json()
    assert "current_weather"          in data
    assert "weather_risk_multiplier"  in data
    assert "correlation_score"        in data
    assert "risk_note"                in data
    assert data["weather_risk_multiplier"] >= 1.0
    assert 0 <= data["correlation_score"]  <= 1.0
    w = data["current_weather"]
    assert "temperature_c"    in w
    assert "precipitation_mm" in w
    assert "humidity_pct"     in w
    assert "wind_speed_kmh"   in w
    print(f"\n✅ Weather BRIDGE_001: "
          f"temp={w['temperature_c']}°C "
          f"multiplier={data['weather_risk_multiplier']}")