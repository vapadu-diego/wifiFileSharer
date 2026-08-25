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
        top: "16px",
        right: "16px",
        zIndex: 300,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "auto",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in"
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
            background: "rgba(18, 18, 26, 0.95)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
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
                color: "var(--primary)",
                marginBottom: "2px",
              }}
            >
              {toast.title}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--foreground)",
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
              color: "var(--muted)",
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
      ))}
    </div>
  );
}
