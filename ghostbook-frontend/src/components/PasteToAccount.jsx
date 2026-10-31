import { useMemo, useRef, useState } from "react";
import { ApiError, createAccount, describeError, parseText } from "../api.js";
import { LOGIN_METHODS, normalizeSite, plural } from "../lib/format.js";
import { Field, toPayload, validateAccount, valuesFrom } from "./AccountForm.jsx";
import { providerLabel } from "./AiBadge.jsx";
import { WarningIcon } from "./Icons.jsx";

const MAX_CHARS = 8000;

const PRIVACY = {
  local: "Stays on this machine.",
  cloud: "Sent to the cloud model after passwords, codes and card numbers are masked.",
  hybrid: "Tries your local model first. If it is unreachable, falls back to the cloud with secrets masked.",
};

function DraftFields({ draft, onChange }) {
  const { values, errors } = draft;
  const bind = (name) => ({
    value: values[name],
    onChange: (event) => onChange(name, event.target.value),
  });

  return (
    <div className="form-grid">
      <Field label="Site" error={errors.site} wide>
        {(p) => <input {...p} {...bind("site")} className="control" type="text" autoComplete="off" />}
      </Field>
      <Field label="Email" error={errors.email}>
        {(p) => <input {...p} {...bind("email")} className="control" type="text" autoComplete="off" spellCheck={false} />}
      </Field>
      <Field label="Username" error={errors.username}>
        {(p) => (
          <input {...p} {...bind("username")} className="control" type="text" autoComplete="off" spellCheck={false} />
        )}
      </Field>
      <Field label="Logs in with">
        {(p) => (
          <select {...p} {...bind("login_method")} className="control">
            {LOGIN_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Last used" error={errors.last_used}>
        {(p) => <input {...p} {...bind("last_used")} className="control" type="date" />}
      </Field>
      <Field label="Reset route" error={errors.reset_route} wide>
        {(p) => (
          <input {...p} {...bind("reset_route")} className="control" type="text" autoComplete="off" spellCheck={false} />
        )}
      </Field>
      <Field label="Notes" error={errors.notes} wide>
        {(p) => <textarea {...p} {...bind("notes")} className="control" rows={2} />}
      </Field>
    </div>
  );
}

/**
 * Paste, review, save. Nothing is filed until "Save selected" is pressed.
 * onSaved(savedCount, failedCount) fires after each save run. onClose returns to the ledger.
 */
export default function PasteToAccount({ ai, accounts, onSaved, onClose, onNew }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState("idle");
  const [drafts, setDrafts] = useState([]);
  const [provider, setProvider] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(1);

  const existingSites = useMemo(() => new Set(accounts.map((a) => normalizeSite(a.site))), [accounts]);
  const selectedCount = drafts.filter((draft) => draft.selected).length;
  const disabled = ai.mode === "off" || error?.code === "ai_disabled";

  async function handleRead(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setPhase("reading");
    setError(null);
    try {
      const data = await parseText(trimmed);
      const entries = Array.isArray(data.entries) ? data.entries : [];
      setDrafts(
        entries.map((entry) => ({
          key: nextKey.current++,
          selected: entry.confidence !== "low",
          confidence: entry.confidence ?? "low",
          values: valuesFrom(entry),
          errors: {},
          error: null,
        }))
      );
      setProvider(data.provider_used ?? null);
      setPhase("review");
    } catch (err) {
      setError({ code: err instanceof ApiError ? err.code : "unknown", message: describeError(err) });
      setPhase("idle");
    }
  }

  function updateDraft(key, patch) {
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  function updateValue(key, name, value) {
    setDrafts((list) =>
      list.map((draft) =>
        draft.key === key
          ? { ...draft, values: { ...draft.values, [name]: value }, errors: { ...draft.errors, [name]: undefined } }
          : draft
      )
    );
  }

  function startOver() {
    setDrafts([]);
    setProvider(null);
    setPhase("idle");
  }

  async function handleSave() {
    const chosen = drafts.filter((draft) => draft.selected);
    const problems = new Map();
    for (const draft of chosen) {
      const found = validateAccount(draft.values);
      if (Object.keys(found).length > 0) problems.set(draft.key, found);
    }
    if (problems.size > 0) {
      setDrafts((list) =>
        list.map((draft) =>
          problems.has(draft.key)
            ? { ...draft, errors: problems.get(draft.key), error: "Fix the marked fields first." }
            : draft
        )
      );
      return;
    }

    setSaving(true);
    const savedKeys = new Set();
    const failures = new Map();
    for (const draft of chosen) {
      try {
        await createAccount(toPayload(draft.values));
        savedKeys.add(draft.key);
      } catch (err) {
        const fieldErrors = err instanceof ApiError && err.extra?.fieldErrors ? err.extra.fieldErrors : {};
        failures.set(draft.key, { message: describeError(err), errors: fieldErrors });
        if (err instanceof ApiError && err.code === "vault_locked") break;
      }
    }
    setSaving(false);
    setDrafts((list) =>
      list
        .filter((draft) => !savedKeys.has(draft.key))
        .map((draft) =>
          failures.has(draft.key)
            ? { ...draft, error: failures.get(draft.key).message, errors: failures.get(draft.key).errors }
            : { ...draft, error: null }
        )
    );
    onSaved(savedKeys.size, failures.size);
    if (failures.size === 0) onClose();
  }

  return (
    <section className="view paste" aria-labelledby="paste-title">
      <header className="view-head">
        <div>
          <h1 id="paste-title" className="view-title">
            Paste a signup email
          </h1>
          <p className="view-sub">
            Paste a welcome email or a messy note. The model drafts entries, you review them, and nothing is filed until
            you say so.
          </p>
        </div>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Back to the ledger
        </button>
      </header>

      {disabled ? (
        <div className="empty">
          <p className="empty__line">AI is turned off in this setup. You can still add entries by hand.</p>
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={onNew}>
              Add an account
            </button>
          </div>
        </div>
      ) : phase === "review" ? (
        <div className="review">
          <p className="transparency">Read by {providerLabel(provider)}</p>
          {drafts.length === 0 ? (
            <div className="empty">
              <p className="empty__line">Nothing that looks like an account turned up in that text.</p>
              <div className="empty__actions">
                <button type="button" className="btn" onClick={startOver}>
                  Try other text
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="drafts">
                {drafts.map((draft, index) => {
                  const duplicate = existingSites.has(normalizeSite(draft.values.site));
                  return (
                    <li key={draft.key} className="draft rise" data-selected={draft.selected ? "" : undefined} style={{ "--i": index }}>
                      <div className="draft__head">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            onChange={(event) => updateDraft(draft.key, { selected: event.target.checked })}
                          />
                          <span>File this entry</span>
                        </label>
                        <span className="chip" data-tone={draft.confidence}>
                          {draft.confidence} confidence
                        </span>
                        {duplicate ? (
                          <span className="chip chip--warn">
                            <WarningIcon size={14} /> Already in the ledger
                          </span>
                        ) : null}
                      </div>
                      <DraftFields draft={draft} onChange={(name, value) => updateValue(draft.key, name, value)} />
                      {draft.error ? (
                        <p className="form__error" role="alert">
                          {draft.error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="form__actions">
                <button type="button" className="btn" onClick={startOver} disabled={saving}>
                  Start over
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSave}
                  disabled={saving || selectedCount === 0}
                >
                  {saving ? "Filing" : `Save selected (${selectedCount})`}
                </button>
              </div>
              <p className="field-row__hint">
                {plural(drafts.length, "draft")} read. Edit anything before saving.
              </p>
            </>
          )}
        </div>
      ) : (
        <form className="form" onSubmit={handleRead}>
          <Field label="Text to read" hint={`${text.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`} wide>
            {(p) => (
              <textarea
                {...p}
                className="control control--paste"
                rows={10}
                maxLength={MAX_CHARS}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={phase === "reading"}
              />
            )}
          </Field>
          <p className="form__note">Do not paste passwords. Ghostbook does not want them.</p>
          <p className="privacy" data-mode={ai.mode}>
            {PRIVACY[ai.mode]}
          </p>
          {error ? (
            <p className="form__error" role="alert">
              {error.message}
            </p>
          ) : null}
          {phase === "reading" ? (
            <p className="inkline" role="status">
              Reading the note
            </p>
          ) : null}
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={phase === "reading" || !text.trim()}>
              {phase === "reading" ? "Reading" : "Read it"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}