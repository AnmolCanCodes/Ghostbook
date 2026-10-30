"""Shared dependencies: unlocked session and LLM service."""
from dataclasses import dataclass

from fastapi import Depends, Header

from app.config import Settings, get_settings
from app.exceptions import VaultLocked
from app.security import SessionStore, get_session_store
from app.services.llm import LLMService


@dataclass(frozen=True)
class UnlockedSession:
    """A valid session token and its derived key."""

    token: str
    key: bytes


def extract_bearer_token(authorization: str | None) -> str | None:
    """Parse an Authorization: Bearer <token> header."""
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def require_session(
    authorization: str | None = Header(default=None),
    store: SessionStore = Depends(get_session_store),
) -> UnlockedSession:
    """Require a live session, else raise VaultLocked."""
    token = extract_bearer_token(authorization)
    key = store.get_key(token)
    if token is None or key is None:
        raise VaultLocked()
    return UnlockedSession(token=token, key=key)


def require_key(session: UnlockedSession = Depends(require_session)) -> bytes:
    """Yield the derived key of the unlocked session."""
    return session.key


def get_llm_service(settings: Settings = Depends(get_settings)) -> LLMService:
    """LLM service dependency. Override in tests."""
    return LLMService(settings)