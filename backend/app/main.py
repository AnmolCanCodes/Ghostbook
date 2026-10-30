"""FastAPI application entry point."""
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.exceptions import register_exception_handlers
from app.routers import accounts, ai, auth, haunting
from app.services.llm import log_configuration_warnings

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create tables and warn about incomplete AI configuration."""
    settings = get_settings()
    init_db(settings.DATABASE_URL)
    log_configuration_warnings(settings)
    yield


app = FastAPI(title="Ghostbook", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_exception_handlers(app)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(accounts.router)
api.include_router(ai.router)
api.include_router(haunting.router)


@api.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


app.include_router(api)