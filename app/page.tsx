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
import { useToasts } from "./hooks/useToasts";
import { useFaviconBadge } from "./hooks/useFaviconBadge";
import { requestNotificationPermission } from "@/lib/notifications";
import ConnectForm from "./components/ConnectForm";
import OnlineContactsView from "./components/OnlineContactsView";
import PrivateChatView from "./components/PrivateChatView";
import RoomView from "./components/RoomView";
import AdminPanel from "./components/AdminPanel";
import Modal from "./components/Modal";
import ChatLayout from "./components/ChatLayout";
import SettingsModal from "./components/SettingsModal";
import { ToastStack } from "./components/ToastStack";

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
  const { myNickname, myPersistentId, myUserId, mySettings, retentionDays, registerUser, renameUser, updateSettings } = useSession();
  const chatPartnerRef = useRef<OnlineUser | null>(null);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomFormMode, setRoomFormMode] = useState<"create" | "join">("create");
  const [unreadBrowserCount, setUnreadBrowserCount] = useState(0);
  const [lastIncomingInfo, setLastIncomingInfo] = useState<{ sender: string; body: string } | null>(null);
  const [identityBlocked, setIdentityBlocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [nicknameError, setNicknameError] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const { toasts, pushToast, dismiss: dismissToast } = useToasts();
  useFaviconBadge(unreadBrowserCount);

  const handleNewIncomingMessage = useCallback((info?: { sender?: string; body?: string }) => {
    if (document.hidden || !document.hasFocus()) {
      setUnreadBrowserCount((prev) => prev + 1);
      if (info?.sender) {
        const body = (info.body || "").replace(/\s+/g, " ").trim();
        setLastIncomingInfo({
          sender: info.sender,
          body: body.length > 30 ? body.slice(0, 30) + "…" : body,
        });
      }
    }
  }, []);

  const { onlineUsers, setOnlineUsers, chatPartner, setChatPartner, handleStartChat, isAdmin, unreadCounts, setUnreadCounts } = useContacts(socket, chatPartnerRef, handleNewIncomingMessage, pushToast);
  const { room, setRoom, isGhost, currentView, setCurrentView, showAdminPanel, setShowAdminPanel, handleRoomJoined, handleRoomExited, handleAdminJoinRoom, hasMoreTexts, loadOlderTexts } = useRoom(socket, showModal, handleNewIncomingMessage, pushToast);
  const { displayRecentRooms, setRecentRooms, checkActiveRecentRooms, handleJoinRecentRoom } = useRecentRooms(socket, showModal);

  useEffect(() => {
    const handleFocus = () => {
      setUnreadBrowserCount(0);
      setLastIncomingInfo(null);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // The identity was claimed from another tab/device: this window becomes inactive
  useEffect(() => {
    if (!socket) return;
    const handleIdentityReplaced = () => setIdentityBlocked(true);
    socket.on("identity_replaced", handleIdentityReplaced);
    return () => { socket.off("identity_replaced", handleIdentityReplaced); };
  }, [socket]);

  const handleReclaimIdentity = useCallback(() => {
    if (!socket) return;
    const nickname = localStorage.getItem("wifi_sharer_nickname") || myNickname;
    if (!nickname) return;
    registerUser(
      socket,
      nickname,
      () => setIdentityBlocked(false),
      (error) => showModal("Error", error, "error")
    );
  }, [socket, myNickname, registerUser, showModal]);

  const handleRenameNickname = useCallback(
    (nickname: string) => {
      if (!socket) return;
      setNicknameSaving(true);
      setNicknameError("");
      renameUser(
        socket,
        nickname,
        () => {
          setNicknameSaving(false);
        },
        (error) => {
          setNicknameSaving(false);
          setNicknameError(error);
        }
      );
    },
    [socket, renameUser]
  );

  const handleToggleDiscoverable = useCallback(
    (discoverable: boolean) => {
      if (!socket) return;
      setSettingsSaving(true);
      setSettingsError("");
      updateSettings(
        socket,
        { discoverable },
        () => setSettingsSaving(false),
        (error) => {
          setSettingsSaving(false);
          setSettingsError(error);
        }
      );
    },
    [socket, updateSettings]
  );

  const handleOpenSettings = useCallback(() => {
    setNicknameError("");
    setSettingsError("");
    setShowSettings(true);
  }, []);

  useEffect(() => {
    if (unreadBrowserCount > 0) {
      const info = lastIncomingInfo;
      if (info && info.body) {
        document.title = `(${unreadBrowserCount}) ${info.sender}: ${info.body} — Wifi File Sharer`;
      } else if (info) {
        document.title = `(${unreadBrowserCount}) ${info.sender} — Wifi File Sharer`;
      } else {
        document.title = `(${unreadBrowserCount}) Nuevo mensaje — Wifi File Sharer`;
      }
    } else {
      document.title = "Wifi File Sharer";
    }
  }, [unreadBrowserCount, lastIncomingInfo]);

  useEffect(() => {
    chatPartnerRef.current = chatPartner;
  }, [chatPartner]);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      const savedNickname = localStorage.getItem("wifi_sharer_nickname");
      if (savedNickname) {
        registerUser(
          socket,
          savedNickname,
          (users, _persistentId, counts) => {
            setOnlineUsers(users);
            setUnreadCounts(counts || {});
            setCurrentView((prev) => (prev === "name" ? "contacts" : prev));
          },
          (error) => showModal("No se pudo iniciar sesión", error, "error")
        );
      }
      checkActiveRecentRooms(socket);
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    return () => { socket.off("connect", onConnect); };
  }, [socket, registerUser, checkActiveRecentRooms, setOnlineUsers, setUnreadCounts, setCurrentView, showModal]);

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
    requestNotificationPermission();
    setNameError("");
    registerUser(
      socket,
      nickname,
      (users, _persistentId, counts) => {
        setOnlineUsers(users);
        setUnreadCounts(counts || {});
        setChatPartner(null);
        setCurrentView("contacts");
      },
      (error) => setNameError(error)
    );
  };

  const handleRoomJoinedWrap = useCallback((roomId: string, password?: string) => {
    handleRoomJoined(roomId, password);
    setRecentRooms(readRecentRooms());
    setShowRoomForm(false);
    // Room state arrives through room_updated; make the navigation explicit (B8)
    setCurrentView("room");
  }, [handleRoomJoined, setRecentRooms, setCurrentView]);

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
              <Image src="/logo.png" alt="Wifi File Sharer" width={80} height={80} unoptimized className="animate-glow rounded-2xl" />
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
                  maxLength={20} autoComplete="off" autoFocus
                  defaultValue={localStorage.getItem("wifi_sharer_nickname") || ""}
                />
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
                      marginTop: "8px",
                    }}
                  >
                    {nameError}
                  </div>
                )}
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
              myPersistentId={myUserId}
              onlineUsers={onlineUsers}
              unreadCounts={unreadCounts}
              onStartChat={handleStartChat}
              onCreateRoom={handleOpenCreateRoom}
              onJoinRoom={handleOpenJoinRoom}
              onOpenSettings={handleOpenSettings}
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
                myUserId={myUserId}
                onBack={() => setChatPartner(null)}
                pushToast={pushToast}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }} className="text-muted">
                <div className="empty-logo-wrap">
                  <span className="empty-logo-halo" />
                  <span className="empty-logo-halo empty-logo-halo--outer" />
                  <Image
                    src="/logo.png"
                    alt="Wifi File Sharer"
                    width={112}
                    height={112}
                    unoptimized
                    className="empty-logo"
                  />
                </div>
                <span className="animate-slideUp" style={{ fontSize: "1rem" }}>Selecciona un contacto para chatear</span>
                <span className="animate-slideUp" style={{ fontSize: "0.8rem", opacity: 0.7 }}>o crea una sala para compartir archivos</span>
              </div>
            )
          }
        />
      )}

      {currentView === "room" && room && (
        <RoomView
          socket={socket}
          room={room}
          currentUserId={socket.id || ""}
          isGhost={isGhost}
          onRoomExited={handleRoomExited}
          pushToast={pushToast}
          hasMoreTexts={hasMoreTexts}
          onLoadOlderTexts={loadOlderTexts}
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

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onUserClick={(user) => {
          // Toasts may carry a stale/fake socket id: resolve the real one (B2)
          const real = onlineUsers.find((u) => u.persistentId === user.persistentId);
          handleStartChat(real ?? { ...user, isOnline: false });
          setCurrentView("contacts");
        }}
      />

      {showSettings && (
        <SettingsModal
          currentName={myNickname}
          discoverable={mySettings.discoverable}
          retentionDays={retentionDays}
          nameSaving={nicknameSaving}
          nameError={nicknameError}
          settingsSaving={settingsSaving}
          settingsError={settingsError}
          onClose={() => {
            if (nicknameSaving || settingsSaving) return;
            setShowSettings(false);
            setNicknameError("");
            setSettingsError("");
          }}
          onSaveName={handleRenameNickname}
          onToggleDiscoverable={handleToggleDiscoverable}
        />
      )}

      {identityBlocked && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 400, padding: "1rem",
          }}
        >
          <div className="card animate-slideUp" style={{ maxWidth: "400px", width: "100%", textAlign: "center" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Sesión abierta en otro dispositivo
            </h3>
            <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
              Tu identidad se usó en otra pestaña o dispositivo, así que esta ventana quedó inactiva.
              Puedes retomar la sesión aquí.
            </p>
            <button className="btn btn-primary" onClick={handleReclaimIdentity} style={{ minWidth: "160px" }}>
              Usar esta ventana
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
