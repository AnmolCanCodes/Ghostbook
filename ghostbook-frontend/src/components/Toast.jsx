import { useCallback, useEffect, useRef, useState } from "react";

const MAX_TOASTS = 4;

/** Owns the toast list. notify(message, tone) where tone is "info", "ok" or "error". */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = "info") => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 9000 : 5000)
      );
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => clearTimeout(timer));
      active.clear();
    };
  }, []);

  return { toasts, notify, dismiss };
}

/** The live region stays mounted so announcements are reliable. */
export default function ToastRegion({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          data-tone={toast.tone}
          role={toast.tone === "error" ? "alert" : undefined}
        >
          <p className="toast__message">{toast.message}</p>
          <button type="button" className="btn btn--quiet toast__dismiss" onClick={() => onDismiss(toast.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}