from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE, override=False)


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://awaken:awaken@db:5432/awaken"
    redis_url: str = "redis://redis:6379/0"

    # InsForge model gateway (OpenRouter-compatible)
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openai_model: str = "openai/gpt-4o-mini"

    # Legacy direct OpenAI key (fallback if openrouter_api_key is unset)
    openai_api_key: str | None = None

    hydra_db_api_key: str | None = None
    hydra_tenant_id: str = "awaken"
    hydra_index_timeout_seconds: float = 30.0
    hydra_index_poll_interval_seconds: float = 1.0

    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")


settings = Settings()
