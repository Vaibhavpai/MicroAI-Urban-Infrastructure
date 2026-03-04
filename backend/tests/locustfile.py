"""
Load testing for InfraWatch API.
Run: locust -f tests/locustfile.py --host=http://localhost:8000

Then open http://localhost:8089
Set users: 50, spawn rate: 5, and start swarming.
"""
from locust import HttpUser, task, between
import random

ASSET_IDS = ["BRIDGE_001", "PIPE_042", "ROAD_012", "TRANSFORMER_007"]
DELAY_DAYS = [15, 30, 60, 90]


class InfraWatchUser(HttpUser):
    # Each simulated user waits 1-3 seconds between requests
    wait_time = between(1, 3)

    # ── High frequency endpoints (Dev C polls these constantly) ──────────────

    @task(5)
    def get_alerts(self):
        """Dev C polls this every 5 seconds."""
        self.client.get("/alerts")

    @task(4)
    def get_risk_scores(self):
        """Dashboard risk score panel."""
        self.client.get("/risk-scores")

    @task(3)
    def get_assets(self):
        """Asset list panel."""
        self.client.get("/assets")

    # ── Medium frequency endpoints ────────────────────────────────────────────

    @task(3)
    def predict_risk(self):
        """Risk prediction — called when user clicks an asset."""
        asset_id = random.choice(ASSET_IDS)
        self.client.post(
            "/predict/risk",
            json={"asset_id": asset_id},
            name="/predict/risk"
        )

    @task(2)
    def explain(self):
        """SHAP explanation panel."""
        asset_id = random.choice(ASSET_IDS)
        self.client.post(
            "/explain",
            json={"asset_id": asset_id},
            name="/explain"
        )

    @task(2)
    def anomaly(self):
        """Anomaly timeline chart."""
        asset_id = random.choice(ASSET_IDS)
        self.client.post(
            "/predict/anomaly",
            json={"asset_id": asset_id},
            name="/predict/anomaly"
        )

    @task(2)
    def cost_of_inaction(self):
        """Cost panel."""
        asset_id   = random.choice(ASSET_IDS)
        delay_days = random.choice(DELAY_DAYS)
        self.client.get(
            f"/cost-of-inaction/{asset_id}",
            params={"delay_days": delay_days},
            name="/cost-of-inaction/[asset_id]"
        )

    @task(2)
    def carbon_impact(self):
        """Carbon panel."""
        asset_id = random.choice(ASSET_IDS)
        self.client.get(
            f"/carbon-impact/{asset_id}",
            name="/carbon-impact/[asset_id]"
        )

    # ── Low frequency endpoints ───────────────────────────────────────────────

    @task(1)
    def weather_risk(self):
        """Weather risk panel."""
        asset_id = random.choice(ASSET_IDS)
        self.client.get(
            f"/weather-risk/{asset_id}",
            name="/weather-risk/[asset_id]"
        )

    @task(1)
    def simulate_twin(self):
        """Digital twin simulation."""
        asset_id   = random.choice(ASSET_IDS)
        delay_days = random.choice(DELAY_DAYS)
        self.client.post(
            "/simulate/twin",
            json={"asset_id": asset_id, "delay_days": delay_days},
            name="/simulate/twin"
        )

    @task(1)
    def cascade(self):
        """Cascade propagation."""
        asset_id = random.choice(ASSET_IDS)
        self.client.post(
            "/predict/cascade",
            json={"asset_id": asset_id},
            name="/predict/cascade"
        )

    @task(1)
    def get_sensor_data(self):
        """Sensor time-series chart."""
        asset_id = random.choice(ASSET_IDS)
        self.client.get(
            f"/assets/{asset_id}/sensors",
            params={"hours": 24},
            name="/assets/[asset_id]/sensors"
        )

    @task(1)
    def stream_status(self):
        """Stream status check."""
        self.client.get("/assets/stream/status")

    @task(1)
    def health(self):
        """Health check."""
        self.client.get("/health")