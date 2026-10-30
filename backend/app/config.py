"""Typed application settings loaded from the repo root .env file."""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Environment-backed settings. Names match the .env keys exactly."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    APP_ENV: str = "development"
    DATABASE_URL: str = "sqlite:///./ghostbook.db"
    CORS_ORIGINS: str = "http://localhost:5173"
    SESSION_TTL_MINUTES: int = 15
    MAX_UNLOCK_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 10
    STALE_ACCOUNT_DAYS: int = 180
    EMAIL_CONCENTRATION_LIMIT: int = 15

    LLM_MODE: Literal["local", "cloud", "hybrid", "off"] = "cloud"
    CLOUD_PROVIDER: Literal["groq", "google"] = "groq"
    CLOUD_SEND_NOTES: bool = False
    CLOUD_MAX_CONTEXT_ACCOUNTS: int = 15

    LOCAL_BASE_URL: str = "http://localhost:11434/v1"
    LOCAL_MODEL: str = ""
    LOCAL_API_KEY: str = "ollama"

    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "gemma2-9b-it"

    GOOGLE_API_KEY: str = ""
    GOOGLE_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    GOOGLE_MODEL: str = ""

    LLM_TIMEOUT_SECONDS: float = 30
    LLM_MAX_TOKENS: int = 700
    LLM_TEMPERATURE: float = 0.1

    @property
    def cors_origins(self) -> list[str]:
        """CORS_ORIGINS parsed into a list."""
        return [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached settings. Call get_settings.cache_clear() in tests."""
    return Settings()