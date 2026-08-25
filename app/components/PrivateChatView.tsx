"use client";

import { useState, useRef, useEffect, useLayoutEffect, FormEvent, DragEvent } from "react";
import { Socket } from "socket.io-client";
import {
  FormatSuggestionsDropdown,
  getCommandQuery,
  handleSuggestionsKeyDown,
  FORMAT_OPTIONS,
} from "./FormatSuggestions";
import {
  OnlineUser,
  PrivateMessage,
  PrivateFile,
} from "@/lib/types";
import { generateUUID } from "@/app/hooks/useSession";
import FileIcon from "./FileIcon";
import FormattedMessage from "./FormattedMessage";
import { formatJsonContent } from "@/lib/jsonFormat";
import {
  getLocalMessages,
  saveLocalMessages,
  addLocalMessage,
  getLocalFiles,
  saveLocalFiles,
  addLocalFile,
  editLocalMessage,
  deleteLocalMessage
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

interface MutationResponse {
  success: boolean;
  error?: string;
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
      if (document.execCommand("copy")) {
        resolve();
      } else {
        reject();
      }
      textArea.remove();
    });
  }
}

const PAGE_SIZE = 30;

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const lastSyncTimeRef = useRef(0);
  const pendingQueueRef = useRef<Array<{ tempId: string; content: string; createdAt: number }>>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string; content: string } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingOriginalText, setEditingOriginalText] = useState("");

  // Suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [slashInfo, setSlashInfo] = useState<{ query: string; slashIndex: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const copyMessage = (id: string, text: string) => {
    copyToClipboard(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleContextMenu = (e: React.MouseEvent, msg: PrivateMessage) => {
    const isMine = msg.fromId === currentUserId;
    if (!isMine) return; // Only allow context menu for own messages
    e.preventDefault();
    const MENU_WIDTH = 130;
    const MENU_HEIGHT = 85;
    const x = Math.max(10, Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 10));
    const y = Math.max(10, Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 10));
    setContextMenu({
      x,
      y,
      messageId: msg.id,
      content: msg.content,
    });
  };

  const startEdit = () => {
    if (!contextMenu) return;
    setEditingMessageId(contextMenu.messageId);
    setEditingText(contextMenu.content);
    setEditingOriginalText(contextMenu.content);
    setContextMenu(null);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
    setEditingOriginalText("");
  };

  const hasEditChanges = editingMessageId !== null && editingText.trim() !== editingOriginalText.trim();

  const saveEdit = () => {
    if (!hasEditChanges || !editingMessageId) return;

    let content = editingText.trim();
    content = formatJsonContent(content);

    socket.emit(
      "edit_private_message",
      { id: editingMessageId, toId: partner.persistentId, content },
      (res: MutationResponse) => {
        if (res.success) {
          const updated = editLocalMessage(myUserId, partner.persistentId, editingMessageId, content);
          setMessages(updated);
          cancelEdit();
        }
      }
    );
  };

  const deleteMsg = () => {
    if (!contextMenu) return;
    socket.emit(
      "delete_private_message",
      { id: contextMenu.messageId, toId: partner.persistentId },
      (res: MutationResponse) => {
        if (res.success) {
          const updated = deleteLocalMessage(myUserId, partner.persistentId, contextMenu.messageId);
          setMessages(updated);
          setContextMenu(null);
        }
      }
    );
  };


  // Autofocus input when chat opens or changes
  useEffect(() => {
    inputRef.current?.focus();
    isAtBottomRef.current = true;
    initialLoadDoneRef.current = false;
    setVisibleCount(PAGE_SIZE);
  }, [partner.persistentId]);

  // Auto-expand textarea based on content (up to 7 lines)
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [text]);

  // Close chat on ESC key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSuggestions || editingMessageId) return;
        onBack();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onBack, showSuggestions, editingMessageId]);

  // Close context menu on click anywhere
  useEffect(() => {
    const handleOuterClick = (e: MouseEvent) => {
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
        return;
      }
      setContextMenu(null);
    };
    window.addEventListener("click", handleOuterClick);
    return () => window.removeEventListener("click", handleOuterClick);
  }, []);

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
            setTimeout(() => { initialLoadDoneRef.current = true; }, 0);
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
            setTimeout(() => { initialLoadDoneRef.current = true; }, 0);
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
            setTimeout(() => { initialLoadDoneRef.current = true; }, 0);
          }
        );
        socket.emit("get_private_files",
          { withUserId: partner.persistentId },
          (res: FilesResponse) => {
            if (res.files) {
              setFiles(res.files);
              saveLocalFiles(myUserId, partner.persistentId, res.files);
            }
            setTimeout(() => { initialLoadDoneRef.current = true; }, 0);
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

      const updatedMsgs = [...getLocalMessages(myUserId, partner.persistentId)];
      const updatedFls = [...getLocalFiles(myUserId, partner.persistentId)];

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
    const msgEditedHandler = ({ id, fromId, content }: { id: string; fromId: string; content: string }) => {
      if (fromId === partner.persistentId || fromId === currentUserId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === id) {
              return { ...m, content, updatedAt: Date.now() };
            }
            return m;
          })
        );
      }
    };
    const msgDeletedHandler = ({ id, fromId }: { id: string; fromId: string }) => {
      if (fromId === partner.persistentId || fromId === currentUserId) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    };

    socket.on("private_message", msgHandler);
    socket.on("private_file", fileHandler);
    socket.on("private_message_edited", msgEditedHandler);
    socket.on("private_message_deleted", msgDeletedHandler);
    return () => {
      socket.off("private_message", msgHandler);
      socket.off("private_file", fileHandler);
      socket.off("private_message_edited", msgEditedHandler);
      socket.off("private_message_deleted", msgDeletedHandler);
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

  const visibleEntries = entries.slice(-visibleCount);

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    isAtBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 50;

    if (container.scrollTop === 0 && visibleCount < entries.length) {
      const oldScrollHeight = container.scrollHeight;
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, entries.length));
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - oldScrollHeight;
      });
    }
  };

  // Anchor to bottom before first paint during the initial load
  useLayoutEffect(() => {
    if (!isAtBottomRef.current || initialLoadDoneRef.current) return;
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [entries.length, partner.persistentId]);

  // Smooth-scroll to bottom for incoming messages once initial load is done
  useEffect(() => {
    if (!isAtBottomRef.current || !initialLoadDoneRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, partner.persistentId]);

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

    let content = text.trim();
    content = formatJsonContent(content);

    setText("");
    setShowSuggestions(false);
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
          const updated = addLocalMessage(myUserId, partner.persistentId, res.message);
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
        const updated = addLocalFile(myUserId, partner.persistentId, data.file);
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

  const handleSelectOption = (option: typeof FORMAT_OPTIONS[0]) => {
    if (!slashInfo || !inputRef.current) return;
    const textarea = inputRef.current;
    const val = textarea.value;
    const before = val.slice(0, slashInfo.slashIndex);
    const after = val.slice(textarea.selectionEnd || 0);
    const newText = before + option.insertText + after;
    setText(newText);
    setShowSuggestions(false);

    const newCursorPos = slashInfo.slashIndex + option.cursorOffset;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cmd = getCommandQuery(val, e.target.selectionEnd || 0);
    if (cmd) {
      setSlashInfo(cmd);
      setShowSuggestions(true);
      setSelectedIndex((prev) => (slashInfo?.query === cmd.query ? prev : 0));
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const cmd = getCommandQuery(target.value, target.selectionEnd || 0);
    if (cmd && e.key !== "Escape") {
      setSlashInfo(cmd);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && slashInfo) {
      const filtered = FORMAT_OPTIONS.filter((opt) =>
        opt.label.toLowerCase().includes(slashInfo.query) ||
        opt.searchKeys.some((key) => key.includes(slashInfo.query))
      );

      const handled = handleSuggestionsKeyDown(
        e,
        showSuggestions,
        filtered.length,
        selectedIndex,
        setSelectedIndex,
        (idx) => {
          const option = filtered[idx];
          if (option) {
            handleSelectOption(option);
          }
        },
        () => setShowSuggestions(false)
      );

      if (handled) return;
    }

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
        onScroll={handleMessagesScroll}
        ref={messagesContainerRef}
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
          visibleEntries.map((entry) => {
            if (entry.type === "message") {
              const msg = entry.data as PrivateMessage;
              const isMine = msg.fromId === currentUserId;
              return (
                <div
                  key={entry.id}
                  className="message-bubble animate-slideUp"
                  onContextMenu={(e) => handleContextMenu(e, msg)}
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
                    position: "relative",
                    cursor: isMine ? "text" : "default",
                  }}
                >
                  {editingMessageId === msg.id ? (
                    <div className="flex flex-col gap-2" style={{ width: "100%", minWidth: "280px", maxWidth: "600px" }}>
                      <textarea
                        className="input"
                        style={{
                          width: "100%",
                          background: "rgba(0,0,0,0.3)",
                          border: "1px solid var(--primary)",
                          borderRadius: "4px",
                          color: "#fff",
                          fontSize: "0.9rem",
                          padding: "8px 10px",
                          resize: "none",
                          height: `${Math.min(Math.max(editingText.split("\n").length * 20 + 20, 100), 160)}px`,
                          minHeight: "100px",
                          maxHeight: "160px",
                          lineHeight: "1.4",
                          fontFamily: "monospace",
                        }}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            cancelEdit();
                          }
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={cancelEdit}
                          style={{ fontSize: "0.75rem", padding: "2px 8px", height: "24px", minHeight: "24px" }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={saveEdit}
                          style={{ fontSize: "0.75rem", padding: "2px 8px", height: "24px", minHeight: "24px" }}
                          disabled={!hasEditChanges}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          lineHeight: 1.5,
                        }}
                      >
                        <FormattedMessage content={msg.content} />
                      </div>
                      <div
                        className="flex items-center gap-1 text-muted"
                        style={{
                          fontSize: "0.65rem",
                          marginTop: "4px",
                          marginBottom: -2,
                          justifyContent: isMine ? "flex-end" : "flex-start",
                        }}
                      >
                        {isMine ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyMessage(msg.id, msg.content);
                              }}
                              title="Copiar mensaje"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: copiedId === msg.id ? "var(--success)" : "currentColor",
                                opacity: 0.6,
                                transition: "all 0.2s",
                              }}
                            >
                              {copiedId === msg.id ? (
                                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                            {pendingIds.has(msg.id) ? (
                              <span style={{ color: "var(--warning)" }}>⏳ Pendiente</span>
                            ) : (
                              <span className="flex items-center gap-1">
                                {msg.updatedAt && <span style={{ opacity: 0.6 }}>(editado)</span>}
                                <span>{formatTime(msg.createdAt)}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span>{formatTime(msg.createdAt)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyMessage(msg.id, msg.content);
                              }}
                              title="Copiar mensaje"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: copiedId === msg.id ? "var(--success)" : "currentColor",
                                opacity: 0.6,
                                transition: "all 0.2s",
                              }}
                            >
                              {copiedId === msg.id ? (
                                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
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
                        onLoad={() => {
                          const container = messagesContainerRef.current;
                          if (container && isAtBottomRef.current) {
                            container.scrollTop = container.scrollHeight;
                          }
                        }}
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
        {showSuggestions && slashInfo && (
          <FormatSuggestionsDropdown
            query={slashInfo.query}
            selectedIndex={selectedIndex}
            onSelect={handleSelectOption}
            onClose={() => setShowSuggestions(false)}
          />
        )}
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
            maxHeight: "160px",
            resize: "none",
            padding: "10px",
            lineHeight: "1.4",
            fontSize: "0.9rem",
            overflowY: "auto",
          }}
          value={text}
          onChange={handleTextChange}
          onKeyUp={handleKeyUp}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje... (o '/' para formatos)"
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

      {/* Context Menu */}
      {contextMenu && (() => {
        const menuWidth = 130;
        const menuHeight = 85;
        const menuX = typeof window !== "undefined" && contextMenu.x + menuWidth > window.innerWidth
          ? window.innerWidth - menuWidth - 10
          : contextMenu.x;
        const menuY = typeof window !== "undefined" && contextMenu.y + menuHeight > window.innerHeight
          ? window.innerHeight - menuHeight - 10
          : contextMenu.y;

        return (
          <div
            ref={contextMenuRef}
            style={{
              position: "fixed",
              top: menuY,
              left: menuX,
              zIndex: 9999,
              background: "var(--card-bg, #1e1e2e)",
              border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              padding: "4px",
              display: "flex",
              flexDirection: "column",
              minWidth: "120px",
            }}
            onClick={(e) => e.stopPropagation()} // Prevent click through closing it immediately
          >
            <button
              type="button"
              onClick={startEdit}
              style={{
                background: "none",
                border: "none",
                color: "#fff",
                padding: "6px 12px",
                textAlign: "left",
                fontSize: "0.8rem",
                cursor: "pointer",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              className="context-menu-item"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
              </svg>
              Editar
            </button>
            <button
              type="button"
              onClick={deleteMsg}
              style={{
                background: "none",
                border: "none",
                color: "var(--danger, #ef4444)",
                padding: "6px 12px",
                textAlign: "left",
                fontSize: "0.8rem",
                cursor: "pointer",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              className="context-menu-item danger"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Eliminar
            </button>
          </div>
        );
      })()}
    </div>
  );
}
