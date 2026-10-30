"""Custom exceptions and their JSON handlers."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class GhostbookError(Exception):
    """Base error. Body is {"detail": str, "code": str} plus optional extras."""

    status_code = 500
    code = "internal_error"
    default_detail = "Something went wrong."

    def __init__(self, detail: str | None = None, **extra: object) -> None:
        super().__init__(detail or self.default_detail)
        self.detail = detail or self.default_detail
        self.extra = extra


class VaultLocked(GhostbookError):
    status_code = 401
    code = "vault_locked"
    default_detail = "The vault is locked. Unlock it first."


class InvalidPassphrase(GhostbookError):
    status_code = 401
    code = "invalid_passphrase"
    default_detail = "Wrong passphrase."


class VaultLockedOut(GhostbookError):
    status_code = 429
    code = "vault_locked_out"
    default_detail = "Too many wrong attempts. Try again later."


class VaultAlreadyInitialized(GhostbookError):
    status_code = 409
    code = "vault_already_initialized"
    default_detail = "The vault is already set up."


class VaultNotInitialized(GhostbookError):
    status_code = 409
    code = "vault_not_initialized"
    default_detail = "The vault has not been set up yet."


class AccountNotFound(GhostbookError):
    status_code = 404
    code = "account_not_found"
    default_detail = "Account not found."


class AIDisabled(GhostbookError):
    status_code = 503
    code = "ai_disabled"
    default_detail = "AI features are turned off (LLM_MODE=off)."


class AINotConfigured(GhostbookError):
    status_code = 503
    code = "ai_not_configured"
    default_detail = "AI is not configured. Set the provider key and model in .env."


class AIUnavailable(GhostbookError):
    status_code = 502
    code = "ai_unavailable"
    default_detail = "The AI provider is unavailable."


class AIBadOutput(GhostbookError):
    status_code = 422
    code = "ai_bad_output"
    default_detail = "The AI returned output that could not be understood."


async def ghostbook_error_handler(request: Request, exc: GhostbookError) -> JSONResponse:
    """Render any GhostbookError as a consistent JSON body."""
    body: dict[str, object] = {"detail": exc.detail, "code": exc.code, **exc.extra}
    headers: dict[str, str] = {}
    retry_after = exc.extra.get("retry_after_seconds")
    if exc.status_code == 429 and isinstance(retry_after, int):
        headers["Retry-After"] = str(retry_after)
    return JSONResponse(status_code=exc.status_code, content=body, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers to the app."""
    app.add_exception_handler(GhostbookError, ghostbook_error_handler)  # type: ignore[arg-type]