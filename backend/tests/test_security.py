from datetime import datetime, timedelta, timezone

from app.models import VaultMeta
from app.security import (
    SessionStore,
    attempt_unlock,
    check_verifier,
    decrypt_payload,
    derive_key,
    encrypt_payload,
    make_verifier,
    new_vault_material,
)

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)
PASS = "correct horse battery"


def make_meta() -> VaultMeta:
    salt, _, verifier = new_vault_material(PASS)
    return VaultMeta(id=1, salt=salt, verifier=verifier, created_at=NOW, failed_attempts=0, locked_until=None)


def test_key_derivation_is_deterministic_per_salt():
    salt = b"s" * 16
    assert derive_key(PASS, salt) == derive_key(PASS, salt)
    assert derive_key(PASS, salt) != derive_key(PASS, b"t" * 16)


def test_encrypt_decrypt_roundtrip():
    key = derive_key(PASS, b"s" * 16)
    data = {"site": "Netflix", "email": None, "n": 1}
    assert decrypt_payload(key, encrypt_payload(key, data)) == data


def test_wrong_passphrase_rejected():
    salt = b"s" * 16
    verifier = make_verifier(derive_key(PASS, salt))
    assert check_verifier(derive_key(PASS, salt), verifier)
    assert not check_verifier(derive_key("wrong passphrase", salt), verifier)


def test_lockout_after_max_attempts_and_reset_on_success():
    meta = make_meta()
    result = attempt_unlock(meta, "nope nope nope", NOW, 3, 10)
    assert result.key is None and result.attempts_remaining == 2
    attempt_unlock(meta, "nope nope nope", NOW, 3, 10)
    result = attempt_unlock(meta, "nope nope nope", NOW, 3, 10)
    assert result.key is None and result.retry_after_seconds == 600
    assert meta.locked_until == NOW + timedelta(minutes=10)

    blocked = attempt_unlock(meta, PASS, NOW + timedelta(minutes=1), 3, 10)
    assert blocked.key is None and blocked.retry_after_seconds > 0

    ok = attempt_unlock(meta, PASS, NOW + timedelta(minutes=11), 3, 10)
    assert ok.key is not None
    assert meta.failed_attempts == 0 and meta.locked_until is None


class FakeClock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: int) -> None:
        self.now += timedelta(seconds=seconds)


def test_session_sliding_expiry():
    clock = FakeClock()
    store = SessionStore(ttl_seconds=60, clock=clock)
    token = store.create(b"key")
    clock.advance(40)
    assert store.get_key(token) == b"key"
    clock.advance(40)
    assert store.get_key(token) == b"key"
    clock.advance(61)
    assert store.get_key(token) is None


def test_session_drop():
    store = SessionStore(ttl_seconds=60, clock=FakeClock())
    token = store.create(b"key")
    store.drop(token)
    assert store.get_key(token) is None
    assert store.get_key(None) is None