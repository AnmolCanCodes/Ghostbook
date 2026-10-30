"""Account CRUD and plain search."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_key
from app.exceptions import AccountNotFound
from app.models import Account
from app.schemas import AccountIn, AccountList, AccountOut
from app.security import decrypt_payload, encrypt_payload, utcnow

router = APIRouter(prefix="/accounts", tags=["accounts"])


def row_to_out(row: Account, key: bytes) -> AccountOut:
    """Decrypt a row into an AccountOut."""
    data = decrypt_payload(key, row.payload)
    return AccountOut.model_validate(
        {**data, "id": row.id, "created_at": row.created_at, "updated_at": row.updated_at}
    )


def load_all_accounts(db: Session, key: bytes) -> list[AccountOut]:
    """Decrypt every account in memory."""
    return [row_to_out(row, key) for row in db.scalars(select(Account)).all()]


def _get_row(db: Session, account_id: int) -> Account:
    row = db.get(Account, account_id)
    if row is None:
        raise AccountNotFound(f"No account with id {account_id}.")
    return row


@router.get("", response_model=AccountList)
def list_accounts(
    q: str | None = None, key: bytes = Depends(require_key), db: Session = Depends(get_db)
) -> AccountList:
    """List accounts, optionally filtered by a case-insensitive substring."""
    items = load_all_accounts(db, key)
    if q and q.strip():
        needle = q.strip().lower()
        items = [
            a for a in items
            if any(needle in (v or "").lower() for v in (a.site, a.email, a.username, a.notes))
        ]
    items.sort(key=lambda a: a.site.lower())
    return AccountList(items=items, total=len(items))


@router.post("", response_model=AccountOut, status_code=201)
def create_account(
    body: AccountIn, key: bytes = Depends(require_key), db: Session = Depends(get_db)
) -> AccountOut:
    """Create an account."""
    now = utcnow()
    row = Account(
        payload=encrypt_payload(key, body.model_dump(mode="json")), created_at=now, updated_at=now
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row_to_out(row, key)


@router.put("/{account_id}", response_model=AccountOut)
def replace_account(
    account_id: int, body: AccountIn, key: bytes = Depends(require_key), db: Session = Depends(get_db)
) -> AccountOut:
    """Replace an account entirely."""
    row = _get_row(db, account_id)
    row.payload = encrypt_payload(key, body.model_dump(mode="json"))
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return row_to_out(row, key)


@router.delete("/{account_id}", status_code=204)
def delete_account(
    account_id: int, key: bytes = Depends(require_key), db: Session = Depends(get_db)
) -> Response:
    """Delete an account."""
    db.delete(_get_row(db, account_id))
    db.commit()
    return Response(status_code=204)