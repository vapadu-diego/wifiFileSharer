"use client";

import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import { FILE_SIZE_OPTIONS } from "@/lib/types";

interface RoomActionResponse {
  success: boolean;
  error?: string;
}

interface CreateRoomResponse {
  success: boolean;
  roomId?: string;
  error?: string;
}

interface ConnectFormProps {
  socket: Socket;
  defaultMode?: "join" | "create";
  onRoomJoined?: (roomId: string, password?: string) => void;
  onCancel?: () => void;
}

export default function ConnectForm({ socket, defaultMode = "join", onRoomJoined, onCancel }: ConnectFormProps) {
  const [mode, setMode] = useState<"join" | "create">(defaultMode);
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState("");
  const [customRoomId, setCustomRoomId] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("wifi_sharer_nickname");
    if (stored) setNickname(stored);
  }, []);

  // Sync mode when defaultMode prop changes
  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);
  const [maxFileSize, setMaxFileSize] = useState(FILE_SIZE_OPTIONS[2].value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFileSizeDropdown, setShowFileSizeDropdown] = useState(false);

  const selectedSizeLabel = FILE_SIZE_OPTIONS.find((opt) => opt.value === maxFileSize)?.label || "100 MB";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!nickname.trim()) {
      setError("Por favor ingresa un nombre");
      setLoading(false);
      return;
    }

    if (mode === "join") {
      if (!roomId.trim()) {
        setError("Ingresa el ID de la sala");
        setLoading(false);
        return;
      }
      socket.emit("join_room", { roomId, nickname: nickname.trim(), password }, (response: RoomActionResponse) => {
        setLoading(false);
        if (!response.success) {
          setError(response.error || "Error al unirse");
        } else {
          localStorage.setItem("wifi_sharer_nickname", nickname.trim());
          localStorage.setItem("wifi_sharer_room_id", roomId);
          localStorage.setItem("wifi_sharer_room_password", password || "");
          onRoomJoined?.(roomId, password || undefined);
        }
      });
    } else {
      socket.emit("create_room", { nickname: nickname.trim(), password, maxFileSize, customId: customRoomId.trim() }, (response: CreateRoomResponse) => {
        setLoading(false);
        if (!response.success) {
          setError(response.error || "Error al crear sala");
        } else {
          localStorage.setItem("wifi_sharer_nickname", nickname.trim());
          localStorage.setItem("wifi_sharer_room_id", response.roomId ?? "");
          localStorage.setItem("wifi_sharer_room_password", password || "");
          onRoomJoined?.(response.roomId ?? "", password || undefined);
        }
      });
    }
  };

  return (
    <div className="card card-glow animate-slideUp" style={{ maxWidth: "420px", width: "100%", position: "relative" }}>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-icon btn-ghost"
          style={{ position: "absolute", top: "12px", right: "12px", width: "32px", height: "32px", padding: 0 }}
          aria-label="Cerrar"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      {/* Tabs */}
      <div className="tabs mb-6" style={{ display: "flex", gap: "6px", background: "rgba(255, 255, 255, 0.05)", padding: "4px", borderRadius: "12px" }}>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`tab ${mode === "join" ? "active" : ""}`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "12px",
            border: "none",
            borderRadius: "8px",
            background: mode === "join" ? "rgba(0, 240, 255, 0.15)" : "transparent",
            color: mode === "join" ? "var(--primary)" : "var(--muted)",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={{ lineHeight: 1 }}>Unirse</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`tab ${mode === "create" ? "active" : ""}`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "12px",
            border: "none",
            borderRadius: "8px",
            background: mode === "create" ? "rgba(0, 240, 255, 0.15)" : "transparent",
            color: mode === "create" ? "var(--primary)" : "var(--muted)",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span style={{ lineHeight: 1 }}>Crear</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Nickname */}
        <div>
          <label className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
            Tu Apodo
          </label>
          <input
            className="input"
            placeholder="Ej: Carlos"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={15}
            autoComplete="off"
          />
        </div>

        {/* Room ID (Join mode) */}
        {mode === "join" && (
          <div className="animate-fadeIn">
            <label className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
              Código de Sala
            </label>
            <input
              className="input"
              placeholder="Ej: ABCD"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textTransform: "uppercase", letterSpacing: "4px", fontWeight: "600" }}
              autoComplete="off"
            />
          </div>
        )}

        {/* Max File Size (Create mode) - Custom Dropdown */}
        {mode === "create" && (
          <div className="animate-fadeIn" style={{ position: "relative" }}>
            <label className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
              Límite de Archivo
            </label>
            <button
              type="button"
              className="input"
              onClick={() => setShowFileSizeDropdown(!showFileSizeDropdown)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                marginBottom: 0,
              }}
            >
              <span>{selectedSizeLabel}</span>
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                style={{ transform: showFileSizeDropdown ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showFileSizeDropdown && (
              <div
                className="card animate-fadeIn"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "4px",
                  padding: "6px",
                  zIndex: 10,
                  background: "#1a1a2e",
                  border: "1px solid var(--primary)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
                }}
              >
                {FILE_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setMaxFileSize(opt.value);
                      setShowFileSizeDropdown(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "12px",
                      textAlign: "left",
                      background: maxFileSize === opt.value ? "rgba(0, 240, 255, 0.2)" : "transparent",
                      border: "none",
                      borderRadius: "8px",
                      color: maxFileSize === opt.value ? "var(--primary)" : "#fff",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "0.95rem",
                      fontWeight: maxFileSize === opt.value ? 700 : 500
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = maxFileSize === opt.value ? "rgba(0, 240, 255, 0.2)" : "transparent")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Custom Room ID (Create mode) - Optional */}
        {mode === "create" && (
          <div className="animate-fadeIn">
            <label className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
              Nombre de Sala <span style={{ opacity: 0.5 }}>(opcional)</span>
            </label>
            <input
              className="input"
              placeholder="Ej: MYSALA1"
              value={customRoomId}
              onChange={(e) => setCustomRoomId(e.target.value.toUpperCase())}
              maxLength={10}
              style={{ textTransform: "uppercase", letterSpacing: "2px", fontWeight: "600" }}
              autoComplete="off"
            />
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "4px" }}>Solo letras y números, máx 10.</p>
          </div>
        )}

        {/* Password */}
        <div>
          <label className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
            Contraseña <span style={{ opacity: 0.5 }}>(opcional)</span>
          </label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </div>

        {/* Error */}
        {error && (
          <div
            className="animate-fadeIn"
            style={{
              background: "rgba(255, 51, 102, 0.1)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius)",
              padding: "12px",
              color: "var(--accent)",
              fontSize: "0.9rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: "8px" }}>
          {loading ? (
            <span className="flex items-center gap-2" style={{ justifyContent: "center" }}>
              <svg className="animate-pulse" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span>Procesando...</span>
            </span>
          ) : mode === "join" ? (
            <span className="flex items-center gap-2" style={{ justifyContent: "center" }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span style={{ lineHeight: 1 }}>Entrar a Sala</span>
            </span>
          ) : (
            <span className="flex items-center gap-2" style={{ justifyContent: "center" }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span style={{ lineHeight: 1 }}>Crear Sala</span>
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
