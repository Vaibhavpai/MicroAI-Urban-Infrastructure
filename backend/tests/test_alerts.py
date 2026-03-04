"""
Tests for alert service + endpoints.
Run: pytest tests/test_alerts.py -v
"""
import pytest
import httpx
from services.alert_service import get_severity, should_alert

BASE = "http://localhost:8000"


# ── Unit tests ─────────────────────────────────────────────────────────────────

def test_severity_mapping():
    assert get_severity(85.0)  == "CRITICAL"
    assert get_severity(80.0)  == "CRITICAL"
    assert get_severity(79.9)  == "HIGH"
    assert get_severity(60.0)  == "HIGH"
    assert get_severity(59.9)  == "MEDIUM"
    assert get_severity(40.0)  == "MEDIUM"
    assert get_severity(39.9)  == "LOW"
    assert get_severity(0.0)   == "LOW"
    print(f"\n✅ Severity mapping correct")


def test_should_alert_above_threshold():
    assert should_alert(75.0)  is True
    assert should_alert(80.0)  is True
    assert should_alert(100.0) is True
    print(f"\n✅ should_alert correctly triggers above threshold")


def test_should_alert_below_threshold():
    assert should_alert(74.9)  is False
    assert should_alert(50.0)  is False
    assert should_alert(0.0)   is False
    print(f"\n✅ should_alert correctly suppresses below threshold")


# ── Integration tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_alerts():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/alerts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for alert in data:
        assert "alert_id"  in alert
        assert "asset_id"  in alert
        assert "risk_score" in alert
        assert "severity"  in alert
        assert "top_reason" in alert
        assert "sms_sent"  in alert
        assert "timestamp" in alert
        assert alert["severity"] in [
            "CRITICAL", "HIGH", "MEDIUM", "LOW"]
    print(f"\n✅ Alerts endpoint: {len(data)} alerts returned")


@pytest.mark.asyncio
async def test_trigger_alerts():
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(f"{BASE}/alerts/trigger")
    assert r.status_code == 200
    data = r.json()
    assert "triggered"        in data
    assert "alert_ids"        in data
    assert "skipped_cooldown" in data
    assert isinstance(data["triggered"],        int)
    assert isinstance(data["alert_ids"],        list)
    assert isinstance(data["skipped_cooldown"], list)
    print(f"\n✅ Trigger alerts: "
          f"{data['triggered']} triggered, "
          f"{len(data['skipped_cooldown'])} skipped (cooldown)")


@pytest.mark.asyncio
async def test_cascade_endpoint():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/cascade/BRIDGE_001")
    assert r.status_code == 200
    data = r.json()
    assert data["source_asset"]        == "BRIDGE_001"
    assert "source_risk_score"         in data
    assert "affected_assets"           in data
    assert "total_assets_at_risk"      in data
    assert data["total_assets_at_risk"] == len(data["affected_assets"])
    # Cascade risk should decrease with distance
    depth1 = [a for a in data["affected_assets"] if a["distance"] == 1]
    depth2 = [a for a in data["affected_assets"] if a["distance"] == 2]
    if depth1 and depth2:
        assert depth1[0]["cascade_risk"] > depth2[0]["cascade_risk"]
    print(f"\n✅ Cascade BRIDGE_001: "
          f"{data['total_assets_at_risk']} assets at risk "
          f"| source_risk={data['source_risk_score']}")


@pytest.mark.asyncio
async def test_federated_train():
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{BASE}/federated/train")
    assert r.status_code == 200
    data = r.json()
    assert data["status"]               == "completed"
    assert data["rounds_completed"]     == 5
    assert data["participating_nodes"]  == 4
    assert data["privacy_preserved"]    is True
    assert 0.80 <= data["global_model_accuracy"] <= 1.0
    assert len(data["convergence_history"]) == 5
    # Accuracy should generally improve across rounds
    rounds = data["convergence_history"]
    assert rounds[-1]["global_accuracy"] >= rounds[0]["global_accuracy"] - 0.05
    print(f"\n✅ Federated: "
          f"accuracy={data['global_model_accuracy']} "
          f"nodes={data['participating_nodes']}")