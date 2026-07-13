"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function EconomicConfirmation({
  title,
  children,
  warning,
  pending,
  error,
  confirmLabel,
  confirmDisabled = false,
  pendingLabel = "Confirmando…",
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  warning: string;
  pending: boolean;
  error: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  pendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, pending]);

  return (
    <div className="economicOverlay" role="presentation">
      <section
        className="economicDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="economic-dialog-title"
      >
        <h2 id="economic-dialog-title">{title}</h2>
        <div className="economicDialogBody">{children}</div>
        <p className="economicWarning">{warning}</p>
        {error ? (
          <div className="economicDialogError" role="alert">
            {error}
          </div>
        ) : null}
        <div className="economicDialogActions">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="button"
            type="button"
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
