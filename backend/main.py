from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from db.database import connect_db, close_db
from stream.sensor_stream import start_stream
from services.model_loader import model_store
from api.routes import assets, cost, weather, carbon, alerts, federated, propagation
# Old routes (unchanged endpoints)
from api.routes import assets, cost, weather, carbon, alerts, federated

# New routers (ML endpoints)
from routers import risk, anomaly, explain, twin, cascade

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    start_stream()
    yield
    await close_db()

app = FastAPI(title="InfraWatch API", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"])

# ── Old routes (GET, unchanged) ───────────────────────────────────────────────
app.include_router(assets.router,    prefix="/assets",           tags=["Assets"])
app.include_router(cost.router,      prefix="/cost-of-inaction", tags=["Cost"])
app.include_router(weather.router,   prefix="/weather-risk",     tags=["Weather"])
app.include_router(carbon.router,    prefix="/carbon-impact",    tags=["Carbon"])
app.include_router(alerts.router,    prefix="/alerts",           tags=["Alerts"])
app.include_router(federated.router, prefix="/federated",        tags=["Federated"])

# ── New ML routers (POST) ─────────────────────────────────────────────────────
app.include_router(risk.router,     prefix="", tags=["Risk"])
app.include_router(anomaly.router,  prefix="/predict", tags=["Predict"])
app.include_router(explain.router,  prefix="",         tags=["Explain"])
app.include_router(twin.router,     prefix="/simulate", tags=["Simulation"])
app.include_router(cascade.router,  prefix="/predict", tags=["Predict"])
app.include_router(propagation.router, prefix="/cascade", tags=["Propagation"])


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": model_store.loaded_types(),
        "stub_mode": model_store.stub_mode,
    }