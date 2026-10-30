import pytest
from fastapi.testclient import TestClient

from app.database import reset_database_caches
from app.config import get_settings
from app.deps import get_llm_service
from app.exceptions import AIUnavailable
from app.main import app
from app.security import get_session_store

PASS = "correct horse battery"


def _reset() -> None:
    get_settings.cache_clear()
    reset_database_caches()
    get_session_store.cache_clear()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("LLM_MODE", "off")
    _reset()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _reset()


def keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from keys(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from keys(item)


def no_password(payload) -> None:
    assert not any("password" in str(k).lower() for k in keys(payload))


def setup(client) -> dict[str, str]:
    res = client.post("/api/auth/setup", json={"passphrase": PASS})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['token']}"}


class FakeLLM:
    def __init__(self) -> None:
        self.fail = False

    async def complete_json(self, build_messages, model):
        build_messages("local")
        build_messages("cloud")
        if model.__name__ == "ParseResult":
            return model.model_validate({"entries": [
                {"site": "Netflix", "email": "a@b.com", "login_method": "google", "confidence": "high"}
            ]}), "local"
        return model.model_validate({"answer": "Use a@b.com", "matched_account_ids": [1, 999]}), "groq"

    async def complete_text(self, build_messages):
        build_messages("cloud")
        if self.fail:
            raise AIUnavailable()
        return "Boo. Clean up the oldest accounts first.", "local"


def test_health_and_status_before_setup(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    body = client.get("/api/auth/status").json()
    assert body["initialized"] is False and body["unlocked"] is False
    assert body["ai"]["label"] == "AI: off"


def test_setup_unlock_lock_flow(client):
    assert client.post("/api/auth/setup", json={"passphrase": "short"}).status_code == 422
    headers = setup(client)
    assert client.post("/api/auth/setup", json={"passphrase": PASS}).status_code == 409
    status = client.get("/api/auth/status", headers=headers).json()
    assert status["initialized"] is True and status["unlocked"] is True
    assert client.post("/api/auth/lock", headers=headers).status_code == 204
    res = client.get("/api/accounts", headers=headers)
    assert res.status_code == 401 and res.json()["code"] == "vault_locked"
    wrong = client.post("/api/auth/unlock", json={"passphrase": "wrong wrong wrong"})
    assert wrong.status_code == 401 and wrong.json()["attempts_remaining"] == 4
    ok = client.post("/api/auth/unlock", json={"passphrase": PASS})
    assert ok.status_code == 200 and ok.json()["token"]


def test_locked_vault_rejects_without_token(client):
    setup(client)
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/haunting").status_code == 401
    assert client.post("/api/ai/ask", json={"question": "x"}).status_code == 401


def test_lockout_returns_429(client):
    setup(client)
    codes = [
        client.post("/api/auth/unlock", json={"passphrase": "wrong wrong wrong"}) for _ in range(5)
    ]
    assert [r.status_code for r in codes] == [401, 401, 401, 401, 429]
    assert codes[-1].json()["retry_after_seconds"] > 0
    assert client.post("/api/auth/unlock", json={"passphrase": PASS}).status_code == 429


def test_account_crud_and_search(client):
    headers = setup(client)
    created = client.post("/api/accounts", headers=headers, json={
        "site": "  Netflix ", "email": "me@example.com", "login_method": "google", "notes": "family plan",
    })
    assert created.status_code == 201
    account = created.json()
    assert account["site"] == "Netflix" and account["username"] is None
    client.post("/api/accounts", headers=headers, json={"site": "Amazon", "username": "me_shop"})

    listing = client.get("/api/accounts", headers=headers).json()
    assert listing["total"] == 2 and [a["site"] for a in listing["items"]] == ["Amazon", "Netflix"]
    assert client.get("/api/accounts?q=FAMILY", headers=headers).json()["total"] == 1
    assert client.get("/api/accounts?q=me_shop", headers=headers).json()["items"][0]["site"] == "Amazon"

    updated = client.put(f"/api/accounts/{account['id']}", headers=headers, json={"site": "Netflix HD"})
    assert updated.json()["site"] == "Netflix HD" and updated.json()["email"] is None
    assert client.delete(f"/api/accounts/{account['id']}", headers=headers).status_code == 204
    missing = client.delete(f"/api/accounts/{account['id']}", headers=headers)
    assert missing.status_code == 404 and missing.json()["code"] == "account_not_found"
    assert client.put("/api/accounts/9999", headers=headers, json={"site": "x"}).status_code == 404
    no_password(listing)
    no_password(updated.json())


def test_ai_endpoints_with_fake_llm(client):
    headers = setup(client)
    client.post("/api/accounts", headers=headers, json={"site": "Netflix", "email": "a@b.com"})
    app.dependency_overrides[get_llm_service] = lambda: FakeLLM()

    parsed = client.post("/api/ai/parse", headers=headers, json={"text": "signed up to Netflix"})
    assert parsed.status_code == 200
    body = parsed.json()
    assert body["provider_used"] == "local" and body["entries"][0]["confidence"] == "high"
    assert client.get("/api/accounts", headers=headers).json()["total"] == 1  # never auto-saved

    asked = client.post("/api/ai/ask", headers=headers, json={"question": "which email for netflix?"})
    assert asked.status_code == 200
    assert asked.json()["matched_account_ids"] == [1]
    assert asked.json()["provider_used"] == "groq"
    no_password(body)
    no_password(asked.json())


def test_ai_off_returns_clear_error(client):
    headers = setup(client)
    res = client.post("/api/ai/ask", headers=headers, json={"question": "hello"})
    assert res.status_code == 503 and res.json()["code"] == "ai_disabled"


def test_haunting_report_ai_and_fallback(client):
    headers = setup(client)
    client.post("/api/accounts", headers=headers, json={"site": "Old", "last_used": "2020-01-01"})
    fake = FakeLLM()
    app.dependency_overrides[get_llm_service] = lambda: fake

    report = client.get("/api/haunting", headers=headers).json()
    assert report["summary_source"] == "ai" and report["provider_used"] == "local"
    assert report["score"] == 6 and report["stats"]["stale_count"] == 1
    no_password(report)

    fake.fail = True
    fallback = client.get("/api/haunting", headers=headers)
    assert fallback.status_code == 200
    assert fallback.json()["summary_source"] == "fallback" and fallback.json()["provider_used"] is None
    assert fallback.json()["summary"]


def test_schema_has_no_password_field():
    names: list[str] = []
    for schema in app.openapi()["components"]["schemas"].values():
        names.extend(schema.get("properties", {}).keys())
    assert names and not any("password" in n.lower() for n in names)