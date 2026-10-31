import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearToken,
  createAccount,
  deleteAccount,
  describeError,
  getStatus,
  listAccounts,
  lock,
  registerActivityHandler,
  registerLockHandler,
  setToken,
  updateAccount,
} from "./api.js";
import { formatCountdown, plural } from "./lib/format.js";
import AccountForm from "./components/AccountForm.jsx";
import AccountList from "./components/AccountList.jsx";
import AiBadge from "./components/AiBadge.jsx";
import AskBox from "./components/AskBox.jsx";
import HauntingReport from "./components/HauntingReport.jsx";
import { LockIcon, Wordmark } from "./components/Icons.jsx";
import PasteToAccount from "./components/PasteToAccount.jsx";
import ToastRegion, { useToasts } from "./components/Toast.jsx";
import UnlockScreen from "./components/UnlockScreen.jsx";

const SEALED_IDLE = "The book sealed itself while you were away.";
const SEALED_MANUAL = "Sealed. Nothing from this session stays in memory.";

const SECTIONS = [
  { id: "ledger", label: "Ledger" },
  { id: "ask", label: "Ask" },
  { id: "haunting", label: "Haunting" },
];

function SectionButtons({ current, onSelect, className }) {
  return SECTIONS.map((section) => (
    <button
      key={section.id}
      type="button"
      className={className}
      aria-current={current === section.id ? "page" : undefined}
      onClick={() => onSelect(section.id)}
    >
      {section.label}
    </button>
  ));
}

export default function App() {
  const [boot, setBoot] = useState("loading");
  const [bootError, setBootError] = useState(null);
  const [status, setStatus] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [notice, setNotice] = useState(null);
  const [view, setView] = useState("ledger");
  const [accounts, setAccounts] = useState(null);
  const [accountsError, setAccountsError] = useState(null);
  const [form, setForm] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const ttl = useRef(0);
  const deadline = useRef(0);
  const { toasts, notify, dismiss } = useToasts();

  const loadStatus = useCallback(async () => {
    setBoot("loading");
    try {
      const data = await getStatus();
      setStatus({ initialized: data.initialized, ai: data.ai });
      setBoot("ready");
    } catch (err) {
      setBootError(describeError(err));
      setBoot("error");
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /** Drop every piece of session state. Unmounting the workspace wipes drafts, answers and the report. */
  const sealLocal = useCallback((message) => {
    clearToken();
    setUnlocked(false);
    setAccounts(null);
    setAccountsError(null);
    setView("ledger");
    setForm(null);
    setHighlightId(null);
    setNotice(message);
  }, []);

  useEffect(() => {
    registerLockHandler(() => sealLocal(SEALED_IDLE));
    registerActivityHandler(() => {
      deadline.current = Date.now() + ttl.current * 1000;
    });
    return () => {
      registerLockHandler(null);
      registerActivityHandler(null);
    };
  }, [sealLocal]);

  useEffect(() => {
    if (!unlocked) return undefined;
    function tick() {
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      if (left <= 0) sealLocal(SEALED_IDLE);
      else setSecondsLeft(left);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unlocked, sealLocal]);

  const refreshAccounts = useCallback(async () => {
    try {
      const data = await listAccounts("");
      setAccounts(data.items ?? []);
      setAccountsError(null);
    } catch (err) {
      if (err?.name === "AbortError") return;
      const message = describeError(err);
      setAccountsError(message);
      notify(message, "error");
    }
  }, [notify]);

  const handleUnlocked = useCallback(
    ({ token, expiresIn }) => {
      setToken(token);
      ttl.current = expiresIn;
      deadline.current = Date.now() + expiresIn * 1000;
      setStatus((current) => ({ ...current, initialized: true }));
      setNotice(null);
      setView("ledger");
      setUnlocked(true);
      refreshAccounts();
    },
    [refreshAccounts]
  );

  async function handleSeal() {
    try {
      await lock();
    } catch {
      // The token is dropped locally either way.
    }
    sealLocal(SEALED_MANUAL);
  }

  const openNew = useCallback(() => setForm({ account: null }), []);
  const openEdit = useCallback((account) => setForm({ account }), []);
  const openPaste = useCallback(() => setView("paste"), []);
  const closePaste = useCallback(() => setView("ledger"), []);
  const clearHighlight = useCallback(() => setHighlightId(null), []);

  const openAccount = useCallback((id) => {
    setView("ledger");
    setHighlightId(id);
  }, []);

  async function handleSaveAccount(payload) {
    const editing = Boolean(form?.account);
    if (editing) await updateAccount(form.account.id, payload);
    else await createAccount(payload);
    setForm(null);
    await refreshAccounts();
    notify(editing ? "Entry updated." : `Filed under ${payload.site}.`, "ok");
  }

  const handleDelete = useCallback(
    async (id) => {
      try {
        await deleteAccount(id);
        await refreshAccounts();
        notify("Entry deleted.", "ok");
      } catch (err) {
        notify(describeError(err), "error");
      }
    },
    [refreshAccounts, notify]
  );

  function handlePasteSaved(saved, failed) {
    refreshAccounts();
    if (failed === 0) notify(`Filed ${plural(saved, "entry", "entries")}.`, "ok");
    else if (saved === 0) notify("Nothing was filed. The drafts are still on screen.", "error");
    else notify(`Filed ${saved}. ${failed} could not be saved and are still on screen.`, "error");
  }

  if (boot === "loading") {
    return (
      <main className="boot">
        <Wordmark size="lg" />
        <p className="inkline" role="status">
          Checking the lock
        </p>
      </main>
    );
  }

  if (boot === "error") {
    return (
      <main className="boot">
        <Wordmark size="lg" />
        <p className="form__error" role="alert">
          {bootError}
        </p>
        <div>
          <button type="button" className="btn" onClick={loadStatus}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <>
        <UnlockScreen
          mode={status.initialized ? "unlock" : "setup"}
          ai={status.ai}
          notice={notice}
          onUnlocked={handleUnlocked}
          onAlreadyInitialized={() => setStatus((current) => ({ ...current, initialized: true }))}
        />
        <ToastRegion toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const currentSection = view === "paste" ? "ledger" : view;
  const timer = `Seals in ${formatCountdown(secondsLeft)}`;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the page
      </a>
      <div className="shell">
        <aside className="rail" aria-label="Ghostbook">
          <Wordmark />
          <nav className="rail__nav" aria-label="Sections">
            <SectionButtons current={currentSection} onSelect={setView} className="nav-item" />
          </nav>
          <div className="rail__foot">
            <AiBadge ai={status.ai} />
            <p className="seal-timer mono">{timer}</p>
            <button type="button" className="btn" onClick={handleSeal}>
              <LockIcon size={16} /> Seal
            </button>
          </div>
        </aside>

        <header className="mobile-bar">
          <Wordmark />
          <div className="mobile-bar__tools">
            <span className="mobile-bar__info mono">
              {status.ai.label}
              <br />
              {timer}
            </span>
            <button type="button" className="btn btn--quiet" onClick={handleSeal}>
              <LockIcon size={16} /> Seal
            </button>
          </div>
        </header>

        <main id="main" className="main" tabIndex={-1}>
          {accounts === null ? (
            accountsError ? (
              <div className="empty">
                <p className="form__error" role="alert">
                  {accountsError}
                </p>
                <div className="empty__actions">
                  <button type="button" className="btn" onClick={refreshAccounts}>
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              <p className="inkline" role="status">
                Opening the book
              </p>
            )
          ) : (
            <>
              <div hidden={view !== "ledger"}>
                <AccountList
                  accounts={accounts}
                  active={view === "ledger"}
                  highlightId={highlightId}
                  onHighlightDone={clearHighlight}
                  onNew={openNew}
                  onPaste={openPaste}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </div>
              {view === "paste" ? (
                <PasteToAccount
                  ai={status.ai}
                  accounts={accounts}
                  onSaved={handlePasteSaved}
                  onClose={closePaste}
                  onNew={openNew}
                />
              ) : null}
              <div hidden={view !== "ask"}>
                <AskBox ai={status.ai} accounts={accounts} />
              </div>
              <div hidden={view !== "haunting"}>
                <HauntingReport active={view === "haunting"} accounts={accounts} onOpenAccount={openAccount} />
              </div>
            </>
          )}
        </main>

        <nav className="tabbar" aria-label="Sections">
          <SectionButtons current={currentSection} onSelect={setView} className="tab" />
        </nav>
      </div>

      {form ? (
        <AccountForm account={form.account} onSave={handleSaveAccount} onClose={() => setForm(null)} />
      ) : null}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </>
  );
}