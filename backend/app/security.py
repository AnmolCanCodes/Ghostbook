"""Key derivation, Fernet helpers, session store and lockout logic."""
import base64
import hmac
import json
import math
import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from app.config import get_settings
from app.models import VaultMeta

VERIFIER_PLAINTEXT = b"ghostbook-vault-v1"
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16


def utcnow() -> datetime:
    """Current time, timezone-aware UTC."""
    return datetime.now(timezone.utc)


def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derive a urlsafe-base64 Fernet key from the passphrase with scrypt."""
    kdf = Scrypt(salt=salt, length=32, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))


def make_verifier(key: bytes) -> bytes:
    """Encrypt the verifier constant."""
    return Fernet(key).encrypt(VERIFIER_PLAINTEXT)


def check_verifier(key: bytes, verifier: bytes) -> bool:
    """True if the key decrypts the verifier to the expected constant."""
    try:
        plain = Fernet(key).decrypt(verifier)
    except InvalidToken:
        return False
    return hmac.compare_digest(plain, VERIFIER_PLAINTEXT)


def new_vault_material(passphrase: str) -> tuple[bytes, bytes, bytes]:
    """Return (salt, key, verifier) for a new vault."""
    salt = secrets.token_bytes(SALT_BYTES)
    key = derive_key(passphrase, salt)
    return salt, key, make_verifier(key)


def encrypt_payload(key: bytes, data: dict[str, Any]) -> bytes:
    """Encrypt a JSON-serializable dict."""
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return Fernet(key).encrypt(raw)


def decrypt_payload(key: bytes, token: bytes) -> dict[str, Any]:
    """Decrypt a payload produced by encrypt_payload."""
    return json.loads(Fernet(key).decrypt(token).decode("utf-8"))


@dataclass(frozen=True)
class UnlockResult:
    """Outcome of an unlock attempt. key is None on failure."""

    key: bytes | None
    attempts_remaining: int = 0
    retry_after_seconds: int = 0


def lockout_seconds_remaining(meta: VaultMeta, now: datetime) -> int:
    """Seconds left in the current lockout, 0 if none."""
    if meta.locked_until is None:
        return 0
    return max(0, math.ceil((meta.locked_until - now).total_seconds()))


def attempt_unlock(
    meta: VaultMeta,
    passphrase: str,
    now: datetime,
    max_attempts: int,
    lockout_minutes: int,
) -> UnlockResult:
    """Try a passphrase. Mutates failed_attempts and locked_until on meta.

    The caller must commit. When the attempt limit is reached the lockout starts
    and the counter resets, so a lockout always grants a fresh set of attempts.
    """
    remaining = lockout_seconds_remaining(meta, now)
    if remaining > 0:
        return UnlockResult(key=None, retry_after_seconds=remaining)
    key = derive_key(passphrase, meta.salt)
    if check_verifier(key, meta.verifier):
        meta.failed_attempts = 0
        meta.locked_until = None
        return UnlockResult(key=key)
    meta.failed_attempts += 1
    if meta.failed_attempts >= max_attempts:
        meta.failed_attempts = 0
        meta.locked_until = now + timedelta(minutes=lockout_minutes)
        return UnlockResult(key=None, retry_after_seconds=lockout_minutes * 60)
    return UnlockResult(key=None, attempts_remaining=max_attempts - meta.failed_attempts)


class SessionStore:
    """In-memory sessions with sliding idle expiry. Keys never touch disk."""

    def __init__(self, ttl_seconds: int, clock: Callable[[], datetime] = utcnow) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._clock = clock
        self._lock = threading.Lock()
        self._sessions: dict[str, dict[str, Any]] = {}

    def _purge(self, now: datetime) -> None:
        expired = [t for t, s in self._sessions.items() if now - s["last_seen"] > self._ttl]
        for token in expired:
            del self._sessions[token]

    def create(self, key: bytes) -> str:
        """Store a key and return a new random token."""
        token = secrets.token_urlsafe(32)
        now = self._clock()
        with self._lock:
            self._purge(now)
            self._sessions[token] = {"key": key, "last_seen": now}
        return token

    def get_key(self, token: str | None) -> bytes | None:
        """Return the key for a live token and slide its expiry."""
        if not token:
            return None
        now = self._clock()
        with self._lock:
            self._purge(now)
            session = self._sessions.get(token)
            if session is None:
                return None
            session["last_seen"] = now
            return session["key"]

    def drop(self, token: str | None) -> None:
        """Remove a session and its key."""
        if not token:
            return
        with self._lock:
            self._sessions.pop(token, None)


@lru_cache
def get_session_store() -> SessionStore:
    """Process-wide session store. Call cache_clear() in tests."""
    return SessionStore(get_settings().SESSION_TTL_MINUTES * 60)