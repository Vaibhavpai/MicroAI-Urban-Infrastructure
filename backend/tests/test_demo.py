"""
End-to-end demo flow test.
Simulates exactly what a judge will see during the demo.
Run: pytest tests/test_demo.py -v -s
"""
import pytest
import httpx

BASE = "http://localhost:8000"


@pytest.mark.asyncio
async def test_full_demo_flow():
    """
    Simulates the complete judge demo in order:
    1. Health check
    2. Show all assets
    3. Pick BRIDGE_001 — run risk prediction
    4. Show SHAP explanation
    5. Show anomaly detection
    6. Run digital twin — 30 day projection
    7. Show cost of inaction
    8. Show carbon impact
    9. Show weather risk
    10. Run cascade propagation
    11. Trigger alert
    12. Show federated learning
    """
    async with httpx.AsyncClient(timeout=20.0) as client:

        print("\n" + "="*55)
        print("  InfraWatch — Judge Demo Flow")
        print("="*55)

        # 1. Health
        r = await client.get(f"{BASE}/health")
        assert r.status_code == 200
        h = r.json()
        print(f"\n1. ✅ Health: {h['status']} | "
              f"Models: {h['models_loaded']}")

        # 2. All assets
        r = await client.get(f"{BASE}/assets")
        assert r.status_code == 200
        assets = r.json()
        print(f"\n2. ✅ Assets: {len(assets)} infrastructure assets loaded")
        for a in assets:
            print(f"      {a['asset_id']:<20} type={a['asset_type']:<12} "
                  f"criticality={a['criticality']}")

        # 3. Risk scores overview
        r = await client.get(f"{BASE}/risk-scores")
        assert r.status_code == 200
        scores = r.json()
        print(f"\n3. ✅ Risk Scores:")
        for s in scores:
            bar = "█" * int(s["risk_score"] / 10)
            print(f"      {s['asset_id']:<20} "
                  f"{s['risk_score']:5.1f}/100 {bar} "
                  f"[{s['risk_level']}]")

        # 4. Predict risk — BRIDGE_001
        r = await client.post(f"{BASE}/predict/risk",
                              json={"asset_id": "BRIDGE_001"})
        assert r.status_code == 200
        pred = r.json()
        print(f"\n4. ✅ BRIDGE_001 Prediction:")
        print(f"      Risk Score : {pred['risk_score']}/100 "
              f"[{pred['risk_level']}]")
        print(f"      Confidence : [{pred['confidence_lower']} — "
              f"{pred['confidence_upper']}]")

        # 5. SHAP explanation
        r = await client.post(f"{BASE}/explain",
                              json={"asset_id": "BRIDGE_001"})
        assert r.status_code == 200
        exp = r.json()
        print(f"\n5. ✅ SHAP Explanation — Top Factors:")
        for f in exp["top_factors"][:3]:
            print(f"      {f['feature']:<28} "
                  f"impact={f['impact']:.4f} "
                  f"direction={f['direction']}")
            print(f"      └─ {f['description']}")

        # 6. Anomaly detection
        r = await client.post(f"{BASE}/predict/anomaly",
                              json={"asset_id": "BRIDGE_001"})
        assert r.status_code == 200
        anom = r.json()
        print(f"\n6. ✅ Anomaly Detection — BRIDGE_001:")
        print(f"      {len(anom['anomaly_scores'])} anomalies detected "
              f"in last 24 hours")
        if anom["anomaly_scores"]:
            print(f"      Max score: "
                  f"{max(anom['anomaly_scores']):.3f}")

        # 7. Digital twin — 30 day projection
        r = await client.post(f"{BASE}/simulate/twin",
                              json={"asset_id": "BRIDGE_001",
                                    "delay_days": 30})
        assert r.status_code == 200
        twin = r.json()
        traj = twin["trajectory"]
        print(f"\n7. ✅ Digital Twin — 30 Day Projection:")
        print(f"      Day 0  : {traj[0]['risk_score']}/100")
        print(f"      Day 15 : {traj[15]['risk_score']}/100")
        print(f"      Day 30 : {traj[30]['risk_score']}/100")
        if twin["critical_threshold_day"]:
            print(f"      ⚠️  Critical threshold: "
                  f"Day {twin['critical_threshold_day']}")

        # 8. Cost of inaction
        r = await client.get(
            f"{BASE}/cost-of-inaction/BRIDGE_001",
            params={"delay_days": 30}
        )
        assert r.status_code == 200
        cost = r.json()
        print(f"\n8. ✅ Cost of Inaction (30 day delay):")
        print(f"      Preventive : ₹{cost['preventive_cost']:>12,.0f}")
        print(f"      Reactive   : ₹{cost['reactive_cost']:>12,.0f}")
        print(f"      Savings    : ₹{cost['savings']:>12,.0f}")
        print(f"      ROI        :  {cost['roi_percent']}%")

        # 9. Carbon impact
        r = await client.get(f"{BASE}/carbon-impact/BRIDGE_001")
        assert r.status_code == 200
        carbon = r.json()
        print(f"\n9. ✅ Carbon Impact:")
        print(f"      CO₂ Saved      : {carbon['co2_saved_kg']} kg")
        print(f"      Trees Saved    : {carbon['trees_equivalent']} trees/year")

        # 10. Weather risk
        r = await client.get(f"{BASE}/weather-risk/BRIDGE_001")
        assert r.status_code == 200
        weather = r.json()
        print(f"\n10. ✅ Weather Risk:")
        print(f"      Temperature    : {weather['current_weather']['temperature_c']}°C")
        print(f"      Precipitation  : {weather['current_weather']['precipitation_mm']}mm")
        print(f"      Risk Multiplier: ×{weather['weather_risk_multiplier']}")
        print(f"      Note: {weather['risk_note']}")

        # 11. Cascade propagation
        r = await client.get(f"{BASE}/cascade/BRIDGE_001")
        assert r.status_code == 200
        cascade = r.json()
        print(f"\n11. ✅ Failure Propagation from BRIDGE_001:")
        print(f"      Source risk    : {cascade['source_risk_score']}/100")
        print(f"      Assets at risk : {cascade['total_assets_at_risk']}")
        for a in cascade["affected_assets"]:
            print(f"      └─ {a['asset_id']:<20} "
                  f"cascade_risk={a['cascade_risk']} "
                  f"distance={a['distance']}")

        # 12. Trigger alert
        r = await client.post(f"{BASE}/alerts/trigger")
        assert r.status_code == 200
        alert = r.json()
        print(f"\n12. ✅ Alert System:")
        print(f"      Triggered : {alert['triggered']} alerts")
        print(f"      Alert IDs : {alert['alert_ids']}")

        # 13. Federated learning
        r = await client.post(f"{BASE}/federated/train")
        assert r.status_code == 200
        fed = r.json()
        print(f"\n13. ✅ Federated Learning:")
        print(f"      Status    : {fed['status']}")
        print(f"      Accuracy  : {fed['global_model_accuracy']}")
        print(f"      Nodes     : {fed['participating_nodes']}")
        print(f"      Privacy   : {fed['privacy_preserved']}")
        print(f"\n{'='*55}")
        print(f"  ✅ All {13} demo steps passed")
        print(f"{'='*55}")