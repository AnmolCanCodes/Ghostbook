import { useEffect, useRef, useState } from "react";
import { ApiError, describeError, setup, unlock } from "../api.js";
import { formatCountdown } from "../lib/format.js";
import { Field } from "./AccountForm.jsx";
import AiBadge from "./AiBadge.jsx";
import { CandleGlyph, WarningIcon, Wordmark } from "./Icons.jsx";

const MIN_LENGTH = 10;
const BREAK_MS = 380;
const STRENGTH_LABELS = ["Too short", "Thin", "Fair", "Good", "Strong"];

function strengthOf(passphrase) {
  if (passphrase.length < MIN_LENGTH) return 0;
  let score = 1;
  if (passphrase.length >= 14) score += 1;
  if (passphrase.length >= 20) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) => rule.test(passphrase)).length;
  if (classes >= 3) score += 1;
  return Math.min(score, 4);
}

function triesLeft(count) {
  return `${count} ${count === 1 ? "try" : "tries"} left`;
}

/**
 * Setup and unlock in one screen. mode is "setup" or "unlock".
 * onUnlocked({ token, expiresIn }) fires after the seal animation.
 */
export default function UnlockScreen({ mode, ai, notice, onUnlocked, onAlreadyInitialized }) {
  const isSetup = mode === "setup";
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [lockMessage, setLockMessage] = useState(null);
  const [lockEnd, setLockEnd] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const firstRef = useRef(null);
  const breakTimer = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    return () => clearTimeout(breakTimer.current);
  }, []);

  useEffect(() => {
    if (!lockEnd) return undefined;
    function tick() {
      const left = Math.ceil((lockEnd - Date.now()) / 1000);
      if (left <= 0) {
        setLockEnd(null);
        setRemaining(0);
        setLockMessage(null);
      } else {
        setRemaining(left);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockEnd]);

  const locked = remaining > 0;
  const strength = strengthOf(passphrase);
  const canSubmit = isSetup
    ? passphrase.length >= MIN_LENGTH && confirm.length > 0 && acknowledged
    : passphrase.length > 0;

  function finish(result) {
    const payload = { token: result.token, expiresIn: result.expires_in_seconds };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onUnlocked(payload);
      return;
    }
    setBreaking(true);
    breakTimer.current = setTimeout(() => onUnlocked(payload), BREAK_MS);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    const found = {};
    if (isSetup) {
      if (passphrase.length < MIN_LENGTH) found.passphrase = `Use at least ${MIN_LENGTH} characters.`;
      else if (passphrase !== confirm) found.confirm = "The two entries do not match.";
    }
    setFieldErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await (isSetup ? setup(passphrase) : unlock(passphrase));
      setPassphrase("");
      setConfirm("");
      finish(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === "vault_already_initialized") {
        onAlreadyInitialized?.();
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        const seconds = Number(err.extra?.retry_after_seconds) || 60;
        setLockMessage(`Too many wrong tries. Sealed for ${formatCountdown(seconds)}.`);
        setLockEnd(Date.now() + seconds * 1000);
      } else if (err instanceof ApiError && err.code === "invalid_passphrase") {
        const left = Number(err.extra?.attempts_remaining);
        setFormError(Number.isFinite(left) ? `That is not it. ${triesLeft(left)}.` : "That is not it.");
      } else {
        setFormError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="unlock" data-breaking={breaking ? "" : undefined}>
      <div className="unlock__sheet">
        <Wordmark size="lg" />
        <h1 className="unlock__title">{isSetup ? "A new book." : "The book is sealed."}</h1>
        <p className="unlock__lede">
          {isSetup
            ? "Ghostbook keeps a map of where your accounts live: the email, the username, how you sign in, how to get back in. It never stores the passwords themselves."
            : "Your entries are encrypted with the passphrase you chose. Ghostbook never stores passwords for your accounts, only the map of where they live."}
        </p>

        {notice ? (
          <p className="unlock__notice" role="status">
            {notice}
          </p>
        ) : null}

        {isSetup ? (
          <div className="warning" role="note">
            <WarningIcon size={20} />
            <p>
              <strong>There is no recovery.</strong> Your entries are encrypted with this passphrase, and the passphrase
              is never stored anywhere. If you forget it, the book stays sealed for good.
            </p>
          </div>
        ) : null}

        <form className="unlock__form" onSubmit={handleSubmit} noValidate>
          <Field label={isSetup ? "Master passphrase" : "Passphrase"} error={fieldErrors.passphrase}>
            {(p) => (
              <input
                {...p}
                ref={firstRef}
                className="control"
                type={show ? "text" : "password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                maxLength={256}
                spellCheck={false}
                disabled={busy || breaking || locked}
              />
            )}
          </Field>

          {isSetup ? (
            <>
              {passphrase ? (
                <p className="strength">
                  <span className="strength__meter" aria-hidden="true">
                    {[1, 2, 3, 4].map((step) => (
                      <span key={step} className="strength__bar" data-on={strength >= step ? "" : undefined} />
                    ))}
                  </span>
                  <span className="label">Strength</span> <span className="mono">{STRENGTH_LABELS[strength]}</span>
                </p>
              ) : (
                <p className="field-row__hint">Length beats cleverness. A few unrelated words works well.</p>
              )}
              <Field label="Confirm passphrase" error={fieldErrors.confirm}>
                {(p) => (
                  <input
                    {...p}
                    className="control"
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                    maxLength={256}
                    spellCheck={false}
                    disabled={busy || breaking}
                  />
                )}
              </Field>
            </>
          ) : null}

          <button
            type="button"
            className="btn btn--quiet unlock__toggle"
            aria-pressed={show}
            onClick={() => setShow((value) => !value)}
          >
            {show ? "Hide passphrase" : "Show passphrase"}
          </button>

          {isSetup ? (
            <label className="check">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I understand there is no way to recover this passphrase.</span>
            </label>
          ) : null}

          {formError ? (
            <p className="form__error" role="alert">
              {formError}
            </p>
          ) : null}
          {lockMessage ? (
            <p className="form__error" role="alert">
              {lockMessage}
            </p>
          ) : null}
          {locked ? (
            <p className="unlock__countdown mono" aria-hidden="true">
              Sealed for {formatCountdown(remaining)}.
            </p>
          ) : null}

          <div className="unlock__submit">
            <span className="seal" aria-hidden="true">
              <CandleGlyph size={26} />
            </span>
            <button type="submit" className="btn btn--primary btn--wide" disabled={busy || breaking || locked || !canSubmit}>
              {isSetup ? (busy ? "Starting" : "Start the book") : busy ? "Breaking the seal" : "Break the seal"}
            </button>
          </div>
        </form>

        <AiBadge ai={ai} />
      </div>
    </main>
  );
}