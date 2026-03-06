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

export const runScenario = (payload) =>
    request("/predict/whatif", { method: "POST", body: JSON.stringify(payload) });
