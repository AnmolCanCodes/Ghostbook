"""Provider-agnostic LLM client with local, cloud and hybrid modes."""
import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Protocol, TypeVar

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import Settings
from app.exceptions import AIBadOutput, AIDisabled, AINotConfigured, AIUnavailable
from app.schemas import AIStatus, Destination

logger = logging.getLogger("ghostbook.llm")

ProviderName = Literal["local", "groq", "google"]
Message = dict[str, str]
BuildMessages = Callable[[Destination], list[Message]]
T = TypeVar("T", bound=BaseModel)

REPAIR_INSTRUCTION = (
    "Your previous reply was not valid. Reply again with ONLY the JSON object in the "
    "requested shape. No markdown, no commentary."
)
_FENCE_RE = re.compile(r"```(?:json)?", re.IGNORECASE)


@dataclass(frozen=True)
class ProviderSpec:
    """Connection details for one provider."""

    name: ProviderName
    base_url: str
    api_key: str
    model: str

    @property
    def destination(self) -> Destination:
        return "local" if self.name == "local" else "cloud"

    @property
    def configured(self) -> bool:
        if not self.model:
            return False
        if self.name == "local":
            return bool(self.base_url)
        return bool(self.api_key)


class CompletionClient(Protocol):
    """Anything that can turn messages into text."""

    async def complete(self, messages: list[Message]) -> str: ...


def provider_spec(settings: Settings, name: ProviderName) -> ProviderSpec:
    """Build the spec for one provider from settings."""
    if name == "local":
        return ProviderSpec("local", settings.LOCAL_BASE_URL, settings.LOCAL_API_KEY, settings.LOCAL_MODEL)
    if name == "groq":
        return ProviderSpec("groq", settings.GROQ_BASE_URL, settings.GROQ_API_KEY, settings.GROQ_MODEL)
    return ProviderSpec("google", settings.GOOGLE_BASE_URL, settings.GOOGLE_API_KEY, settings.GOOGLE_MODEL)


def provider_chain(settings: Settings) -> list[ProviderSpec]:
    """Providers to try, in order, for the current LLM_MODE."""
    mode = settings.LLM_MODE
    if mode == "off":
        return []
    local = provider_spec(settings, "local")
    cloud = provider_spec(settings, settings.CLOUD_PROVIDER)
    if mode == "local":
        return [local]
    if mode == "cloud":
        return [cloud]
    return [local, cloud]


def ai_status(settings: Settings) -> AIStatus:
    """Summary used by /auth/status for the UI badge."""
    first = next((s for s in provider_chain(settings) if s.configured), None)
    mode = settings.LLM_MODE
    if mode == "off":
        label = "AI: off"
    elif mode == "local":
        label = "AI: local"
    elif mode == "cloud":
        label = f"AI: cloud ({settings.CLOUD_PROVIDER})"
    else:
        label = "AI: hybrid"
    return AIStatus(
        mode=mode,
        configured_provider=first.name if first else None,
        model=first.model if first else None,
        label=label,
    )


def log_configuration_warnings(settings: Settings) -> None:
    """Warn (never crash) when a selected provider is incomplete."""
    for spec in provider_chain(settings):
        if not spec.configured:
            logger.warning("AI provider '%s' is selected but its key or model is not set.", spec.name)


@lru_cache(maxsize=8)
def _sdk_client(base_url: str, api_key: str, timeout: float) -> AsyncOpenAI:
    return AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=timeout, max_retries=0)


class OpenAICompatClient:
    """Thin wrapper over AsyncOpenAI for one provider."""

    def __init__(self, spec: ProviderSpec, settings: Settings) -> None:
        self._spec = spec
        self._settings = settings
        self._client = _sdk_client(spec.base_url, spec.api_key, settings.LLM_TIMEOUT_SECONDS)

    async def complete(self, messages: list[Message]) -> str:
        response = await self._client.chat.completions.create(
            model=self._spec.model,
            messages=messages,  # type: ignore[arg-type]
            temperature=self._settings.LLM_TEMPERATURE,
            max_tokens=self._settings.LLM_MAX_TOKENS,
        )
        return response.choices[0].message.content or ""


def _should_fall_back(exc: Exception) -> bool:
    """Fall back only on connection errors, timeouts and 5xx."""
    if isinstance(exc, openai.APIConnectionError):
        return True
    return isinstance(exc, openai.APIStatusError) and exc.status_code >= 500


def _to_unavailable(exc: Exception) -> AIUnavailable:
    if isinstance(exc, openai.APIConnectionError):
        return AIUnavailable("Could not reach the AI provider.")
    if isinstance(exc, openai.APIStatusError):
        if exc.status_code == 429:
            return AIUnavailable("The AI provider is rate limiting requests. Try again shortly.")
        if exc.status_code >= 500:
            return AIUnavailable("The AI provider is having problems. Try again shortly.")
        return AIUnavailable("The AI provider rejected the request. Check the key and model settings.")
    return AIUnavailable()


def extract_json_object(text: str) -> object:
    """Strip code fences and parse the outermost JSON object."""
    cleaned = _FENCE_RE.sub("", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object found")
    return json.loads(cleaned[start : end + 1])


class LLMService:
    """Runs prompts through the provider chain with privacy-aware fallback."""

    def __init__(
        self,
        settings: Settings,
        client_factory: Callable[[ProviderSpec], CompletionClient] | None = None,
    ) -> None:
        self._settings = settings
        self._factory = client_factory or (lambda spec: OpenAICompatClient(spec, settings))

    async def complete_text(self, build_messages: BuildMessages) -> tuple[str, ProviderName]:
        """Return (text, provider_name). Messages are rebuilt per provider attempt."""
        if self._settings.LLM_MODE == "off":
            raise AIDisabled()
        usable = [spec for spec in provider_chain(self._settings) if spec.configured]
        if not usable:
            raise AINotConfigured()
        for index, spec in enumerate(usable):
            is_last = index == len(usable) - 1
            messages = build_messages(spec.destination)
            started = time.monotonic()
            try:
                text = await self._factory(spec).complete(messages)
            except openai.OpenAIError as exc:
                logger.warning(
                    "llm provider=%s ok=false duration_ms=%d error=%s",
                    spec.name, int((time.monotonic() - started) * 1000), type(exc).__name__,
                )
                if not is_last and _should_fall_back(exc):
                    continue
                raise _to_unavailable(exc) from exc
            logger.info(
                "llm provider=%s ok=true duration_ms=%d",
                spec.name, int((time.monotonic() - started) * 1000),
            )
            return text, spec.name
        raise AIUnavailable()

    async def complete_json(
        self, build_messages: BuildMessages, model: type[T]
    ) -> tuple[T, ProviderName]:
        """Return a validated model. Retries once with a repair instruction."""
        text, provider = await self.complete_text(build_messages)
        try:
            return model.model_validate(extract_json_object(text)), provider
        except ValueError:
            logger.info("llm output invalid, retrying once")

        def repair(destination: Destination) -> list[Message]:
            messages = [dict(m) for m in build_messages(destination)]
            messages[-1]["content"] += "\n\n" + REPAIR_INSTRUCTION
            return messages

        text, provider = await self.complete_text(repair)
        try:
            return model.model_validate(extract_json_object(text)), provider
        except ValueError as exc:
            raise AIBadOutput() from exc