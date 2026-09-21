"use client";

import { useState } from "react";
import { User } from "@/lib/types";
import { Socket } from "socket.io-client";
import Modal from "./Modal";

interface ParticipantsPanelProps {
  socket: Socket;
  users: User[];
  hostId: string;
  currentUserId: string;
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ParticipantsPanel({ socket, users, hostId, currentUserId, roomId, isOpen, onClose }: ParticipantsPanelProps) {
  const isHost = currentUserId === hostId;
  const [confirmModal, setConfirmModal] = useState<{ type: "kick" | "ban"; userId: string; userName: string } | null>(null);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const handleKick = (userId: string) => {
    socket.emit("kick_user", { roomId, targetUserId: userId }, () => { });
    setConfirmModal(null);
  };

  const handleBan = (userId: string) => {
    // The server resolves the target IP itself from the room state
    socket.emit("ban_user", { roomId, targetUserId: userId }, () => { });
    setConfirmModal(null);
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? "open" : ""}`} onClick={onClose} />

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gradient" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Participantes ({users.length})
          </h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Cerrar" style={{ width: "36px", height: "36px", padding: 0 }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <div key={user.id} className="user-card animate-fadeIn">
              <div className="user-avatar">{getInitials(user.nickname)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                  <span className="truncate" style={{ fontWeight: 600, maxWidth: "100px" }}>{user.nickname}</span>
                  {user.id === hostId && <span className="badge badge-primary" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Host</span>}
                  {user.id === currentUserId && <span className="badge badge-secondary" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Tú</span>}
                </div>

                {isHost && user.id !== currentUserId && (
                  <div className="text-muted" style={{ fontSize: "0.7rem", marginTop: "4px", lineHeight: 1.4 }}>
                    <div>{user.os} · {user.browser}</div>
                    <div>{formatTime(user.joinedAt)}</div>
                  </div>
                )}
              </div>

              {/* Kick/Ban buttons (host only, not self) */}
              {isHost && user.id !== currentUserId && (
                <div className="flex gap-1">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setConfirmModal({ type: "kick", userId: user.id, userName: user.nickname })}
                    title="Expulsar"
                    style={{
                      width: "32px",
                      height: "32px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderColor: "var(--warning)",
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="var(--warning)" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setConfirmModal({ type: "ban", userId: user.id, userName: user.nickname })}
                    title="Bloquear"
                    style={{
                      width: "32px",
                      height: "32px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderColor: "var(--accent)",
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {users.length === 0 && (
          <div className="text-muted text-center" style={{ marginTop: "2rem" }}>
            No hay participantes
          </div>
        )}
      </aside>

      {/* Confirm Modal */}
      {confirmModal && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmModal(null)}
          title={confirmModal.type === "kick" ? "Expulsar Usuario" : "Bloquear Usuario"}
          message={
            confirmModal.type === "kick"
              ? `¿Expulsar a "${confirmModal.userName}"? Podrá volver a unirse.`
              : `¿Bloquear a "${confirmModal.userName}"? No podrá volver a unirse a esta sala.`
          }
          type="confirm"
          confirmText={confirmModal.type === "kick" ? "Expulsar" : "Bloquear"}
          onConfirm={() =>
            confirmModal.type === "kick"
              ? handleKick(confirmModal.userId)
              : handleBan(confirmModal.userId)
          }
        />
      )}
    </>
  );
}
