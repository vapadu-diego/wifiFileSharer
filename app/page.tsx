"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { OnlineUser } from "@/lib/types";
import { useSocket } from "./hooks/useSocket";
import { useModal } from "./hooks/useModal";
import { useSession } from "./hooks/useSession";
import { useContacts } from "./hooks/useContacts";
import { useRoom } from "./hooks/useRoom";
import { useRecentRooms, RecentRoom } from "./hooks/useRecentRooms";
import ConnectForm from "./components/ConnectForm";
import OnlineContactsView from "./components/OnlineContactsView";
import PrivateChatView from "./components/PrivateChatView";
import RoomView from "./components/RoomView";
import AdminPanel from "./components/AdminPanel";
import Modal from "./components/Modal";
import ChatLayout from "./components/ChatLayout";

const RECENT_ROOMS_KEY = "wifi_sharer_recent_rooms";

function readRecentRooms() {
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const { socket, isReconnecting } = useSocket();
  const { modalConfig, showModal, hideModal } = useModal();
  const { myNickname, myPersistentId, registerUser } = useSession();
  const chatPartnerRef = useRef<OnlineUser | null>(null);
  const { onlineUsers, setOnlineUsers, chatPartner, setChatPartner, handleStartChat, isAdmin, unreadCounts } = useContacts(socket, chatPartnerRef);
  const { room, setRoom, isGhost, currentView, setCurrentView, showAdminPanel, setShowAdminPanel, handleRoomJoined, handleRoomExited, handleAdminJoinRoom } = useRoom(socket, showModal);
  const { displayRecentRooms, setRecentRooms, checkActiveRecentRooms, handleJoinRecentRoom } = useRecentRooms(socket, showModal);

  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomFormMode, setRoomFormMode] = useState<"create" | "join">("create");

  useEffect(() => {
    chatPartnerRef.current = chatPartner;
  }, [chatPartner]);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      const savedNickname = localStorage.getItem("wifi_sharer_nickname");
      if (savedNickname) {
        registerUser(socket, savedNickname, (users) => {
          setOnlineUsers(users);
          setChatPartner(null);
          setCurrentView("contacts");
        });
      }
      checkActiveRecentRooms(socket);
    };

    socket.on("connect", onConnect);
    return () => { socket.off("connect", onConnect); };
  }, [socket, registerUser, checkActiveRecentRooms, setOnlineUsers, setChatPartner, setCurrentView]);

  useEffect(() => {
    if (!socket) return;
    const handleReconnectFailed = () => {
      showModal("Error de Conexión", "No se pudo reconectar al servidor. Por favor, recarga la página.", "error");
    };
    socket.on("reconnect_failed", handleReconnectFailed);
    return () => { socket.off("reconnect_failed", handleReconnectFailed); };
  }, [socket, showModal]);

  const handleNicknameSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const nickname = (formData.get("nickname") as string || "").trim();
    if (!nickname || !socket) return;
    registerUser(socket, nickname, (users) => {
      setOnlineUsers(users);
      setChatPartner(null);
      setCurrentView("contacts");
    });
  };

  const handleRoomJoinedWrap = useCallback((roomId: string, password?: string) => {
    handleRoomJoined(roomId, password);
    setRecentRooms(readRecentRooms());
    setShowRoomForm(false);
  }, [handleRoomJoined, setRecentRooms]);

  const handleOpenCreateRoom = () => {
    setRoomFormMode("create");
    setShowRoomForm(true);
  };

  const handleOpenJoinRoom = () => {
    setRoomFormMode("join");
    setShowRoomForm(true);
  };

  if (!socket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-pulse" width="48" height="48" fill="none" stroke="var(--primary)" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span className="text-muted">Conectando...</span>
        </div>
      </div>
    );
  }

  return (
    <main className={`min-h-screen flex flex-col relative overflow-hidden ${currentView === "contacts" ? "" : "p-4 items-center justify-center"}`}>
      {isReconnecting && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          background: "rgba(245, 158, 11, 0.15)",
          borderBottom: "1px solid var(--warning)",
          padding: "12px 16px", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
        }}>
          <svg className="animate-pulse" width="20" height="20" fill="none" stroke="var(--warning)" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span style={{ color: "var(--warning)", fontWeight: 500 }}>Reconectando al servidor...</span>
        </div>
      )}

      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "radial-gradient(ellipse at 50% 0%, rgba(0, 240, 255, 0.08) 0%, transparent 50%)",
        pointerEvents: "none", zIndex: 0
      }} />
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "radial-gradient(ellipse at 80% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 50%)",
        pointerEvents: "none", zIndex: 0
      }} />

      {currentView === "name" && (
        <div className="flex flex-col gap-6 items-center w-full max-w-lg animate-slideUp relative" style={{ zIndex: 1 }}>
          <div className="text-center">
            <div className="flex flex-col items-center justify-center gap-3 mb-4">
              <Image src="/icon.png" alt="Wifi File Sharer" width={80} height={80} className="animate-glow rounded-2xl" />
              <h1 className="text-gradient" style={{ fontSize: "clamp(1.75rem, 7vw, 3rem)", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1.1 }}>
                Wifi File Sharer
              </h1>
              <a href="https://github.com/isaiasfer" target="_blank" rel="noopener noreferrer"
                className="text-muted hover:text-primary transition-colors"
                style={{ fontSize: "0.85rem", textDecoration: "none", opacity: 0.8 }}>
                Creado por Isaias Fernandez
              </a>
            </div>
            <p className="text-muted" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
              Comparte archivos y chatea en tu red local
            </p>
          </div>

          <div className="card card-glow animate-slideUp" style={{ maxWidth: "400px", width: "100%" }}>
            <form onSubmit={handleNicknameSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
                  Tu Apodo
                </label>
                <input
                  className="input" name="nickname" placeholder="Ej: Carlos"
                  maxLength={15} autoComplete="off" autoFocus
                  defaultValue={localStorage.getItem("wifi_sharer_nickname") || ""}
                />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                <span className="flex items-center gap-2" style={{ justifyContent: "center" }}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span style={{ lineHeight: 1 }}>Conectarse</span>
                </span>
              </button>
            </form>
          </div>

          <footer className="text-muted text-center" style={{ fontSize: "0.75rem" }}>
            <p>Asegúrate de estar en el mismo WiFi</p>
          </footer>
        </div>
      )}

      {currentView === "contacts" && (
        <ChatLayout
          showMain={!!chatPartner || (showAdminPanel && isAdmin)}
          sidebar={
            <OnlineContactsView
              myNickname={myNickname}
              onlineUsers={onlineUsers}
              unreadCounts={unreadCounts}
              onStartChat={handleStartChat}
              onCreateRoom={handleOpenCreateRoom}
              onJoinRoom={handleOpenJoinRoom}
              isAdmin={isAdmin}
              showAdminPanel={showAdminPanel}
              onToggleAdminPanel={() => setShowAdminPanel(!showAdminPanel)}
            >
              {displayRecentRooms.length > 0 && (
                <div style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <svg width="16" height="16" fill="none" stroke="var(--muted)" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="text-muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Salas Recientes</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {displayRecentRooms.map((recentRoom: RecentRoom) => (
                      <button
                        key={recentRoom.id}
                        onClick={() => handleJoinRecentRoom(recentRoom, (room) => {
                          setRoom(room);
                          setCurrentView("room");
                        })}
                        className="recent-room-btn"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          width: "100%", padding: "12px 16px",
                          background: "rgba(220, 217, 217, 0.03)",
                          border: "1px solid var(--card-border)", borderRadius: "var(--radius)",
                          cursor: "pointer", transition: "all 0.2s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span className="text-gradient" style={{ fontWeight: 700, letterSpacing: "2px", fontSize: "1rem" }}>
                            {recentRoom.id}
                          </span>
                          {recentRoom.password && (
                            <span style={{ opacity: 0.5 }}>
                              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <circle cx="12" cy="16" r="1" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="badge badge-success" style={{ fontSize: "0.65rem" }}>Activa</span>
                          <svg width="16" height="16" fill="none" stroke="var(--primary)" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </OnlineContactsView>
          }
          main={
            showAdminPanel && isAdmin ? (
              <AdminPanel socket={socket} onJoinRoom={handleAdminJoinRoom} />
            ) : chatPartner ? (
              <PrivateChatView
                socket={socket}
                partner={chatPartner}
                currentUserId={myPersistentId || socket.id || ""}
                currentUserName={myNickname}
                onBack={() => setChatPartner(null)}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }} className="text-muted">
                <svg width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" style={{ opacity: 0.3 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span style={{ fontSize: "1rem" }}>Selecciona un contacto para chatear</span>
                <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>o crea una sala para compartir archivos</span>
              </div>
            )
          }
        />
      )}

      {currentView === "room" && room && (
        <RoomView
          socket={socket}
          room={room}
          currentUserId={myPersistentId || socket.id || ""}
          isGhost={isGhost}
          onRoomExited={handleRoomExited}
        />
      )}

      {showRoomForm && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200, padding: "1rem",
          }}
          onClick={() => setShowRoomForm(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "420px" }}>
            <ConnectForm
              socket={socket}
              defaultMode={roomFormMode}
              onRoomJoined={handleRoomJoinedWrap}
              onCancel={() => setShowRoomForm(false)}
            />
          </div>
        </div>
      )}

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={hideModal}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
      />
    </main>
  );
}
