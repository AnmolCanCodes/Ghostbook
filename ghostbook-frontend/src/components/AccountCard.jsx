import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard.js";
import { formatExactDate, loginMethodLabel, relativeTime, safeHttpUrl } from "../lib/format.js";
import { ghostLevel, ghostNote } from "../lib/staleness.js";
import { CopyIcon, EditIcon, ExternalIcon, TrashIcon } from "./Icons.jsx";

/** Icon button that copies a value and says so quietly. */
export function CopyButton({ value, label }) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleCopy() {
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  return (
    <span className="copy">
      <button type="button" className="icon-btn" onClick={handleCopy} aria-label={`Copy ${label}`}>
        <CopyIcon size={16} />
      </button>
      <span className="copy__note" role="status">
        {state === "copied" ? "Copied" : state === "failed" ? "Not copied" : ""}
      </span>
    </span>
  );
}

function CopyRow({ term, value, site }) {
  return (
    <div className="field">
      <dt className="label">{term}</dt>
      <dd className="field__value">
        {value ? (
          <>
            <span className="mono field__text">{value}</span>
            <CopyButton value={value} label={`${term.toLowerCase()} for ${site}`} />
          </>
        ) : (
          <span className="field__empty">none on file</span>
        )}
      </dd>
    </div>
  );
}

/** One index card. compact hides everything except who and how to get in. */
export default function AccountCard({
  account,
  index = 0,
  highlighted = false,
  compact = false,
  onEdit,
  onDelete,
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const notesRef = useRef(null);
  const keepRef = useRef(null);
  const deleteRef = useRef(null);

  const level = ghostLevel(account.last_used);
  const note = ghostNote(level, account.last_used);
  const resetHref = safeHttpUrl(account.reset_route);
  const relative = relativeTime(account.last_used);

  useLayoutEffect(() => {
    const element = notesRef.current;
    if (element && !expanded) setOverflowing(element.scrollHeight > element.clientHeight + 1);
  }, [account.notes, expanded]);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  function cancelDelete() {
    setConfirming(false);
    requestAnimationFrame(() => deleteRef.current?.focus());
  }

  async function confirmDelete() {
    setDeleting(true);
    await onDelete(account.id);
    setDeleting(false);
    setConfirming(false);
  }

  return (
    <article
      id={`account-${account.id}`}
      className="card rise"
      data-ghost={level}
      data-highlighted={highlighted ? "" : undefined}
      data-compact={compact ? "" : undefined}
      style={{ "--i": index }}
    >
      <header className="card__head">
        <h3 className="card__site">{account.site}</h3>
        <div className="card__stamps">
          <span className="stamp">
            <span className="visually-hidden">Logs in with </span>
            {loginMethodLabel(account.login_method)}
          </span>
          {level === "ghost" ? <span className="stamp stamp--ghost">Ghost</span> : null}
        </div>
      </header>

      <dl className="card__fields">
        <CopyRow term="Email" value={account.email} site={account.site} />
        <CopyRow term="Username" value={account.username} site={account.site} />
        {compact ? null : (
          <>
            <div className="field">
              <dt className="label">Reset route</dt>
              <dd className="field__value">
                {!account.reset_route ? (
                  <span className="field__empty">none on file</span>
                ) : resetHref ? (
                  <a className="field__link mono" href={resetHref} target="_blank" rel="noopener noreferrer">
                    {account.reset_route}
                    <ExternalIcon size={14} />
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="mono field__text">{account.reset_route}</span>
                )}
              </dd>
            </div>
            <div className="field">
              <dt className="label">Last used</dt>
              <dd className="field__value">
                {relative ? (
                  <time className="mono" dateTime={account.last_used} title={formatExactDate(account.last_used)}>
                    {relative}
                  </time>
                ) : (
                  <span className="field__empty">unknown</span>
                )}
              </dd>
            </div>
          </>
        )}
      </dl>

      {compact ? null : (
        <>
          {account.notes ? (
            <div className="card__notes-wrap">
              <p className="card__notes" ref={notesRef} data-expanded={expanded ? "" : undefined}>
                {account.notes}
              </p>
              {overflowing || expanded ? (
                <button
                  type="button"
                  className="btn btn--quiet card__more"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
          ) : null}

          {note ? <p className="card__margin">{note}</p> : null}

          <footer className="card__actions">
            {confirming ? (
              <div className="confirm" role="group" aria-label={`Delete ${account.site}`}>
                <span className="confirm__text">Delete this entry?</span>
                <button type="button" className="btn btn--danger" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? "Deleting" : "Delete"}
                </button>
                <button type="button" className="btn" onClick={cancelDelete} ref={keepRef} disabled={deleting}>
                  Keep
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="icon-btn" onClick={() => onEdit(account)} aria-label={`Edit ${account.site}`}>
                  <EditIcon size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  onClick={() => setConfirming(true)}
                  aria-label={`Delete ${account.site}`}
                  ref={deleteRef}
                >
                  <TrashIcon size={16} />
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </article>
  );
}