/**
 * Central API client for InfraWatch backend.
 * All pages import from here instead of hardcoding fetch URLs.
 */
const BASE = "http://127.0.0.1:8000";

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
}

// ── GET helpers ───────────────────────────────────────────────────────────────
export const getHealth = () => request("/health");
export const getAssets = () => request("/assets");
export const getRiskScores = () => request("/risk-scores");
export const getAlerts = () => request("/alerts");
export const getSensors = (id, hours = 24) => request(`/assets/${id}/sensors?hours=${hours}`);
export const getCost = (id, delay = 30) => request(`/cost-of-inaction/${id}?delay_days=${delay}`);
export const getCarbon = (id) => request(`/carbon-impact/${id}`);
export const getWeather = (id) => request(`/weather-risk/${id}`);
export const getCascade = (id) => request(`/cascade/${id}`);

// ── POST helpers ──────────────────────────────────────────────────────────────
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

export const predictRisk = (assetId) => post("/predict/risk", { asset_id: assetId });
export const predictAnomaly = (assetId) => post("/predict/anomaly", { asset_id: assetId });
export const explainAsset = (assetId) => post("/explain", { asset_id: assetId });
export const simulateTwin = (assetId, delayDays) => post("/simulate/twin", { asset_id: assetId, delay_days: delayDays });
export const predictCascade = (assetId) => post("/predict/cascade", { asset_id: assetId });
export const triggerAlerts = () => post("/alerts/trigger", {});
export const dispatchOrder = (assetId, message) => post("/alerts/dispatch", { asset_id: assetId, message });
export const federatedTrain = () => post("/federated/train", {});
export const getAIRecommendation = (body) => post("/ai-recommend", body);
