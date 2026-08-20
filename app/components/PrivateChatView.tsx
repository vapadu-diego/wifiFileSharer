"use client";

import { useState, useRef, useEffect, FormEvent, DragEvent } from "react";
import { Socket } from "socket.io-client";
import {
  OnlineUser,
  PrivateMessage,
  PrivateFile,
  getFileCategory,
} from "@/lib/types";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autofocus input when chat opens or changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [partner.id]);

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

  // Load local history & start P2P sync
  useEffect(() => {
    const localMsgs = getLocalMessages(myUserId, partner.userId);
    const localFls = getLocalFiles(myUserId, partner.userId);
    setMessages(localMsgs);
    setFiles(localFls);

    const lastMsg = localMsgs[localMsgs.length - 1];
    const lastTimestamp = lastMsg ? lastMsg.createdAt : 0;
    socket.emit("private_sync_ping", {
      toSocketId: partner.id,
      fromUserId: myUserId,
      lastTimestamp
    });
  }, [socket, partner.id, partner.userId, myUserId]);

  // Listen for P2P sync requests and data
  useEffect(() => {
    const syncPingHandler = (msg: { fromSocketId: string; fromUserId: string; lastTimestamp: number }) => {
      if (msg.fromUserId !== partner.userId) return;

      const localMsgs = getLocalMessages(myUserId, partner.userId);
      const localFls = getLocalFiles(myUserId, partner.userId);
      
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
      if (data.fromUserId !== partner.userId) return;

      let updatedMsgs = [...getLocalMessages(myUserId, partner.userId)];
      let updatedFls = [...getLocalFiles(myUserId, partner.userId)];

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
          saveLocalMessages(myUserId, partner.userId, updatedMsgs);
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
          saveLocalFiles(myUserId, partner.userId, updatedFls);
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
  }, [socket, partner.userId, myUserId]);

  // Listen for new messages
  useEffect(() => {
    const msgHandler = (msg: PrivateMessage) => {
      if (
        (msg.fromId === partner.id && msg.toId === currentUserId) ||
        (msg.fromId === currentUserId && msg.toId === partner.id)
      ) {
        const updated = addLocalMessage(myUserId, partner.userId, msg);
        setMessages(updated);
      }
    };
    const fileHandler = (f: PrivateFile) => {
      if (
        (f.fromId === partner.id && f.toId === currentUserId) ||
        (f.fromId === currentUserId && f.toId === partner.id)
      ) {
        const updated = addLocalFile(myUserId, partner.userId, f);
        setFiles(updated);
      }
    };
    socket.on("private_message", msgHandler);
    socket.on("private_file", fileHandler);
    return () => {
      socket.off("private_message", msgHandler);
      socket.off("private_file", fileHandler);
    };
  }, [socket, partner.id, partner.userId, myUserId, currentUserId]);

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

  // Send text message
  const sendMessage = () => {
    if (!text.trim()) return;
    socket.emit(
      "send_private_message",
      { toId: partner.id, content: text.trim() },
      (res: SendMessageResponse) => {
        if (res.success && res.message) {
          const updated = addLocalMessage(myUserId, partner.userId, res.message);
          setMessages(updated);
        }
      },
    );
    setText("");
    inputRef.current?.focus();
  };

  // Upload file
  const uploadFile = async (file: File) => {
    setUploadError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("toId", partner.id);
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
          <div className="text-muted" style={{ fontSize: "0.7rem" }}>
            {partner.os} · {partner.browser}
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
                      marginBottom: -5,
                      textAlign: isMine ? "right" : "left",
                    }}
                  >
                    {formatTime(msg.createdAt)}
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
