import asyncio

import httpx
import openai
import pytest
from pydantic import BaseModel

from app.config import Settings
from app.exceptions import AIBadOutput, AIDisabled, AINotConfigured, AIUnavailable
from app.schemas import AccountOut, LoginMethod
from app.services.llm import LLMService
from app.services.prompts import build_ask_messages, build_parse_messages
from datetime import datetime, timezone

REQ = httpx.Request("POST", "http://test.invalid/v1/chat/completions")


def settings(**kw) -> Settings:
    base = dict(
        LLM_MODE="hybrid", CLOUD_PROVIDER="groq", LOCAL_MODEL="gemma3",
        GROQ_API_KEY="k", GROQ_MODEL="gemma2-9b-it",
    )
    base.update(kw)
    return Settings(_env_file=None, **base)


class FakeClient:
    def __init__(self, outcomes: list) -> None:
        self.outcomes = outcomes
        self.calls: list[list[dict]] = []

    async def complete(self, messages):
        self.calls.append(messages)
        outcome = self.outcomes[min(len(self.calls) - 1, len(self.outcomes) - 1)]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def service(cfg: Settings, local: FakeClient | None = None, cloud: FakeClient | None = None) -> LLMService:
    clients = {"local": local, cfg.CLOUD_PROVIDER: cloud}
    return LLMService(cfg, client_factory=lambda spec: clients[spec.name])


def status_error(cls, code: int):
    return cls("err", response=httpx.Response(code, request=REQ), body=None)


def run(coro):
    return asyncio.run(coro)


def plain(_dest):
    return [{"role": "user", "content": "hi"}]


def test_hybrid_falls_back_on_connection_error():
    local = FakeClient([openai.APIConnectionError(request=REQ)])
    cloud = FakeClient(["from cloud"])
    text, provider = run(service(settings(), local, cloud).complete_text(plain))
    assert (text, provider) == ("from cloud", "groq")
    assert len(local.calls) == 1 and len(cloud.calls) == 1


def test_hybrid_falls_back_on_timeout():
    local = FakeClient([openai.APITimeoutError(request=REQ)])
    cloud = FakeClient(["from cloud"])
    assert run(service(settings(), local, cloud).complete_text(plain))[1] == "groq"


def test_hybrid_falls_back_on_5xx():
    local = FakeClient([status_error(openai.InternalServerError, 500)])
    cloud = FakeClient(["from cloud"])
    assert run(service(settings(), local, cloud).complete_text(plain))[1] == "groq"


def test_hybrid_does_not_fall_back_on_4xx():
    local = FakeClient([status_error(openai.BadRequestError, 400)])
    cloud = FakeClient(["from cloud"])
    with pytest.raises(AIUnavailable):
        run(service(settings(), local, cloud).complete_text(plain))
    assert len(cloud.calls) == 0


def test_cloud_mode_429_becomes_unavailable():
    cloud = FakeClient([status_error(openai.RateLimitError, 429)])
    with pytest.raises(AIUnavailable):
        run(service(settings(LLM_MODE="cloud"), None, cloud).complete_text(plain))


def test_off_and_not_configured():
    with pytest.raises(AIDisabled):
        run(service(settings(LLM_MODE="off")).complete_text(plain))
    with pytest.raises(AINotConfigured):
        run(service(settings(LLM_MODE="cloud", GROQ_API_KEY="")).complete_text(plain))


def test_messages_rebuilt_per_destination_parse():
    text = "my password is hunter2 for netflix, login anmol@example.com"
    local = FakeClient([openai.APIConnectionError(request=REQ)])
    cloud = FakeClient(["ok"])
    run(service(settings(), local, cloud).complete_text(lambda d: build_parse_messages(text, d)))
    assert "hunter2" in local.calls[0][0]["content"]
    assert "hunter2" not in cloud.calls[0][0]["content"]
    assert "anmol@example.com" in cloud.calls[0][0]["content"]
    assert all(m["role"] == "user" for call in (local.calls + cloud.calls) for m in call)


def test_messages_rebuilt_per_destination_ask_excludes_cloud_notes():
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    account = AccountOut(
        id=1, site="MyBank", email="a@b.com", username=None, login_method=LoginMethod.email_password,
        reset_route=None, last_used=None, notes="private note about vault", created_at=now, updated_at=now,
    )
    cfg = settings()
    local = FakeClient([openai.APIConnectionError(request=REQ)])
    cloud = FakeClient(["ok"])
    run(service(cfg, local, cloud).complete_text(
        lambda d: build_ask_messages("which email for my bank?", [account], d, cfg)
    ))
    assert "private note about vault" in local.calls[0][0]["content"]
    assert "private note about vault" not in cloud.calls[0][0]["content"]
    assert "a@b.com" in cloud.calls[0][0]["content"]


class Out(BaseModel):
    value: int


def test_json_repair_retry_works_once():
    cloud = FakeClient(["not json at all", '```json\n{"value": 3}\n```'])
    result, provider = run(service(settings(LLM_MODE="cloud"), None, cloud).complete_json(plain, Out))
    assert result.value == 3 and provider == "groq" and len(cloud.calls) == 2
    assert "ONLY the JSON object" in cloud.calls[1][-1]["content"]


def test_json_repair_gives_up_with_bad_output():
    cloud = FakeClient(["nope", '{"value": "abc"}'])
    with pytest.raises(AIBadOutput):
        run(service(settings(LLM_MODE="cloud"), None, cloud).complete_json(plain, Out))
    assert len(cloud.calls) == 2