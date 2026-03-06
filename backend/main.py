import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from db.database import connect_db, close_db
from config import settings
from services.model_loader import model_store
from api.routes import assets, cost, weather, carbon, alerts, federated, propagation

# New routers (ML endpoints + City + WhatIf + Replay)
from routers import risk, anomaly, explain, twin, cascade, city, whatif, replay, ai_recommend

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-18s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Connect to MongoDB
    await connect_db()

    # 2. Start sensor data pipeline
    consumer_ref = None

    if settings.USE_KAFKA:
        logger.info("[KAFKA] USE_KAFKA=True -- attempting Kafka consumer startup...")
        try:
            from stream.kafka_consumer import kafka_consumer

            # Set the bootstrap servers from config / .env
            import stream.kafka_consumer as kc_module
            kc_module.KAFKA_SERVERS = settings.KAFKA_BOOTSTRAP_SERVERS

            await kafka_consumer.start()
            consumer_ref = kafka_consumer
            logger.info("[OK] Kafka consumer running as background task")

        except Exception as e:
            logger.warning(
                f"[WARN] Kafka startup failed: {e} -- "
                f"falling back to APScheduler"
            )
            from stream.sensor_stream import start_stream
            start_stream()
            logger.info("[OK] APScheduler fallback started")
    else:
        logger.info("[INFO] USE_KAFKA=False -- using APScheduler sensor stream")
        from stream.sensor_stream import start_stream
        start_stream()

    yield

    # 3. Shutdown
    if consumer_ref:
        await consumer_ref.stop()
        logger.info("[STOP] Kafka consumer stopped")

    await close_db()
    logger.info("[STOP] Database connection closed")


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="InfraWatch API", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Old routes (GET, unchanged) ──────────────────────────────────────────────
app.include_router(assets.router,    prefix="/assets",           tags=["Assets"])
app.include_router(cost.router,      prefix="/cost-of-inaction", tags=["Cost"])
app.include_router(weather.router,   prefix="/weather-risk",     tags=["Weather"])
app.include_router(carbon.router,    prefix="/carbon-impact",    tags=["Carbon"])
app.include_router(alerts.router,    prefix="/alerts",           tags=["Alerts"])
app.include_router(federated.router, prefix="/federated",        tags=["Federated"])

# ── New ML routers (POST) ────────────────────────────────────────────────────
app.include_router(risk.router,     prefix="",          tags=["Risk"])
app.include_router(anomaly.router,  prefix="/predict",  tags=["Predict"])
app.include_router(explain.router,  prefix="",          tags=["Explain"])
app.include_router(twin.router,     prefix="/simulate", tags=["Simulation"])
app.include_router(cascade.router,  prefix="/predict",  tags=["Predict"])
app.include_router(propagation.router, prefix="/cascade", tags=["Propagation"])
app.include_router(city.router,     prefix="/cities",   tags=["Cities"])
app.include_router(whatif.router,   prefix="/predict",    tags=["WhatIf"])
app.include_router(replay.router,   prefix="/replay",    tags=["Replay"])
app.include_router(ai_recommend.router, prefix="",       tags=["AI Recommend"])


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": model_store.loaded_types(),
        "stub_mode": model_store.stub_mode,
        "kafka_enabled": settings.USE_KAFKA,
    }