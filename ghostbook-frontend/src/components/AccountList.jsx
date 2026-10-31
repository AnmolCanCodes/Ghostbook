import { useEffect, useMemo, useRef, useState } from "react";
import { describeError, listAccounts } from "../api.js";
import { LOGIN_METHODS, plural } from "../lib/format.js";
import { countGhosts, isGhost } from "../lib/staleness.js";
import AccountCard from "./AccountCard.jsx";
import { PasteIcon, PlusIcon, SearchIcon } from "./Icons.jsx";

const SEARCH_DELAY_MS = 250;

/** The ledger: search, filters and index cards. accounts is the full, unfiltered list. */
export default function AccountList({
  accounts,
  active,
  highlightId,
  onHighlightDone,
  onNew,
  onPaste,
  onEdit,
  onDelete,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [filter, setFilter] = useState("all");
  const searchRef = useRef(null);
  const requestId = useRef(0);

  // Debounced server search. Older responses are aborted and ignored.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      requestId.current += 1;
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return undefined;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await listAccounts(term, controller.signal);
        if (id === requestId.current) {
          setResults(data.items ?? []);
          setSearchError(null);
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (id === requestId.current) setSearchError(describeError(err));
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, accounts]);

  // "/" focuses search, "n" opens the form. Ignored while typing or in a dialog.
  useEffect(() => {
    if (!active) return undefined;
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing || document.querySelector('[role="dialog"]')) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "n") {
        event.preventDefault();
        onNew();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onNew]);

  // Jump to a card from the Haunting view.
  useEffect(() => {
    if (highlightId == null) return undefined;
    setQuery("");
    setFilter("all");
    const frame = requestAnimationFrame(() => {
      document.getElementById(`account-${highlightId}`)?.scrollIntoView({ block: "center" });
    });
    const timer = setTimeout(() => onHighlightDone?.(), 2600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchingNow = query.trim() !== "";
  const settled = !searchingNow || results !== null;
  const base = searchingNow ? results ?? [] : accounts;

  const methodsPresent = useMemo(
    () => LOGIN_METHODS.filter((method) => accounts.some((a) => a.login_method === method.value)),
    [accounts]
  );
  const activeFilter =
    filter === "all" || filter === "ghosts" || methodsPresent.some((m) => m.value === filter)
      ? filter
      : "all";

  const visible = useMemo(
    () =>
      base.filter((account) => {
        if (activeFilter === "all") return true;
        if (activeFilter === "ghosts") return isGhost(account);
        return account.login_method === activeFilter;
      }),
    [base, activeFilter]
  );

  const ghosts = countGhosts(visible);
  const countLine =
    `${plural(visible.length, "entry", "entries")}, ${plural(ghosts, "ghost")}` +
    (visible.length !== accounts.length ? `, of ${accounts.length} filed` : "");

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  if (accounts.length === 0) {
    return (
      <section className="view" aria-labelledby="ledger-title">
        <header className="view-head">
          <h1 id="ledger-title" className="view-title">
            The ledger
          </h1>
        </header>
        <div className="empty">
          <p className="empty__line">Nothing on file. Either you are very careful, or you have not started.</p>
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={onNew}>
              <PlusIcon size={16} /> Add an account
            </button>
            <button type="button" className="btn" onClick={onPaste}>
              <PasteIcon size={16} /> Paste a signup email
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view" aria-labelledby="ledger-title">
      <header className="view-head">
        <h1 id="ledger-title" className="view-title">
          The ledger
        </h1>
        <div className="view-actions">
          <button type="button" className="btn" onClick={onPaste}>
            <PasteIcon size={16} /> Paste a signup email
          </button>
          <button type="button" className="btn btn--primary" onClick={onNew}>
            <PlusIcon size={16} /> Add an account
          </button>
        </div>
      </header>

      <div className="search">
        <SearchIcon size={18} className="search__icon" />
        <label className="visually-hidden" htmlFor="ledger-search">
          Search the ledger
        </label>
        <input
          id="ledger-search"
          ref={searchRef}
          className="search__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search site, email, username or notes"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="search__hint" aria-hidden="true">
          /
        </kbd>
      </div>

      <div className="chips" role="group" aria-label="Filter entries">
        <button type="button" className="chip chip--button" aria-pressed={activeFilter === "all"} onClick={() => setFilter("all")}>
          All
        </button>
        {methodsPresent.map((method) => (
          <button
            key={method.value}
            type="button"
            className="chip chip--button"
            aria-pressed={activeFilter === method.value}
            onClick={() => setFilter(method.value)}
          >
            {method.label}
          </button>
        ))}
        <button
          type="button"
          className="chip chip--button chip--ghost"
          aria-pressed={activeFilter === "ghosts"}
          onClick={() => setFilter("ghosts")}
        >
          Ghosts only
        </button>
      </div>

      <p className="count" role="status">
        {settled ? countLine : searching ? "Searching" : countLine}
      </p>

      {searchError ? (
        <p className="form__error" role="alert">
          {searchError}
        </p>
      ) : null}

      {settled && visible.length === 0 ? (
        <div className="empty">
          {searchingNow ? (
            <>
              <p className="empty__line">No entry matches that. It may be filed under a different name.</p>
              <div className="empty__actions">
                <button type="button" className="btn" onClick={clearSearch}>
                  Clear search
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="empty__line">Nothing under that filter.</p>
              <div className="empty__actions">
                <button type="button" className="btn" onClick={() => setFilter("all")}>
                  Show everything
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <ul className="cards">
          {visible.map((account, index) => (
            <li key={account.id} className="cards__item">
              <AccountCard
                account={account}
                index={index}
                highlighted={account.id === highlightId}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}