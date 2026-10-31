import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Accessible dialog: focus trap, Escape to close, focus returns to the trigger. */
export default function Modal({ title, onClose, children }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement;
    const firstField = panel.querySelector(".modal__body")?.querySelector(FOCUSABLE);
    (firstField ?? panel.querySelector(FOCUSABLE) ?? panel).focus();

    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  function onBackdropMouseDown(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div className="modal" onMouseDown={onBackdropMouseDown}>
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="modal__head">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}