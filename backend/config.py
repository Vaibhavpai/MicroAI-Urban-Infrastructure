from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "infrawatch"

    # n8n webhook (replaces Twilio)
    N8N_WEBHOOK_URL: str = ""         # e.g. http://localhost:5678/webhook/infrawatch-alert

    RISK_THRESHOLD: float = 75.0
    STUB_MODE: bool = True

    class Config:
        env_file = ".env"

settings = Settings()