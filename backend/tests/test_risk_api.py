"""
Integration tests for risk + prediction endpoints.
Run: pytest tests/ -v
"""
import pytest
import httpx

BASE = "http://localhost:8000"


@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{BASE}/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "models_loaded" in data
    print(f"\n✅ Health: {data}")


@pytest.mark.asyncio
async def test_all_risk_scores():
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{BASE}/risk-scores")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for item in data:
        assert "asset_id"        in item
        assert "risk_score"      in item
        assert "risk_level"      in item
        assert "confidence_lower" in item
        assert "confidence_upper" in item
        assert item["confidence_lower"] <= item["risk_score"]
        assert item["confidence_upper"] >= item["risk_score"]
    print(f"\n✅ Risk scores: {len(data)} assets")


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id", [
    "ROAD_012", "BRIDGE_001", "PIPE_042", "TRANSFORMER_007"
])
async def test_predict_risk(asset_id):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{BASE}/predict/risk",
            json={"asset_id": asset_id}
        )
    assert r.status_code == 200
    data = r.json()
    assert data["asset_id"]   == asset_id
    assert 0 <= data["risk_score"] <= 100
    assert data["risk_level"] in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    assert data["confidence_lower"] <= data["risk_score"]
    assert data["confidence_upper"] >= data["risk_score"]
    assert len(data["top_factors"]) > 0
    for f in data["top_factors"]:
        assert "feature"     in f
        assert "impact"      in f
        assert "direction"   in f
        assert "description" in f
        assert f["direction"] in ["increasing", "decreasing", "stable"]
    print(f"\n✅ {asset_id}: risk={data['risk_score']} "
          f"({data['risk_level']}) "
          f"CI=[{data['confidence_lower']}, {data['confidence_upper']}]")


@pytest.mark.asyncio
async def test_predict_invalid_asset():
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{BASE}/predict/risk",
            json={"asset_id": "INVALID_001"}
        )
    assert r.status_code == 422
    print(f"\n✅ Invalid asset correctly returns 422")


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id", [
    "ROAD_012", "BRIDGE_001"
])
async def test_explain(asset_id):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{BASE}/explain",
            json={"asset_id": asset_id}
        )
    assert r.status_code == 200
    data = r.json()
    assert data["asset_id"]  == asset_id
    assert "asset_type"      in data
    assert "top_factors"     in data
    assert len(data["top_factors"]) > 0
    print(f"\n✅ Explain {asset_id}: "
          f"top={data['top_factors'][0]['feature']}")


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id", [
    "ROAD_012", "TRANSFORMER_007"
])
async def test_anomaly(asset_id):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{BASE}/predict/anomaly",
            json={"asset_id": asset_id}
        )
    assert r.status_code == 200
    data = r.json()
    assert data["asset_id"] == asset_id
    assert "anomaly_timestamps" in data
    assert "anomaly_scores"     in data
    assert len(data["anomaly_timestamps"]) == len(data["anomaly_scores"])
    print(f"\n✅ Anomaly {asset_id}: "
          f"{len(data['anomaly_scores'])} anomalies detected")


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id,delay", [
    ("BRIDGE_001", 30),
    ("ROAD_012",   60),
])
async def test_simulation(asset_id, delay):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{BASE}/simulate/twin",
            json={"asset_id": asset_id, "delay_days": delay}
        )
    assert r.status_code == 200
    data = r.json()
    assert data["asset_id"]    == asset_id
    assert len(data["trajectory"]) == delay + 1
    assert data["trajectory"][0]["day"] == 0
    assert data["trajectory"][-1]["day"] == delay
    # Risk should generally increase over time
    first = data["trajectory"][0]["risk_score"]
    last  = data["trajectory"][-1]["risk_score"]
    assert last >= first - 5   # allow small noise tolerance
    print(f"\n✅ Twin {asset_id}: day0={first} → day{delay}={last} "
          f"| critical_day={data['critical_threshold_day']}")


@pytest.mark.asyncio
@pytest.mark.parametrize("asset_id", [
    "BRIDGE_001", "PIPE_042"
])
async def test_cascade(asset_id):
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE}/predict/cascade",
            json={"asset_id": asset_id}
        )
    assert r.status_code == 200
    data = r.json()
    assert data["source_asset"] == asset_id
    assert "affected_assets"     in data
    assert "total_assets_at_risk" in data
    assert data["total_assets_at_risk"] == len(data["affected_assets"])
    for a in data["affected_assets"]:
        assert "asset_id"     in a
        assert "cascade_risk" in a
        assert "distance"     in a
        assert a["distance"]  in [1, 2]
    print(f"\n✅ Cascade {asset_id}: "
          f"{data['total_assets_at_risk']} assets at risk")