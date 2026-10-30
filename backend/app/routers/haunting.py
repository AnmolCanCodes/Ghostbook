"""Haunting report endpoint."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.deps import get_llm_service, require_key
from app.routers.accounts import load_all_accounts
from app.schemas import HauntingReport
from app.services.haunting import analyze_accounts, fallback_summary
from app.services.llm import LLMService
from app.services.prompts import build_summary_messages

logger = logging.getLogger("ghostbook.haunting")
router = APIRouter(prefix="/haunting", tags=["haunting"])


@router.get("", response_model=HauntingReport)
async def haunting_report(
    key: bytes = Depends(require_key),
    db: Session = Depends(get_db),
    llm: LLMService = Depends(get_llm_service),
    settings: Settings = Depends(get_settings),
) -> HauntingReport:
    """Rule-based findings plus an AI summary that falls back to a template."""
    accounts = await run_in_threadpool(load_all_accounts, db, key)
    today = datetime.now(timezone.utc).date()
    findings, stats = analyze_accounts(
        accounts, today, settings.STALE_ACCOUNT_DAYS, settings.EMAIL_CONCENTRATION_LIMIT
    )
    summary, source, provider_used = fallback_summary(stats), "fallback", None
    try:
        text, provider = await llm.complete_text(lambda destination: build_summary_messages(stats))
        cleaned = text.strip()[:1000]
        if cleaned:
            summary, source, provider_used = cleaned, "ai", provider
    except Exception as exc:  # the report must never fail because AI failed
        logger.info("haunting summary fell back: %s", type(exc).__name__)
    return HauntingReport(
        score=stats.score,
        stats=stats,
        findings=findings,
        summary=summary,
        summary_source=source,  # type: ignore[arg-type]
        provider_used=provider_used,
    )