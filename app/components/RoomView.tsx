"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import { Room } from "@/lib/types";
import FileTab from "./FileTab";
import TextTab from "./TextTab";
import ParticipantsPanel from "./ParticipantsPanel";
import FileIcon from "./FileIcon";
import Modal from "./Modal";
import FormattedMessage from "./FormattedMessage";

interface RoomActionResponse {
  success: boolean;
  error?: string;
}

interface RoomViewProps {
  socket: Socket;
  room: Room;
  currentUserId: string;
  isGhost?: boolean;
  onRoomExited?: () => void;
}

// Clipboard fallback for HTTP
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    // Fallback for HTTP
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus({ preventScroll: true });
    textArea.select();
    return new Promise((resolve, reject) => {
      document.execCommand("copy") ? resolve() : reject();
      textArea.remove();
    });
  }
}

const PAGE_SIZE = 30;

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

export default function RoomView({ socket, room, currentUserId, isGhost = false, onRoomExited }: RoomViewProps) {
  const [activeTab, setActiveTab] = useState<"files" | "texts">("texts");
  const [showParticipants, setShowParticipants] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [deleteModal, setDeleteModal] = useState<{ type: "file" | "text" | "exit" | "last_user_exit"; id?: string; name?: string } | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const enteredTabRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const highlightTimerRef = useRef<number | null>(null);
  const typingTimerRefs = useRef<Record<string, number>>({});
  const lastReadEmitRef = useRef(0);
  const userScrollingRef = useRef(false);

  const visibleMessages = room.texts.slice(-visibleCount);

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    // Ignore scroll events caused by programmatic anchors / late content growth
    // until the user actually scrolls (wheel / touch).
    if (userScrollingRef.current) {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      if (atBottom) setUnseenCount(0);
    }

    if (container.scrollTop === 0 && visibleCount < room.texts.length) {
      const oldScrollHeight = container.scrollHeight;
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, room.texts.length));
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - oldScrollHeight;
      });
    }
  };

  // After a smooth scroll finishes, make sure the newest message is fully visible
  const handleMessagesScrollEnd = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (isAtBottomRef.current) {
      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remaining > 2) container.scrollTop = container.scrollHeight;
      if (userScrollingRef.current) setIsAtBottom(remaining <= 2);
    }
  };

  const scrollToBottom = () => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setUnseenCount(0);
    userScrollingRef.current = false;
    const container = messagesContainerRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  };

  // Highlight + count new incoming room messages (live events only)
  useEffect(() => {
    const handleRoomText = (text: { id: string; senderId: string }) => {
      if (text.senderId === currentUserId) return;
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
      setHighlightId(text.id);
      highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), 1700);
      if (!isAtBottomRef.current) setUnseenCount((prev) => prev + 1);
    };
    socket.on("new_text", handleRoomText);
    return () => {
      socket.off("new_text", handleRoomText);
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, [socket, currentUserId]);

  // Live typing indicator from other room users
  useEffect(() => {
    const handleRoomTyping = ({ userId, nickname }: { userId: string; nickname: string }) => {
      if (userId === currentUserId) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: nickname }));
      const prevTimer = typingTimerRefs.current[userId];
      if (prevTimer) window.clearTimeout(prevTimer);
      typingTimerRefs.current[userId] = window.setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        delete typingTimerRefs.current[userId];
      }, 4000);
    };
    socket.on("room_typing", handleRoomTyping);
    return () => {
      socket.off("room_typing", handleRoomTyping);
    };
  }, [socket, currentUserId]);

  // Tell the server we've read the latest room messages while on the chat tab
  useEffect(() => {
    if (activeTab !== "texts" || isGhost) return;
    const last = room.texts[room.texts.length - 1];
    if (!last) return;
    const now = Date.now();
    if (now - lastReadEmitRef.current < 1000) return;
    lastReadEmitRef.current = now;
    socket.emit("room_mark_read", { roomId: room.id, upToMessageId: last.id });
  }, [room.texts, activeTab, room.id, isGhost, socket]);

  // Anchor to bottom before first paint when entering the texts tab
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container && isAtBottomRef.current && !enteredTabRef.current) {
      if (room.texts.length > 0) {
        container.scrollTop = container.scrollHeight;
        enteredTabRef.current = true;
      }
      // Re-anchor once the content settles so the last message is never
      // left half-visible after entering the tab.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const c = messagesContainerRef.current;
          if (c && !userScrollingRef.current) {
            c.scrollTop = c.scrollHeight;
            isAtBottomRef.current = true;
            setIsAtBottom(true);
            setUnseenCount(0);
          }
        });
      });
    }
  }, [room.texts.length, activeTab]);

  // Smooth-scroll to bottom on incoming messages if user is at the bottom
  useEffect(() => {
    if (activeTab !== "texts" || !enteredTabRef.current) return;
    const container = messagesContainerRef.current;
    if (container && isAtBottomRef.current && room.texts.length > 0) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [room.texts.length, activeTab]);

  // Scroll to bottom so the "typing" bubbles are visible when they appear
  useEffect(() => {
    if (Object.keys(typingUsers).length === 0) return;
    if (!isAtBottomRef.current) return;
    const container = messagesContainerRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [typingUsers]);

  // Self-healing: re-anchor to the bottom if content grew during the smooth
  // scroll or a late reflow moved the viewport away from the newest message.
  useEffect(() => {
    if (activeTab !== "texts") return;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const container = messagesContainerRef.current;
      if (container && isAtBottomRef.current) {
        const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (remaining > 2) container.scrollTop = container.scrollHeight;
      }
    }, 800);
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, [room.texts.length, activeTab]);

  // Entry to the texts tab starts anchored (no scroll animation)
  useEffect(() => {
    enteredTabRef.current = false;
  }, [activeTab]);

  // Warn only on tab close (not reload) - using beforeunload which triggers on both
  // The browser will show its native dialog for tab close attempts
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Trigger browser default warning
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const isLastUser = room.users.length === 1;

  const confirmExit = useCallback(() => {
    if (isLastUser) {
      setDeleteModal({ type: "last_user_exit" });
    } else {
      setDeleteModal({ type: "exit" });
    }
  }, [isLastUser]);

  // Handle ESC key to exit room or close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteModal) {
          setDeleteModal(null);
        } else {
          confirmExit();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteModal, confirmExit]);

  const exitRoom = (keepRoomActive: boolean = false) => {
    // Emit leave_room event to server with the keep_active option
    socket.emit("leave_room", { roomId: room.id, keepActive: keepRoomActive }, (res: RoomActionResponse) => {
      if (res.success) {
        // Clear session from localStorage
        localStorage.removeItem("wifi_sharer_room_id");
        localStorage.removeItem("wifi_sharer_room_password");
        
        // Use callback instead of page reload
        if (onRoomExited) {
          onRoomExited();
        } else {
          // Fallback to page reload if no callback provided
          window.location.href = "/";
        }
      }
    });
  };

  const currentUser = room.users.find((u) => u.id === currentUserId);
  const isHost = currentUserId === room.hostId;
  const maxMB = Math.round(room.settings.maxFileSize / 1024 / 1024);

  const copyRoomId = () => {
    copyToClipboard(room.id);
  };

  const copyMessage = (id: string, content: string) => {
    copyToClipboard(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteFile = (fileId: string) => {
    socket.emit("delete_file", { roomId: room.id, fileId }, (res: RoomActionResponse) => {
      if (!res.success) alert(res.error || "Error al eliminar archivo");
    });
    setDeleteModal(null);
  };

  const handleDeleteText = (textId: string) => {
    socket.emit("delete_text", { roomId: room.id, textId }, (res: RoomActionResponse) => {
      if (!res.success) alert(res.error || "Error al eliminar mensaje");
    });
    setDeleteModal(null);
  };

  const isImage = (type: string) => type.startsWith("image/");

  return (
    <div className="flex w-full animate-fadeIn room-container" style={{ height: "calc(100vh - 2rem)", maxWidth: "100%", width: "100%" }}>
      {/* Main Content */}
      <div className="flex flex-col flex-1 card room-main" style={{ margin: "0", borderRadius: showParticipants ? "var(--radius-lg) 0 0 var(--radius-lg)" : "var(--radius-lg)", width: "100%" }}>

        {/* Header */}
        <header className="flex items-center justify-between mb-4 room-header" style={{ paddingBottom: "1rem", borderBottom: "1px solid var(--card-border)", flexWrap: "wrap", gap: "0.5rem" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={copyRoomId}
              className="flex items-center gap-2 btn-ghost rounded"
              style={{ padding: "6px 10px" }}
              title="Copiar código de sala"
            >
              <span className="text-gradient" style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "2px" }}>
                {room.id}
              </span>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ opacity: 0.5 }}>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>

            {isHost && <span className="badge badge-primary">Host</span>}
            {isGhost && <span className="badge badge-secondary">👻 Ghost</span>}
            <span className="badge" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--card-border)" }}>Máx. {maxMB}MB</span>
            {Object.keys(typingUsers).length > 0 && (
              <span className="flex items-center gap-1" style={{ color: "var(--primary)", fontSize: "0.75rem", fontWeight: 600 }}>
                {Object.values(typingUsers).join(", ")} {Object.keys(typingUsers).length === 1 ? "está" : "están"} escribiendo
                <span className="typing-dot" style={{ animationDelay: "0s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowParticipants(!showParticipants)}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{room.users.length}</span>
            </button>

            <button onClick={confirmExit} className="btn btn-danger btn-sm" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span className="hide-mobile">Salir</span>
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs mb-4">
          <button className={`tab ${activeTab === "files" ? "active" : ""}`} onClick={() => setActiveTab("files")} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Archivos ({room.files.length})</span>
          </button>
          <button className={`tab ${activeTab === "texts" ? "active" : ""}`} onClick={() => setActiveTab("texts")} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat ({room.texts.length})</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ paddingRight: "4px" }}>
          {activeTab === "files" && (
            <div className="animate-fadeIn flex flex-col gap-4">
              {!isGhost && (
                <FileTab
                  roomId={room.id}
                  senderId={currentUserId}
                  senderName={currentUser?.nickname || "Anónimo"}
                  maxFileSize={room.settings.maxFileSize}
                />
              )}

              {room.files.length > 0 ? (
                <div className="file-grid">
                  {room.files.map((file) => (
                    <div key={file.id} className="file-card flex flex-col gap-2 animate-slideUp" style={{ position: "relative" }}>
                      {/* Delete Button (Host only) */}
                      {isHost && (
                        <button
                          className="btn btn-icon btn-ghost"
                          onClick={() => setDeleteModal({ type: "file", id: file.id, name: file.name })}
                          style={{
                            position: "absolute",
                            top: "8px",
                            right: "8px",
                            width: "28px",
                            height: "28px",
                            background: "rgba(255, 51, 102, 0.2)",
                            borderColor: "var(--accent)",
                            zIndex: 2,
                          }}
                          title="Eliminar archivo"
                        >
                          <svg width="12" height="12" fill="none" stroke="var(--accent)" strokeWidth="3" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      {/* Image Preview */}
                      {isImage(file.type) ? (
                        <div
                          className="image-preview"
                          style={{
                            width: "100%",
                            height: "120px",
                            backgroundImage: `url(/api/preview/${file.id}?roomId=${room.id})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            borderRadius: "8px",
                            marginBottom: "8px"
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center" style={{ height: "60px", opacity: 0.5 }}>
                          <FileIcon mimeType={file.type} fileName={file.name} size={40} />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {!isImage(file.type) && <FileIcon mimeType={file.type} fileName={file.name} size={20} />}
                        <span className="truncate" style={{ fontWeight: 600, flex: 1, fontSize: "0.9rem" }}>{file.name}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB · {file.senderName}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.65rem", alignSelf: "flex-end" }}>
                        {formatTime(file.createdAt)}
                      </div>
                      <a
                        href={`/api/download/${file.id}?roomId=${room.id}`}
                        target="_blank"
                        className="btn btn-secondary btn-sm mt-auto"
                        style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}
                      >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        <span>Descargar</span>
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted" style={{ padding: "3rem", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
                    <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" style={{ opacity: 0.3 }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <span>No hay archivos</span>
                </div>
              )}
            </div>
          )}

          {activeTab === "texts" && (
            <div className="animate-fadeIn flex flex-col h-full">
              {/* Messages */}
              <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-4" style={{ paddingRight: "4px" }} ref={messagesContainerRef} onScroll={handleMessagesScroll} onScrollEnd={handleMessagesScrollEnd} onWheel={() => { userScrollingRef.current = true; }} onTouchMove={() => { userScrollingRef.current = true; }}>
                {visibleMessages.map((item) => (
                  <div
                    key={item.id}
                    className={`message-bubble animate-slideUp ${highlightId === item.id ? "animate-message-flash" : ""}`}
                    style={{
                      alignSelf: item.senderId === currentUserId ? "flex-end" : "flex-start",
                      background: item.senderId === currentUserId ? "rgba(168, 85, 247, 0.15)" : "rgba(255,255,255,0.03)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius)",
                      maxWidth: "85%",
                      border: item.senderId === currentUserId ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid var(--card-border)",
                      position: "relative",
                    }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <span className="text-muted" style={{ fontSize: "0.7rem", fontWeight: 600 }}>{item.senderName}</span>
                      <div className="flex items-center gap-1">
                        {isHost && (
                          <button
                            className="copy-btn"
                            onClick={() => setDeleteModal({ type: "text", id: item.id })}
                            title="Eliminar mensaje"
                            style={{
                              background: "rgba(255, 51, 102, 0.1)",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              padding: "4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg width="12" height="12" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        <button
                          className={`copy-btn copy-btn-hover ${copiedId === item.id ? "copied" : ""}`}
                          onClick={() => copyMessage(item.id, item.content)}
                          title="Copiar mensaje"
                          style={{
                            background: copiedId === item.id ? "rgba(34, 197, 94, 0.2)" : "rgba(255,255,255,0.05)",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s",
                          }}
                        >
                          {copiedId === item.id ? (
                            <svg width="12" height="12" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" fill="none" stroke="var(--muted)" strokeWidth="2" viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.95rem", lineHeight: 1.5 }}><FormattedMessage content={item.content} /></div>
                    <div
                      className="text-muted"
                      style={{
                        fontSize: "0.65rem",
                        marginTop: "4px",
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "4px",
                      }}
                    >
                      <span>{formatTime(item.createdAt)}</span>
                      {item.senderId === currentUserId && (
                        (item.readBy && item.readBy.length > 0) ? (
                          <span title="Leído" style={{ color: "var(--primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px" }}>
                            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <path d="M18 6L7 17l-5-5" />
                              <path d="M22 10l-7.5 7.5L13 16" />
                            </svg>
                            Leído ({item.readBy.length})
                          </span>
                        ) : (
                          <span title="Enviado" style={{ display: "flex", alignItems: "center", opacity: 0.6 }}>
                            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <path d="M18 6L7 17l-5-5" />
                            </svg>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                ))}
                {room.texts.length === 0 && (
                  <div className="text-muted" style={{ padding: "3rem", textAlign: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
                      <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" style={{ opacity: 0.3 }}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <span>No hay mensajes</span>
                  </div>
                )}
                {Object.keys(typingUsers).length > 0 && (
                  <div
                    className="message-bubble animate-fadeIn"
                    style={{
                      alignSelf: "flex-start",
                      background: "rgba(255,255,255,0.03)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--card-border)",
                      maxWidth: "85%",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      color: "var(--muted)",
                    }}
                  >
                    <span className="typing-dot" style={{ animationDelay: "0s" }} />
                    <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
                    <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
                  </div>
                )}
              </div>
              {!isAtBottom && room.texts.length > 0 && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  title="Volver abajo"
                  className="btn btn-primary"
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    right: "12px",
                    zIndex: 5,
                    height: "36px",
                    padding: "0 14px",
                    borderRadius: "999px",
                    fontSize: "0.8rem",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                  {unseenCount > 0 ? `${unseenCount} ${unseenCount === 1 ? "nuevo" : "nuevos"}` : ""}
                </button>
              )}
              </div>

              {/* Input (not for ghosts) */}
              {!isGhost && (
                <TextTab socket={socket} roomId={room.id} senderName={currentUser?.nickname || "Anónimo"} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Participants Panel */}
      <ParticipantsPanel
        socket={socket}
        users={room.users}
        hostId={room.hostId}
        currentUserId={currentUserId}
        roomId={room.id}
        isOpen={showParticipants}
        onClose={() => setShowParticipants(false)}
      />

      {/* Delete/Exit Confirmation Modal */}
      {deleteModal && deleteModal.type === "last_user_exit" && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteModal(null)}
          title="Eres el Último Usuario"
          message="Eres la última persona en la sala. ¿Qué quieres hacer con la sala?"
          type="confirm"
          customActions={
            <>
              <button 
                className="btn btn-ghost" 
                onClick={() => setDeleteModal(null)} 
                style={{ flex: 1, minWidth: "100px" }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  exitRoom(true); // Keep room active
                  setDeleteModal(null);
                }}
                style={{ flex: 1, minWidth: "100px" }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ marginRight: "6px" }}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Mantener
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  exitRoom(false); // Delete room
                  setDeleteModal(null);
                }}
                style={{ flex: 1, minWidth: "100px" }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ marginRight: "6px" }}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Eliminar
              </button>
            </>
          }
        />
      )}

      {deleteModal && deleteModal.type !== "last_user_exit" && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteModal(null)}
          title={
            deleteModal.type === "exit" ? "Salir de la Sala" :
              deleteModal.type === "file" ? "Eliminar Archivo" : "Eliminar Mensaje"
          }
          message={
            deleteModal.type === "exit" ? (isHost ? "Si sales, el rol de anfitrión se transferirá al siguiente usuario. ¿Estás seguro?" : "¿Estás seguro de que quieres salir de la sala?") :
              deleteModal.type === "file" ? `¿Estás seguro de que quieres eliminar el archivo "${deleteModal.name}"?` : "¿Estás seguro de que quieres eliminar este mensaje?"
          }
          type="confirm"
          confirmText={deleteModal.type === "exit" ? "Salir" : "Eliminar"}
          onConfirm={() => {
            if (deleteModal.type === "exit") exitRoom(false);
            else if (deleteModal.type === "file") handleDeleteFile(deleteModal.id!);
            else if (deleteModal.type === "text") handleDeleteText(deleteModal.id!);
          }}
        />
      )}
    </div>
  );
}
