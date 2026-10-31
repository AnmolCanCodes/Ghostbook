import { useId, useRef, useState } from "react";
import { ApiError, describeError } from "../api.js";
import { LOGIN_METHODS, toDateInputValue } from "../lib/format.js";
import Modal from "./Modal.jsx";

export const LIMITS = { site: 200, email: 500, username: 500, reset_route: 500, notes: 2000 };
const FIELD_NAMES = ["site", "email", "username", "login_method", "reset_route", "last_used", "notes"];

/** Form values (all strings) from an account or draft. */
export function valuesFrom(source) {
  return {
    site: source?.site ?? "",
    email: source?.email ?? "",
    username: source?.username ?? "",
    login_method: source?.login_method ?? "other",
    reset_route: source?.reset_route ?? "",
    last_used: toDateInputValue(source?.last_used),
    notes: source?.notes ?? "",
  };
}

/** Mirrors the backend limits. Returns { field: message }. */
export function validateAccount(values) {
  const errors = {};
  const site = values.site.trim();
  if (!site) errors.site = "A site name is required.";
  else if (site.length > LIMITS.site) errors.site = `Keep the site name under ${LIMITS.site} characters.`;
  for (const [key, label] of [
    ["email", "Email"],
    ["username", "Username"],
    ["reset_route", "Reset route"],
  ]) {
    if (values[key].trim().length > LIMITS[key]) {
      errors[key] = `${label} is limited to ${LIMITS[key]} characters.`;
    }
  }
  if (values.notes.trim().length > LIMITS.notes) {
    errors.notes = `Notes are limited to ${LIMITS.notes} characters.`;
  }
  if (values.last_used && !/^\d{4}-\d{2}-\d{2}$/.test(values.last_used)) {
    errors.last_used = "Use a valid date.";
  }
  return errors;
}

function blankToNull(value) {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** AccountIn payload for the API. */
export function toPayload(values) {
  return {
    site: values.site.trim(),
    email: blankToNull(values.email),
    username: blankToNull(values.username),
    login_method: values.login_method || "other",
    reset_route: blankToNull(values.reset_route),
    last_used: values.last_used || null,
    notes: blankToNull(values.notes),
  };
}

/** Labelled control with an inline error. children receives the props to spread on the control. */
export function Field({ label, error, hint, wide = false, children }) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  const control = children({
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": note ? noteId : undefined,
  });

  return (
    <div className={wide ? "field-row field-row--wide" : "field-row"} data-invalid={error ? "" : undefined}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {control}
      {error ? (
        <p id={noteId} className="field-row__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="field-row__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Create or edit an account. onSave(payload) must return a promise and may throw ApiError. */
export default function AccountForm({ account, onSave, onClose }) {
  const isEdit = Boolean(account);
  const [values, setValues] = useState(() => valuesFrom(account));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  function setValue(name) {
    return (event) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [name]: value }));
      setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    };
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validateAccount(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid();
      return;
    }
    setBusy(true);
    try {
      await onSave(toPayload(values));
    } catch (err) {
      const fromServer = err instanceof ApiError ? err.extra?.fieldErrors : null;
      if (fromServer) {
        const known = {};
        for (const name of FIELD_NAMES) if (fromServer[name]) known[name] = fromServer[name];
        setErrors(known);
        focusFirstInvalid();
      }
      setFormError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit entry" : "New entry"} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate ref={formRef}>
        <div className="form-grid">
          <Field label="Site" error={errors.site} wide>
            {(p) => (
              <input {...p} className="control" type="text" value={values.site} onChange={setValue("site")} autoComplete="off" />
            )}
          </Field>
          <Field label="Email" error={errors.email} hint="A phone number is fine here too.">
            {(p) => (
              <input
                {...p}
                className="control"
                type="text"
                inputMode="email"
                value={values.email}
                onChange={setValue("email")}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Username" error={errors.username}>
            {(p) => (
              <input
                {...p}
                className="control"
                type="text"
                value={values.username}
                onChange={setValue("username")}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Logs in with" error={errors.login_method}>
            {(p) => (
              <select {...p} className="control" value={values.login_method} onChange={setValue("login_method")}>
                {LOGIN_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Last used" error={errors.last_used}>
            {(p) => (
              <input {...p} className="control" type="date" value={values.last_used} onChange={setValue("last_used")} />
            )}
          </Field>
          <Field
            label="Reset route"
            error={errors.reset_route}
            hint='How you get back in, such as "email link" or a reset page URL.'
            wide
          >
            {(p) => (
              <input
                {...p}
                className="control"
                type="text"
                value={values.reset_route}
                onChange={setValue("reset_route")}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field
            label="Notes"
            error={errors.notes}
            hint={`${values.notes.length} / ${LIMITS.notes}`}
            wide
          >
            {(p) => (
              <textarea {...p} className="control" rows={4} value={values.notes} onChange={setValue("notes")} />
            )}
          </Field>
        </div>

        <p className="form__note">There is no password field. That is on purpose.</p>
        {formError ? (
          <p className="form__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Filing" : isEdit ? "Save changes" : "Add to the ledger"}
          </button>
        </div>
      </form>
    </Modal>
  );
}