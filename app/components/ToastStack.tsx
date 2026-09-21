"use client";

import React from "react";
import { ToastItem } from "../hooks/useToasts";

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  onUserClick: (user: NonNullable<ToastItem["user"]>) => void;
}

export function ToastStack({ toasts, onDismiss, onUserClick }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "16px",
        bottom: "calc(16px + var(--kb-inset, 0px) + env(safe-area-inset-bottom, 0px))",
        zIndex: 300,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "auto",
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}
    >
      {toasts.map((toast) => {
        const isLight = toast.variant === "light";
        return (
        <div
          key={toast.id}
          className={`animate-toast-in ${isLight ? "toast-light" : ""}`}
          onClick={() => {
            if (toast.user) {
              onUserClick(toast.user);
            }
            onDismiss(toast.id);
          }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            width: "300px",
            maxWidth: "calc(100vw - 32px)",
            padding: "12px 14px",
            background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.14)",
            border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.28)",
            borderRadius: "var(--radius)",
            boxShadow: isLight ? "0 10px 25px -5px rgba(0, 0, 0, 0.35)" : "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            backdropFilter: isLight ? "none" : "blur(10px)",
            WebkitBackdropFilter: isLight ? "none" : "blur(10px)",
            cursor: toast.user ? "pointer" : "default",
            transition: "border-color 0.2s ease",
          }}
        >
          <span style={{ fontSize: "1.1rem", lineHeight: 1.3, flexShrink: 0 }}>{toast.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "0.85rem",
                color: isLight ? "#0f172a" : "var(--primary)",
                marginBottom: toast.body ? "2px" : 0,
              }}
            >
              {toast.title}
            </div>
            {toast.body && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: isLight ? "#334155" : "var(--foreground)",
                  lineHeight: 1.4,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                }}
              >
                {toast.body}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            style={{
              background: "none",
              border: "none",
              color: isLight ? "rgba(15, 23, 42, 0.45)" : "var(--muted)",
              cursor: "pointer",
              padding: "2px",
              fontSize: "0.85rem",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>
        );
      })}
    </div>
  );
}
