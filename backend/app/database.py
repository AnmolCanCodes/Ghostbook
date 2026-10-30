"""Engine, session dependency and declarative base."""
from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import Settings, get_settings


class Base(DeclarativeBase):
    """Declarative base for all models."""


@lru_cache
def get_engine(url: str) -> Engine:
    """Create (once per URL) the SQLAlchemy engine."""
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


@lru_cache
def get_sessionmaker(url: str) -> sessionmaker[Session]:
    """Create (once per URL) the session factory."""
    return sessionmaker(bind=get_engine(url), expire_on_commit=False)


def init_db(url: str) -> None:
    """Create all tables."""
    from app import models  # noqa: F401  (registers tables on Base)

    Base.metadata.create_all(get_engine(url))


def reset_database_caches() -> None:
    """Dispose engines and clear caches. Used by tests."""
    for url in list(get_engine.cache_parameters() and []):
        pass
    get_sessionmaker.cache_clear()
    get_engine.cache_clear()


def get_db(settings: Settings = Depends(get_settings)) -> Iterator[Session]:
    """Yield a database session for one request."""
    session = get_sessionmaker(settings.DATABASE_URL)()
    try:
        yield session
    finally:
        session.close()