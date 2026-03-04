"""
Edge case tests — makes sure nothing crashes during demo.
Run: pytest tests/test_edge_cases.py -v
"""
import pytest
import httpx

BASE = "http://localhost:8000"


@pytest.mark.asyncio
async def test_unknown_asset_predict():
    """Unknown asset_id → 422 not 500."""
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE}/predict/risk",
                              json={"asset_id": "UNKNOWN_999"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_unknown_asset_cost():
    """Unknown asset → 404 not 500."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/cost-of-inaction/FAKE_001")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_unknown_asset_carbon():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/carbon-impact/FAKE_001")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_unknown_asset_weather():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/weather-risk/FAKE_001")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_unknown_asset_cascade():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/cascade/FAKE_001")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_simulate_zero_days():
    """Edge case — delay_days=0."""
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE}/simulate/twin",
                              json={"asset_id": "BRIDGE_001",
                                    "delay_days": 0})
    assert r.status_code == 200
    data = r.json()
    assert len(data["trajectory"]) == 1
    assert data["trajectory"][0]["day"] == 0


@pytest.mark.asyncio
async def test_simulate_max_days():
    """Edge case — delay_days=365."""
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE}/simulate/twin",
                              json={"asset_id": "ROAD_012",
                                    "delay_days": 365})
    assert r.status_code == 200
    data = r.json()
    assert len(data["trajectory"]) == 366


@pytest.mark.asyncio
async def test_cost_delay_bounds():
    """delay_days must be between 1 and 365."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/cost-of-inaction/BRIDGE_001",
            params={"delay_days": 0}
        )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_sensors_default_hours():
    """Sensor endpoint works with default hours."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/assets/BRIDGE_001/sensors")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_double_alert_trigger_cooldown():
    """Triggering alerts twice in a row — second should be all skipped."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        # First trigger
        r1 = await client.post(f"{BASE}/alerts/trigger")
        assert r1.status_code == 200

        # Second trigger immediately — should hit cooldown
        r2 = await client.post(f"{BASE}/alerts/trigger")
        assert r2.status_code == 200
        data2 = r2.json()
        # All should be skipped due to 30-min cooldown
        assert data2["triggered"] == 0
        print(f"\n✅ Cooldown working: "
              f"{len(data2['skipped_cooldown'])} alerts suppressed")


@pytest.mark.asyncio
async def test_all_asset_types_predict():
    """All 4 asset types must return valid predictions."""
    test_cases = [
        "ROAD_012",
        "BRIDGE_001",
        "PIPE_042",
        "TRANSFORMER_007",
    ]
    async with httpx.AsyncClient() as client:
        for asset_id in test_cases:
            r = await client.post(f"{BASE}/predict/risk",
                                  json={"asset_id": asset_id})
            assert r.status_code == 200, f"Failed for {asset_id}"
            data = r.json()
            assert data["asset_type"] in [
                "BRIDGE", "PIPE", "ROAD", "TRANSFORMER"]
            assert 0 <= data["risk_score"] <= 100
            print(f"\n✅ {asset_id}: "
                  f"score={data['risk_score']} "
                  f"type={data['asset_type']}")