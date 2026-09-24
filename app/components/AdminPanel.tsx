"use client";

import { useCallback, useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { RoomSummary } from "@/lib/types";
import Modal from "./Modal";

interface GetAllRoomsResponse {
  success: boolean;
  rooms: RoomSummary[];
}

interface AdminActionResponse {
  success: boolean;
}

interface AdminPanelProps {
  socket: Socket;
  onJoinRoom: (roomId: string, ghost: boolean) => void;
}

export default function AdminPanel({ socket, onJoinRoom }: AdminPanelProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [closeRoomModal, setCloseRoomModal] = useState<string | null>(null);

  const fetchRooms = useCallback(() => {
    socket.emit("get_all_rooms", (res: GetAllRoomsResponse) => {
      setLoading(false);
      if (res.success) {
        setRooms(res.rooms);
      }
    });
  }, [socket]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  };

  const handleCloseRoom = (roomId: string) => {
    socket.emit("admin_close_room", { roomId }, (res: AdminActionResponse) => {
      if (res.success) {
        fetchRooms();
      }
    });
    setCloseRoomModal(null);
  };

  return (
    <div className="card animate-slideUp" style={{ maxWidth: "600px", width: "100%" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gradient" style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🛡️</span>
          <span>Panel de Administrador</span>
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={fetchRooms} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span className="hide-mobile">Actualizar</span>
        </button>
      </div>

      <p className="text-muted mb-4" style={{ fontSize: "0.8rem" }}>
        Supervisión de salas activas. Puedes observar sin ser detectado.
      </p>

      {loading ? (
        <div className="text-muted text-center p-4">Cargando salas...</div>
      ) : rooms.length === 0 ? (
        <div className="text-muted" style={{ padding: "2rem", textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" style={{ opacity: 0.3 }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span>No hay salas activas</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map((room) => (
            <div key={room.id} className="file-card animate-fadeIn" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-primary" style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "2px" }}>
                    {room.id}
                  </span>
                  {room.hasPassword && (
                    <svg width="14" height="14" fill="none" stroke="var(--warning)" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: "0.75rem", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span>👥 {room.userCount}</span>
                  <span>📁 {room.fileCount}</span>
                  <span>💬 {room.textCount}</span>
                </div>
                <div className="text-muted" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                  {formatTime(room.createdAt)}
                </div>
              </div>

              <div className="flex gap-2" style={{ flexShrink: 0 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onJoinRoom(room.id, false)}
                  title="Entrar"
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px" }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span className="hide-mobile">Entrar</span>
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onJoinRoom(room.id, true)}
                  title="Modo Fantasma"
                  style={{ padding: "8px 10px" }}
                >
                  👻
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCloseRoomModal(room.id)}
                  title="Cerrar Sala"
                  style={{
                    padding: "8px 10px",
                    borderColor: "var(--accent)",
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Close Room Confirmation */}
      {closeRoomModal && (
        <Modal
          isOpen={true}
          onClose={() => setCloseRoomModal(null)}
          title="Cerrar Sala"
          message={`¿Estás seguro de cerrar la sala ${closeRoomModal}? Todos los usuarios serán desconectados.`}
          type="confirm"
          confirmText="Cerrar Sala"
          onConfirm={() => handleCloseRoom(closeRoomModal)}
        />
      )}
    </div>
  );
}
