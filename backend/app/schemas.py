"""All request and response models."""
from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Destination = Literal["local", "cloud"]
Confidence = Literal["low", "medium", "high"]
ProviderUsed = Literal["local", "groq", "google"]

_TEXT_LIMITS = {"site": 200, "email": 500, "username": 500, "reset_route": 500, "notes": 2000}


class LoginMethod(str, Enum):
    """How the user signs in to an account."""

    google = "google"
    apple = "apple"
    facebook = "facebook"
    github = "github"
    email_password = "email_password"
    phone_otp = "phone_otp"
    other = "other"


class AccountIn(BaseModel):
    """Account fields supplied by the client."""

    model_config = ConfigDict(str_strip_whitespace=True)

    site: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=500)
    username: str | None = Field(default=None, max_length=500)
    login_method: LoginMethod = LoginMethod.other
    reset_route: str | None = Field(default=None, max_length=500)
    last_used: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("email", "username", "reset_route", "notes")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return value or None


class AccountOut(AccountIn):
    """Account as returned to the client."""

    id: int
    created_at: datetime
    updated_at: datetime


class AccountList(BaseModel):
    """List of accounts."""

    items: list[AccountOut]
    total: int


class AccountDraft(AccountIn):
    """An account suggested by the model. Lenient about messy model output."""

    confidence: Confidence = "low"

    @field_validator("site", "email", "username", "reset_route", "notes", mode="before")
    @classmethod
    def _coerce_text(cls, value: object, info) -> str | None:
        if value is None:
            return None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            value = str(value)
        if isinstance(value, str):
            return value.strip()[: _TEXT_LIMITS[info.field_name]]
        return None

    @field_validator("login_method", mode="before")
    @classmethod
    def _coerce_method(cls, value: object) -> object:
        valid = {item.value for item in LoginMethod}
        return value if isinstance(value, str) and value in valid else "other"

    @field_validator("last_used", mode="before")
    @classmethod
    def _coerce_date(cls, value: object) -> object:
        if value is None or isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value).strip()[:10])
        except ValueError:
            return None

    @field_validator("confidence", mode="before")
    @classmethod
    def _coerce_confidence(cls, value: object) -> str:
        text = str(value).strip().lower() if value is not None else ""
        return text if text in ("low", "medium", "high") else "low"


class ParseResult(BaseModel):
    """Raw model output for paste-to-account."""

    entries: list[AccountDraft] = Field(default_factory=list)

    @field_validator("entries", mode="before")
    @classmethod
    def _drop_bad_entries(cls, value: object) -> list[dict]:
        if not isinstance(value, list):
            return []
        return [e for e in value if isinstance(e, dict) and str(e.get("site") or "").strip()]


class AskModelOutput(BaseModel):
    """Raw model output for ask-your-graveyard."""

    answer: str
    matched_account_ids: list[int] = Field(default_factory=list)

    @field_validator("matched_account_ids", mode="before")
    @classmethod
    def _clean_ids(cls, value: object) -> list[int]:
        if not isinstance(value, list):
            return []
        ids: list[int] = []
        for item in value:
            if isinstance(item, bool):
                continue
            if isinstance(item, int):
                ids.append(item)
            elif isinstance(item, str) and item.strip().isdigit():
                ids.append(int(item.strip()))
        return ids


class SetupIn(BaseModel):
    """First-run passphrase."""

    passphrase: str = Field(min_length=10, max_length=256)


class UnlockIn(BaseModel):
    """Passphrase for unlocking."""

    passphrase: str = Field(min_length=1, max_length=256)


class TokenOut(BaseModel):
    """Session token."""

    token: str
    expires_in_seconds: int


class AIStatus(BaseModel):
    """AI configuration summary for the UI badge."""

    mode: str
    configured_provider: str | None
    model: str | None
    label: str


class StatusOut(BaseModel):
    """Vault and AI status."""

    initialized: bool
    unlocked: bool
    ai: AIStatus


class ParseIn(BaseModel):
    """Text to parse into account drafts."""

    text: str = Field(min_length=1, max_length=8000)


class ParseOut(BaseModel):
    """Drafts for the user to review. Never auto-saved."""

    entries: list[AccountDraft]
    provider_used: ProviderUsed


class AskIn(BaseModel):
    """Natural language question."""

    question: str = Field(min_length=1, max_length=500)


class AskOut(BaseModel):
    """Answer grounded in the user's own entries."""

    answer: str
    matched_account_ids: list[int]
    provider_used: ProviderUsed


class Finding(BaseModel):
    """One haunting finding."""

    kind: Literal[
        "stale_account",
        "unknown_usage",
        "email_concentration",
        "missing_reset_route",
        "duplicate_site",
    ]
    severity: Literal["low", "medium", "high"]
    title: str
    detail: str
    account_ids: list[int]


class HauntingStats(BaseModel):
    """Aggregate numbers only."""

    total_accounts: int
    stale_count: int
    unknown_usage_count: int
    top_email_count: int
    missing_reset_route_count: int
    duplicate_site_count: int
    score: int


class HauntingReport(BaseModel):
    """Haunting report response."""

    score: int
    stats: HauntingStats
    findings: list[Finding]
    summary: str
    summary_source: Literal["ai", "fallback"]
    provider_used: str | None