"use client";

import { useEffect, useRef, useState } from "react";

interface EditNicknameModalProps {
  currentName: string;
  error: string;
  saving: boolean;
  onClose: () => void;
  onSave: (nickname: string) => void;
}

const MAX_NICKNAME_LENGTH = 20;

/**
 * Mounted only while open, so the input always starts with the current name.
 */
export default function EditNicknameModal({
  currentName,
  error,
  saving,
  onClose,
  onSave,
}: EditNicknameModalProps) {
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
    !saving;

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
      <form
        className="card animate-slideUp"
        style={{ maxWidth: "400px", width: "100%" }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(trimmed);
        }}
      >
        <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Cambiar nombre
        </h3>
        <p className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
          Tu identidad no cambia, solo el nombre visible. Debe ser único en la red
          (no distingue mayúsculas).
        </p>

        <input
          ref={inputRef}
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_NICKNAME_LENGTH}
          placeholder="Nuevo nombre"
          autoComplete="off"
        />

        <div className="text-muted" style={{ fontSize: "0.7rem", marginTop: "4px", textAlign: "right" }}>
          {trimmed.length}/{MAX_NICKNAME_LENGTH}
        </div>

        {error && (
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
            {error}
          </div>
        )}

        <div className="flex gap-3" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
