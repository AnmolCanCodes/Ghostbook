"""AI endpoints: parse pasted text, ask the graveyard."""
from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.deps import get_llm_service, require_key
from app.routers.accounts import load_all_accounts
from app.schemas import AskIn, AskModelOutput, AskOut, ParseIn, ParseOut, ParseResult
from app.services.llm import LLMService
from app.services.prompts import (
    ASK_LOCAL_LIMIT,
    build_ask_messages,
    build_parse_messages,
    prefilter_accounts,
    select_context,
)

router = APIRouter(prefix="/ai", tags=["ai"])
MAX_PARSE_ENTRIES = 10


@router.post("/parse", response_model=ParseOut)
async def parse_text(
    body: ParseIn,
    key: bytes = Depends(require_key),
    llm: LLMService = Depends(get_llm_service),
) -> ParseOut:
    """Extract account drafts for review. Nothing is saved."""
    result, provider = await llm.complete_json(
        lambda destination: build_parse_messages(body.text, destination), ParseResult
    )
    return ParseOut(entries=result.entries[:MAX_PARSE_ENTRIES], provider_used=provider)


@router.post("/ask", response_model=AskOut)
async def ask_graveyard(
    body: AskIn,
    key: bytes = Depends(require_key),
    db: Session = Depends(get_db),
    llm: LLMService = Depends(get_llm_service),
    settings: Settings = Depends(get_settings),
) -> AskOut:
    """Answer a question using only the user's own entries."""
    accounts = await run_in_threadpool(load_all_accounts, db, key)
    candidates = prefilter_accounts(body.question, accounts, ASK_LOCAL_LIMIT)
    result, provider = await llm.complete_json(
        lambda destination: build_ask_messages(body.question, candidates, destination, settings),
        AskModelOutput,
    )
    destination = "local" if provider == "local" else "cloud"
    provided = {a.id for a in select_context(candidates, destination, settings)}
    ids: list[int] = []
    for account_id in result.matched_account_ids:
        if account_id in provided and account_id not in ids:
            ids.append(account_id)
    return AskOut(answer=result.answer.strip(), matched_account_ids=ids, provider_used=provider)