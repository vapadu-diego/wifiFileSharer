"use client";

import { ReactNode } from "react";
import { OnlineUser } from "@/lib/types";

interface OnlineContactsViewProps {
  myNickname: string;
  myPersistentId: string;
  onlineUsers: OnlineUser[];
  unreadCounts: Record<string, number>;
  onStartChat: (user: OnlineUser) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenSettings?: () => void;
  isAdmin?: boolean;
  showAdminPanel?: boolean;
  onToggleAdminPanel?: () => void;
  children?: ReactNode;
}

const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

function DeviceIcon({ os }: { os: string }) {
  let icon = "💻";
  if (os === "iOS" || os === "Android") icon = "📱";
  else if (os === "macOS") icon = "🍎";
  else if (os === "Linux") icon = "🐧";
  else if (os === "Windows") icon = "🪟";
  return <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>{icon}</span>;
}

export default function OnlineContactsView({
  myNickname,
  myPersistentId,
  onlineUsers,
  unreadCounts,
  onStartChat,
  onCreateRoom,
  onJoinRoom,
  onOpenSettings,
  isAdmin,
  showAdminPanel,
  onToggleAdminPanel,
  children,
}: OnlineContactsViewProps) {
  const filtered = onlineUsers
    .filter((u) => u.persistentId !== myPersistentId)
    .sort((a, b) => {
      const aOnline = a.isOnline !== false;
      const bOnline = b.isOnline !== false;
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return a.nickname.localeCompare(b.nickname, "es");
    });
  const onlineCount = filtered.filter((u) => u.isOnline !== false).length;
  const offlineCount = filtered.length - onlineCount;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          background: "var(--background-secondary)",
        }}
      >
        <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
          <div
            className="user-avatar"
            style={{ width: "36px", height: "36px", fontSize: "0.85rem", flexShrink: 0 }}
          >
            {getInitials(myNickname)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              {myNickname}
            </div>
            <div className="text-muted" style={{ fontSize: "0.7rem" }}>
              {onlineCount} en línea
              {offlineCount > 0 ? ` · ${offlineCount} desconectado${offlineCount !== 1 ? "s" : ""}` : ""}
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          {onOpenSettings && (
            <button
              className="btn btn-ghost btn-icon"
              onClick={onOpenSettings}
              title="Configuración"
              style={{ width: "34px", height: "34px", padding: 0 }}
            >
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
          {isAdmin && onToggleAdminPanel && (
            <button
              className="btn btn-ghost btn-icon"
              onClick={onToggleAdminPanel}
              title="Panel Admin"
              style={{
                width: "34px",
                height: "34px",
                padding: 0,
                borderColor: showAdminPanel ? "var(--primary)" : "transparent",
              }}
            >
              🛡️
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={onCreateRoom}
            title="Crear sala"
            style={{ width: "34px", height: "34px", padding: 0 }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onJoinRoom}
            title="Unirse a sala"
            style={{ width: "34px", height: "34px", padding: 0 }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
        </div>
      </div>

      {/* Online users list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0.5rem" }}>
        {filtered.length === 0 ? (
          <div className="text-muted" style={{ padding: "3rem 1rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", opacity: 0.3 }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span>No hay contactos disponibles</span>
            <div style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
              Invita a alguien a conectarse al servidor
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((user) => {
              const isOnline = user.isOnline !== false;
              return (
                <button
                  key={user.persistentId}
                  onClick={() => onStartChat(user)}
                  className="user-card"
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    border: "1px solid var(--card-border)",
                    textAlign: "left",
                    transition: "all 0.2s",
                    borderRadius: "var(--radius)",
                    color: "var(--foreground)",
                    background: "rgba(255,255,255,0.03)",
                    opacity: isOnline ? 1 : 0.65,
                  }}
                >
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div className="user-avatar" style={{ width: "40px", height: "40px" }}>
                      {getInitials(user.nickname)}
                    </div>
                    {unreadCounts[user.persistentId] > 0 && (
                      <span className="badge-unread">
                        {unreadCounts[user.persistentId] > 99 ? "99+" : unreadCounts[user.persistentId]}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                      <span className="truncate" style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        {user.nickname}
                      </span>
                      <span style={{ fontSize: "0.65rem", color: isOnline ? "var(--success)" : "var(--muted)" }}>
                        ●
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.7rem", display: "flex", gap: "6px", alignItems: "center" }}>
                      {isOnline ? (
                        <>
                          <DeviceIcon os={user.os} />
                          <span>{user.os} · {user.browser}</span>
                        </>
                      ) : (
                        <span>Desconectado</span>
                      )}
                    </div>
                  </div>
                  <svg width="18" height="18" fill="none" stroke="var(--muted)" strokeWidth="2" viewBox="0 0 24 24" style={{ opacity: 0.4 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom section (recent rooms, etc.) */}
      {children && (
        <div
          style={{
            borderTop: "1px solid var(--card-border)",
            maxHeight: "35%",
            overflowY: "auto",
            background: "var(--background-secondary)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
