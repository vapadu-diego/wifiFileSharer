"use client";

import { useEffect, useRef, useState } from "react";
import packageJson from "@/package.json";

interface SettingsModalProps {
  currentName: string;
  discoverable: boolean;
  retentionDays: number;
  nameSaving: boolean;
  nameError: string;
  settingsSaving: boolean;
  settingsError: string;
  onClose: () => void;
  onSaveName: (nickname: string) => void;
  onToggleDiscoverable: (discoverable: boolean) => void;
}

const MAX_NICKNAME_LENGTH = 20;

function formatRetention(days: number): string {
  if (days <= 0) return "se conservan para siempre";
  const value = Number.isInteger(days) ? String(days) : days.toFixed(1);
  return `se eliminan automáticamente a los ${value} día${days === 1 ? "" : "s"}`;
}

export default function SettingsModal({
  currentName,
  discoverable,
  retentionDays,
  nameSaving,
  nameError,
  settingsSaving,
  settingsError,
  onClose,
  onSaveName,
  onToggleDiscoverable,
}: SettingsModalProps) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const trimmed = value.trim().replace(/\s+/g, " ");
  const canSave =
    trimmed.length > 0 &&
    trimmed.length <= MAX_NICKNAME_LENGTH &&
    trimmed !== currentName &&
    !nameSaving;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 250,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="card animate-slideUp"
        style={{ maxWidth: "440px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Configuración</h3>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ width: "32px", height: "32px", padding: 0 }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSaveName(trimmed);
          }}
        >
          <div className="text-muted" style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "8px" }}>
            PERFIL
          </div>
          <label className="text-muted" style={{ fontSize: "0.8rem", marginBottom: "6px", display: "block" }}>
            Nombre visible
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="Tu nombre"
              autoComplete="off"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              {nameSaving ? "Guardando..." : "Guardar"}
            </button>
          </div>
          <div className="text-muted" style={{ fontSize: "0.7rem", marginTop: "4px" }}>
            Debe ser único en la red (no distingue mayúsculas).
          </div>
          {nameError && (
            <div
              className="animate-fadeIn"
              style={{
                background: "rgba(255, 51, 102, 0.1)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius)",
                padding: "10px 12px",
                color: "var(--accent)",
                fontSize: "0.85rem",
                marginTop: "10px",
              }}
            >
              {nameError}
            </div>
          )}
        </form>

        <div style={{ borderTop: "1px solid var(--card-border)", margin: "1.25rem 0" }} />

        {/* Privacy */}
        <div className="text-muted" style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "8px" }}>
          PRIVACIDAD
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            cursor: settingsSaving ? "wait" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={discoverable}
            disabled={settingsSaving}
            onChange={(e) => onToggleDiscoverable(e.target.checked)}
            style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "var(--primary)", flexShrink: 0 }}
          />
          <span>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, display: "block" }}>
              Aparecer en la lista aunque esté desconectado
            </span>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "2px" }}>
              Si lo desactivas, desaparecerás de la lista al desconectarte y nadie podrá
              dejarte mensajes nuevos hasta que vuelvas a conectarte. Mientras estás en
              línea siempre apareces.
            </span>
          </span>
        </label>
        {settingsError && (
          <div
            className="animate-fadeIn"
            style={{
              background: "rgba(255, 51, 102, 0.1)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius)",
              padding: "10px 12px",
              color: "var(--accent)",
              fontSize: "0.85rem",
              marginTop: "10px",
            }}
          >
            {settingsError}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--card-border)", margin: "1.25rem 0" }} />

        {/* About */}
        <div className="text-muted" style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "8px" }}>
          ACERCA DE
        </div>
        <div className="text-muted" style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>
          <div>
            <strong style={{ color: "var(--foreground)" }}>Wifi File Sharer</strong> v{packageJson.version}
          </div>
          <div>
            Los archivos de los chats privados {formatRetention(retentionDays)}.
            {retentionDays > 0 && " El plazo lo configura el host del servidor."}
          </div>
        </div>

        <div className="flex" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
