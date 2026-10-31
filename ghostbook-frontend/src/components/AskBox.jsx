import { useMemo, useRef, useState } from "react";
import { ApiError, askQuestion, describeError } from "../api.js";
import AccountCard from "./AccountCard.jsx";
import { providerLabel } from "./AiBadge.jsx";

const EXAMPLES = [
  "Which email did I use for my bank?",
  "What username did I pick for GitHub?",
  "Which accounts do I sign into with Google?",
];
const MAX_HISTORY = 5;
const RETRYABLE = new Set(["ai_unavailable", "ai_bad_output", "network_error"]);

/** Ask the book. History lives in memory and disappears when the book is sealed. */
export default function AskBox({ ai, accounts }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const nextId = useRef(1);

  const byId = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const current = history.find((entry) => entry.id === selectedId) ?? null;
  const matched = current ? current.matchedIds.map((id) => byId.get(id)).filter(Boolean) : [];
  const disabled = ai.mode === "off" || error?.code === "ai_disabled";

  async function submit(text) {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await askQuestion(asked);
      const entry = {
        id: nextId.current++,
        question: asked,
        answer: typeof data.answer === "string" ? data.answer : "",
        matchedIds: Array.isArray(data.matched_account_ids) ? data.matched_account_ids : [],
        provider: data.provider_used ?? null,
      };
      setHistory((list) => [entry, ...list].slice(0, MAX_HISTORY));
      setSelectedId(entry.id);
      setQuestion("");
    } catch (err) {
      setError({
        code: err instanceof ApiError ? err.code : "unknown",
        message: describeError(err),
        question: asked,
      });
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submit(question);
  }

  function useExample(text) {
    setQuestion(text);
    submit(text);
  }

  return (
    <section className="view ask" aria-labelledby="ask-title">
      <header className="view-head">
        <div>
          <h1 id="ask-title" className="view-title">
            Ask the book
          </h1>
          <p className="view-sub">
            Answers come only from your own entries. If the book does not know, it will say so.
          </p>
        </div>
      </header>

      {disabled ? (
        <div className="empty">
          <p className="empty__line">AI is turned off in this setup. The ledger still works fully.</p>
        </div>
      ) : (
        <>
          <form className="ask__form" onSubmit={handleSubmit}>
            <label className="label" htmlFor="ask-input">
              Your question
            </label>
            <div className="ask__row">
              <input
                id="ask-input"
                className="control ask__input"
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Which email did I use for my bank?"
                maxLength={500}
                autoComplete="off"
                disabled={busy}
              />
              <button type="submit" className="btn btn--primary" disabled={busy || !question.trim()}>
                {busy ? "Asking" : "Ask"}
              </button>
            </div>
          </form>

          <div className="chips" role="group" aria-label="Example questions">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="chip chip--button"
                onClick={() => useExample(example)}
                disabled={busy}
              >
                {example}
              </button>
            ))}
          </div>

          {busy ? (
            <p className="inkline" role="status">
              Searching the ledger
            </p>
          ) : null}

          {error ? (
            <div className="form__error" role="alert">
              <p>{error.message}</p>
              {RETRYABLE.has(error.code) ? (
                <button type="button" className="btn" onClick={() => submit(error.question)} disabled={busy}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="answer" aria-live="polite">
            {current ? (
              <>
                <p className="label">You asked</p>
                <p className="answer__question">{current.question}</p>
                <p className="answer__text">{current.answer}</p>
                {current.provider ? (
                  <p className="transparency">Answered by {providerLabel(current.provider)}</p>
                ) : null}
                {matched.length > 0 ? (
                  <>
                    <h2 className="section-title">Matched entries</h2>
                    <ul className="cards cards--compact">
                      {matched.map((account, index) => (
                        <li key={account.id} className="cards__item">
                          <AccountCard account={account} index={index} compact />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="field-row__hint">No entries were matched.</p>
                )}
              </>
            ) : null}
          </div>

          {history.length > 0 ? (
            <nav className="history" aria-label="Questions from this session">
              <h2 className="label">This session</h2>
              <ol>
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="history__item"
                      aria-current={entry.id === selectedId ? "true" : undefined}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      {entry.question}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}