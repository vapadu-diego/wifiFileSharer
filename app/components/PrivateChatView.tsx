"use client";

import { useState, useRef, useEffect, FormEvent, DragEvent } from "react";
import { Socket } from "socket.io-client";
import {
  OnlineUser,
  PrivateMessage,
  PrivateFile,
  getFileCategory,
} from "@/lib/types";
import { generateUUID } from "@/app/hooks/useSession";
import FileIcon from "./FileIcon";
import FormattedMessage from "./FormattedMessage";
import {
  getLocalMessages,
  saveLocalMessages,
  addLocalMessage,
  getLocalFiles,
  saveLocalFiles,
  addLocalFile
} from "@/lib/chatPersistence";

interface PrivateChatViewProps {
  socket: Socket;
  partner: OnlineUser;
  currentUserId: string;
  currentUserName: string;
  myUserId: string;
  onBack: () => void;
}

interface MessagesResponse {
  messages: PrivateMessage[];
}

interface FilesResponse {
  files: PrivateFile[];
}

interface SendMessageResponse {
  success: boolean;
  message?: PrivateMessage;
}

interface ChatEntry {
  type: "message" | "file";
  id: string;
  createdAt: number;
  data: PrivateMessage | PrivateFile;
}

const getInitials = (name: string) => name.slice(0, 2).toUpperCase();
const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((resolve, reject) => {
      document.execCommand("copy") ? resolve() : reject();
      textArea.remove();
    });
  }
}

export default function PrivateChatView({
  socket,
  partner,
  currentUserId,
  currentUserName,
  myUserId,
  onBack,
}: PrivateChatViewProps) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [files, setFiles] = useState<PrivateFile[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSyncTimeRef = useRef(0);
  const pendingQueueRef = useRef<Array<{ tempId: string; content: string; createdAt: number }>>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const copyMessage = (id: string, text: string) => {
    copyToClipboard(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Autofocus input when chat opens or changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [partner.persistentId]);

  // Close chat on ESC key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onBack]);

  // Load local history & resync
  useEffect(() => {
    const localMsgs = getLocalMessages(myUserId, partner.persistentId);
    const localFls = getLocalFiles(myUserId, partner.persistentId);
    setMessages(localMsgs);
    setFiles(localFls);

    const lastMsgTime = localMsgs.length > 0 ? localMsgs[localMsgs.length - 1].createdAt : 0;
    const lastFileTime = localFls.length > 0 ? localFls[localFls.length - 1].createdAt : 0;
    const since = Math.max(lastMsgTime, lastFileTime);
    lastSyncTimeRef.current = since;

    const handleReconnect = () => {
      const currentSince = lastSyncTimeRef.current;
      if (currentSince > 0) {
        socket.emit("get_private_messages_since",
          { withUserId: partner.persistentId, since: currentSince },
          (res: MessagesResponse) => {
            if (res.messages?.length) {
              setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const newMsgs = res.messages.filter(m => !existingIds.has(m.id));
                const updated = newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
                saveLocalMessages(myUserId, partner.persistentId, updated);
                return updated;
              });
            }
          }
        );
        socket.emit("get_private_files_since",
          { withUserId: partner.persistentId, since: currentSince },
          (res: FilesResponse) => {
            if (res.files?.length) {
              setFiles(prev => {
                const existingIds = new Set(prev.map(f => f.id));
                const newFiles = res.files.filter(f => !existingIds.has(f.id));
                const updated = newFiles.length > 0 ? [...prev, ...newFiles] : prev;
                saveLocalFiles(myUserId, partner.persistentId, updated);
                return updated;
              });
            }
          }
        );
      } else {
        socket.emit("get_private_messages",
          { withUserId: partner.persistentId },
          (res: MessagesResponse) => {
            if (res.messages) {
              setMessages(res.messages);
              saveLocalMessages(myUserId, partner.persistentId, res.messages);
            }
          }
        );
        socket.emit("get_private_files",
          { withUserId: partner.persistentId },
          (res: FilesResponse) => {
            if (res.files) {
              setFiles(res.files);
              saveLocalFiles(myUserId, partner.persistentId, res.files);
            }
          }
        );
      }
    };

    if (socket.connected) {
      handleReconnect();
    }
    socket.on("connect", handleReconnect);

    if (partner.isOnline !== false) {
      socket.emit("private_sync_ping", {
        toSocketId: partner.id,
        fromUserId: myUserId,
        lastTimestamp: since
      });
    }

    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [socket, partner.persistentId, partner.id, partner.isOnline, myUserId]);

  // Listen for P2P sync requests and data
  useEffect(() => {
    const syncPingHandler = (msg: { fromSocketId: string; fromUserId: string; lastTimestamp: number }) => {
      if (msg.fromUserId !== partner.persistentId) return;

      const localMsgs = getLocalMessages(myUserId, partner.persistentId);
      const localFls = getLocalFiles(myUserId, partner.persistentId);
      
      const lastMsg = localMsgs[localMsgs.length - 1];
      const t_mine = lastMsg ? lastMsg.createdAt : 0;

      if (t_mine > msg.lastTimestamp) {
        const newMsgs = localMsgs.filter(m => m.createdAt > msg.lastTimestamp);
        const newFls = localFls.filter(f => f.createdAt > msg.lastTimestamp);
        socket.emit("private_sync_data", {
          toSocketId: msg.fromSocketId,
          fromUserId: myUserId,
          messages: newMsgs,
          files: newFls
        });
      } else if (t_mine < msg.lastTimestamp) {
        socket.emit("private_sync_ping", {
          toSocketId: msg.fromSocketId,
          fromUserId: myUserId,
          lastTimestamp: t_mine
        });
      }
    };

    const syncDataHandler = (data: { fromUserId: string; messages: PrivateMessage[]; files: PrivateFile[] }) => {
      if (data.fromUserId !== partner.persistentId) return;

      let updatedMsgs = [...getLocalMessages(myUserId, partner.persistentId)];
      let updatedFls = [...getLocalFiles(myUserId, partner.persistentId)];

      let changed = false;
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(msg => {
          if (!updatedMsgs.some(m => m.id === msg.id)) {
            updatedMsgs.push(msg);
            changed = true;
          }
        });
        if (changed) {
          updatedMsgs.sort((a, b) => a.createdAt - b.createdAt);
          saveLocalMessages(myUserId, partner.persistentId, updatedMsgs);
          setMessages(updatedMsgs);
        }
      }

      if (data.files && data.files.length > 0) {
        let filesChanged = false;
        data.files.forEach(file => {
          if (!updatedFls.some(f => f.id === file.id)) {
            updatedFls.push(file);
            filesChanged = true;
          }
        });
        if (filesChanged) {
          updatedFls.sort((a, b) => a.createdAt - b.createdAt);
          saveLocalFiles(myUserId, partner.persistentId, updatedFls);
          setFiles(updatedFls);
        }
      }
    };

    socket.on("private_sync_ping", syncPingHandler);
    socket.on("private_sync_data", syncDataHandler);

    return () => {
      socket.off("private_sync_ping", syncPingHandler);
      socket.off("private_sync_data", syncDataHandler);
    };
  }, [socket, partner.persistentId, myUserId]);

  // Listen for new messages
  useEffect(() => {
    const msgHandler = (msg: PrivateMessage) => {
      if (
        (msg.fromId === partner.persistentId && msg.toId === currentUserId) ||
        (msg.fromId === currentUserId && msg.toId === partner.persistentId)
      ) {
        const updated = addLocalMessage(myUserId, partner.persistentId, msg);
        setMessages(updated);
      }
    };
    const fileHandler = (f: PrivateFile) => {
      if (
        (f.fromId === partner.persistentId && f.toId === currentUserId) ||
        (f.fromId === currentUserId && f.toId === partner.persistentId)
      ) {
        const updated = addLocalFile(myUserId, partner.persistentId, f);
        setFiles(updated);
      }
    };
    socket.on("private_message", msgHandler);
    socket.on("private_file", fileHandler);
    return () => {
      socket.off("private_message", msgHandler);
      socket.off("private_file", fileHandler);
    };
  }, [socket, partner.persistentId, myUserId, currentUserId]);

  // Merge and sort entries
  const entries: ChatEntry[] = [
    ...messages.map((m) => ({
      type: "message" as const,
      id: m.id,
      createdAt: m.createdAt,
      data: m,
    })),
    ...files.map((f) => ({
      type: "file" as const,
      id: f.id,
      createdAt: f.createdAt,
      data: f,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  // Track last sync timestamp for incremental resync
  useEffect(() => {
    const lastMsgTime = messages.length > 0 ? messages[messages.length - 1].createdAt : 0;
    const lastFileTime = files.length > 0 ? files[files.length - 1].createdAt : 0;
    lastSyncTimeRef.current = Math.max(lastMsgTime, lastFileTime);
  }, [messages, files]);

  // Resync on reconnection — fetch messages missed while disconnected
  useEffect(() => {
    const handleReconnect = () => {
      const since = lastSyncTimeRef.current;
      if (since > 0) {
        socket.emit("get_private_messages_since",
          { withUserId: partner.persistentId, since },
          (res: MessagesResponse) => {
            if (res.messages?.length) {
              setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const newMsgs = res.messages.filter(m => !existingIds.has(m.id));
                return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
              });
            }
          }
        );
        socket.emit("get_private_files_since",
          { withUserId: partner.persistentId, since },
          (res: FilesResponse) => {
            if (res.files?.length) {
              setFiles(prev => {
                const existingIds = new Set(prev.map(f => f.id));
                const newFiles = res.files.filter(f => !existingIds.has(f.id));
                return newFiles.length > 0 ? [...prev, ...newFiles] : prev;
              });
            }
          }
        );
      } else {
        socket.emit("get_private_messages",
          { withUserId: partner.persistentId },
          (res: MessagesResponse) => { if (res.messages) setMessages(res.messages); }
        );
        socket.emit("get_private_files",
          { withUserId: partner.persistentId },
          (res: FilesResponse) => { if (res.files) setFiles(res.files); }
        );
      }
    };
    socket.on("connect", handleReconnect);
    return () => { socket.off("connect", handleReconnect); };
  }, [socket, partner.persistentId]);

  // Flush offline queue on reconnect
  useEffect(() => {
    const flushQueue = () => {
      const queue = [...pendingQueueRef.current];
      if (queue.length === 0) return;
      pendingQueueRef.current = [];

      for (const pending of queue) {
        socket.emit(
          "send_private_message",
          { toId: partner.persistentId, content: pending.content },
          (res: SendMessageResponse) => {
            if (res.success && res.message) {
              setMessages(prev => prev.map(m =>
                m.id === pending.tempId ? res.message! : m
              ));
              setPendingIds(prev => {
                const next = new Set(prev);
                next.delete(pending.tempId);
                return next;
              });
            }
          }
        );
      }
    };
    socket.on("connect", flushQueue);
    return () => { socket.off("connect", flushQueue); };
  }, [socket, partner.persistentId]);

  // Send text message (with offline queue support)
  const sendMessage = () => {
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    inputRef.current?.focus();

    if (!socket.connected) {
      // Queue for later — show as pending in the UI
      const tempId = generateUUID();
      pendingQueueRef.current.push({ tempId, content, createdAt: Date.now() });
      setPendingIds(prev => new Set(prev).add(tempId));
      setMessages(prev => [...prev, {
        id: tempId,
        fromId: currentUserId,
        toId: partner.persistentId,
        fromName: currentUserName,
        content,
        createdAt: Date.now(),
      }]);
      return;
    }

    socket.emit(
      "send_private_message",
      { toId: partner.persistentId, content },
      (res: SendMessageResponse) => {
        if (res.success && res.message) {
          const updated = addLocalMessage(myUserId, partner.userId, res.message);
          setMessages(updated);
        }
      },
    );
  };

  // Upload file
  const uploadFile = async (file: File) => {
    setUploadError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("toId", partner.persistentId);
    formData.append("fromId", currentUserId);
    formData.append("fromName", currentUserName);

    try {
      const res = await fetch("/api/upload-private", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      if (data.success && data.file) {
        const updated = addLocalFile(myUserId, partner.userId, data.file);
        setFiles(updated);
      }
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error ? err.message : "Error al subir archivo",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--card-border)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "var(--background-secondary)",
        }}
      >
        <button
          className="btn btn-ghost btn-icon"
          onClick={onBack}
          title="Volver"
          style={{ width: "34px", height: "34px", padding: 0, flexShrink: 0 }}
        >
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div
          className="user-avatar"
          style={{
            width: "36px",
            height: "36px",
            fontSize: "0.85rem",
            flexShrink: 0,
          }}
        >
          {getInitials(partner.nickname)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontWeight: 600, fontSize: "0.95rem" }}
            className="truncate"
          >
            {partner.nickname}
          </div>
          <div
            className="text-muted"
            style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: partner.isOnline === false ? "var(--muted)" : "#22c55e",
              display: "inline-block", flexShrink: 0,
            }} />
            <span>{partner.isOnline === false ? "Desconectado" : "En línea"}</span>
            <span>·</span>
            <span>{partner.os} · {partner.browser}</span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {entries.length === 0 ? (
          <div
            className="text-muted"
            style={{
              padding: "2rem",
              textAlign: "center",
              marginTop: "auto",
              marginBottom: "auto",
            }}
          >
            Inicia una conversación con {partner.nickname}
          </div>
        ) : (
          entries.map((entry) => {
            if (entry.type === "message") {
              const msg = entry.data as PrivateMessage;
              const isMine = msg.fromId === currentUserId;
              return (
                <div
                  key={entry.id}
                  className="animate-slideUp"
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    background: isMine
                      ? "rgba(168, 85, 247, 0.15)"
                      : "rgba(255,255,255,0.03)",
                    padding: "8px 12px",
                    borderRadius: "var(--radius)",
                    maxWidth: "85%",
                    border: isMine
                      ? "1px solid rgba(168, 85, 247, 0.3)"
                      : "1px solid var(--card-border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.9rem",
                      lineHeight: 1.5,
                    }}
                  >
                    <FormattedMessage content={msg.content} />
                  </div>
                  <div
                    className="text-muted"
                    style={{
                      fontSize: "0.65rem",
                      marginTop: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: isMine ? "flex-end" : "flex-start",
                      gap: "6px",
                    }}>
                    {!isMine && <span>{formatTime(msg.createdAt)}</span>}
                    <button
                      type="button"
                      onClick={() => copyMessage(msg.id, msg.content)}
                      title={copiedId === msg.id ? "Copiado" : "Copiar mensaje"}
                      style={{
                        background: copiedId === msg.id ? "rgba(34, 197, 94, 0.2)" : "rgba(255,255,255,0.06)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        padding: "2px 5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        color: copiedId === msg.id ? "var(--success)" : "inherit",
                        fontSize: "0.65rem",
                        transition: "all 0.2s",
                      }}>
                      {copiedId === msg.id ? (
                        <>
                          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copiado</span>
                        </>
                      ) : (
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                    {isMine && (
                      <span>
                        {pendingIds.has(msg.id)
                          ? <span style={{ color: "var(--warning)" }}>⏳ Pendiente</span>
                          : formatTime(msg.createdAt)
                        }
                      </span>
                    )}
                  </div>
                </div>
              );
            } else {
              const file = entry.data as PrivateFile;
              const isMine = file.fromId === currentUserId;
              return (
                <div
                  key={entry.id}
                  className="animate-slideUp"
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                  }}
                >
                  {/* Image preview */}
                  {isImage(file.type) ? (
                    <div
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--card-border)",
                        overflow: "hidden",
                        borderColor: isMine
                          ? "rgba(168, 85, 247, 0.3)"
                          : undefined,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/preview-private/${file.id}`}
                        alt={file.name}
                        style={{
                          width: "100%",
                          maxHeight: "200px",
                          objectFit: "cover",
                          display: "block",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          window.open(
                            `/api/download-private/${file.id}`,
                            "_blank",
                          )
                        }
                      />
                      <div
                        style={{
                          padding: "6px 10px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                        }}
                      >
                        <div
                          className="truncate"
                          style={{ fontSize: "0.75rem", fontWeight: 600 }}
                        >
                          {file.fromName}
                        </div>
                        <a
                          href={`/api/download-private/${file.id}`}
                          target="_blank"
                          className="btn btn-ghost btn-sm"
                          style={{
                            padding: "4px 8px",
                            fontSize: "0.7rem",
                            flexShrink: 0,
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                          </svg>
                          Descargar
                        </a>
                      </div>
                    </div>
                  ) : (
                    /* File card for non-images */
                    <div
                      style={{
                        background: isMine
                          ? "rgba(168, 85, 247, 0.15)"
                          : "rgba(255,255,255,0.03)",
                        borderRadius: "var(--radius)",
                        border: isMine
                          ? "1px solid rgba(168, 85, 247, 0.3)"
                          : "1px solid var(--card-border)",
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <FileIcon mimeType={file.type} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="truncate"
                          style={{ fontWeight: 600, fontSize: "0.85rem" }}
                        >
                          {file.name}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: "0.7rem" }}
                        >
                          {formatSize(file.size)} · {file.fromName}
                        </div>
                      </div>
                      <a
                        href={`/api/download-private/${file.id}`}
                        target="_blank"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "6px 10px", flexShrink: 0 }}
                        title="Descargar"
                      >
                        <svg
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                      </a>
                    </div>
                  )}
                  <div
                    className="text-muted"
                    style={{
                      fontSize: "0.65rem",
                      marginTop: "4px",
                      textAlign: isMine ? "right" : "left",
                    }}
                  >
                    {formatTime(file.createdAt)}
                  </div>
                </div>
              );
            }
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload error */}
      {uploadError && (
        <div
          style={{
            padding: "8px 16px",
            background: "rgba(255, 51, 102, 0.1)",
            borderTop: "1px solid var(--accent)",
            color: "var(--accent)",
            fontSize: "0.8rem",
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Drag overlay */}
      {dragActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 240, 255, 0.1)",
            border: "2px dashed var(--primary)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            backdropFilter: "blur(4px)",
            pointerEvents: "none",
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <svg
              width="48"
              height="48"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <span className="text-primary" style={{ fontWeight: 600 }}>
              Suelta el archivo aquí
            </span>
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 items-end"
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--card-border)",
          background: "rgba(0,0,0,0.2)",
          position: "relative",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileChange}
          disabled={uploading}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Adjuntar archivo"
          style={{ width: "40px", height: "40px", padding: 0, flexShrink: 0 }}
        >
          {uploading ? (
            <svg
              className="animate-pulse"
              width="18"
              height="18"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>
        <textarea
          ref={inputRef}
          className="input"
          style={{
            marginBottom: 0,
            flex: 1,
            minHeight: "40px",
            maxHeight: "100px",
            resize: "none",
            padding: "10px",
            lineHeight: "1.4",
            fontSize: "0.9rem",
          }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          rows={1}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{
            width: "auto",
            flexShrink: 0,
            height: "40px",
            padding: "0 16px",
          }}
          disabled={!text.trim()}
        >
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
