"""Vault status, setup, unlock and lock."""
from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.deps import UnlockedSession, extract_bearer_token, require_session
from app.exceptions import (
    InvalidPassphrase,
    VaultAlreadyInitialized,
    VaultLockedOut,
    VaultNotInitialized,
)
from app.models import VaultMeta
from app.schemas import SetupIn, StatusOut, TokenOut, UnlockIn
from app.security import (
    SessionStore,
    attempt_unlock,
    get_session_store,
    new_vault_material,
    utcnow,
)
from app.services.llm import ai_status

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status", response_model=StatusOut)
def auth_status(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_session_store),
) -> StatusOut:
    """Vault and AI status. Works without auth."""
    token = extract_bearer_token(authorization)
    return StatusOut(
        initialized=db.get(VaultMeta, 1) is not None,
        unlocked=store.get_key(token) is not None,
        ai=ai_status(settings),
    )


@router.post("/setup", response_model=TokenOut)
def setup(
    body: SetupIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_session_store),
) -> TokenOut:
    """Create the vault and auto-unlock it."""
    if db.get(VaultMeta, 1) is not None:
        raise VaultAlreadyInitialized()
    salt, key, verifier = new_vault_material(body.passphrase)
    db.add(
        VaultMeta(
            id=1, salt=salt, verifier=verifier, created_at=utcnow(),
            failed_attempts=0, locked_until=None,
        )
    )
    db.commit()
    return TokenOut(token=store.create(key), expires_in_seconds=settings.SESSION_TTL_MINUTES * 60)


@router.post("/unlock", response_model=TokenOut)
def unlock(
    body: UnlockIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_session_store),
) -> TokenOut:
    """Unlock with the passphrase, with persisted brute force lockout."""
    meta = db.get(VaultMeta, 1)
    if meta is None:
        raise VaultNotInitialized()
    result = attempt_unlock(
        meta, body.passphrase, utcnow(), settings.MAX_UNLOCK_ATTEMPTS, settings.LOCKOUT_MINUTES
    )
    db.commit()
    if result.key is not None:
        return TokenOut(
            token=store.create(result.key), expires_in_seconds=settings.SESSION_TTL_MINUTES * 60
        )
    if result.retry_after_seconds > 0:
        raise VaultLockedOut(retry_after_seconds=result.retry_after_seconds)
    raise InvalidPassphrase(attempts_remaining=result.attempts_remaining)


@router.post("/lock", status_code=204)
def lock(
    session: UnlockedSession = Depends(require_session),
    store: SessionStore = Depends(get_session_store),
) -> Response:
    """Drop the session and its key."""
    store.drop(session.token)
    return Response(status_code=204)