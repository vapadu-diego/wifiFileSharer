"use client";

import { useEffect, ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "confirm";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  customActions?: ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
  confirmText = "Aceptar",
  cancelText = "Cancelar",
  onConfirm,
  customActions,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const iconColors = {
    info: "var(--primary)",
    warning: "var(--warning)",
    error: "var(--accent)",
    confirm: "var(--secondary)",
  };

  const icons = {
    info: (
      <svg width="48" height="48" fill="none" stroke={iconColors.info} strokeWidth="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    warning: (
      <svg width="48" height="48" fill="none" stroke={iconColors.warning} strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
      </svg>
    ),
    error: (
      <svg width="48" height="48" fill="none" stroke={iconColors.error} strokeWidth="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
    confirm: (
      <svg width="48" height="48" fill="none" stroke={iconColors.confirm} strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  };

  return (
    <div
      className="modal-overlay animate-fadeIn"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="card animate-slideUp"
        style={{
          maxWidth: "400px",
          width: "100%",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: "1rem" }}>{icons[type]}</div>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>{title}</h3>
        <p className="text-muted" style={{ marginBottom: "1.5rem" }}>{message}</p>

        <div className="flex gap-3" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          {customActions ? (
            customActions
          ) : type === "confirm" && onConfirm ? (
            <>
              <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                {cancelText}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                style={{ flex: 1 }}
              >
                {confirmText}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onClose} style={{ minWidth: "120px" }}>
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
