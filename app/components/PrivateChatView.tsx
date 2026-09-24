"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, FormEvent, DragEvent } from "react";
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
  ReplyRef,
  isPreviewableFile,
} from "@/lib/types";
import { generateUUID } from "@/app/hooks/useSession";
import FileIcon from "./FileIcon";
import FormattedMessage from "./FormattedMessage";
import EmojiPicker, { insertAtCursor } from "./EmojiPicker";
import FilePreviewModal from "./FilePreviewModal";
import { ReplyQuote, ReplyPreview } from "./ReplyQuote";
import { useSelectionCopy } from "@/app/hooks/useSelectionCopy";
import { ToastItem } from "@/app/hooks/useToasts";
import { buildMessageReply, buildSelectionReply, getSelectionNodes } from "@/lib/reply";
import { formatJsonContent } from "@/lib/jsonFormat";
import { getLegacyMessages, clearLegacyMessages } from "@/lib/legacyChat";
import {
  enqueueMessage,
  getQueuedFor,
  getQueuedMessages,
  removeQueuedMessage,
} from "@/lib/offlineQueue";

interface PrivateChatViewProps {
  socket: Socket;
  partner: OnlineUser;
  currentUserId: string;
  currentUserName: string;
  myUserId: string;
  initialMessageId?: string | null;
  onBack: () => void;
  pushToast?: (toast: Omit<ToastItem, "id">, durationMs?: number) => void;
}

interface MessagesPageResponse {
  messages: PrivateMessage[];
  hasMore: boolean;
}

interface MessageContextResponse {
  messages: PrivateMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

interface FilesResponse {
  files: PrivateFile[];
}

interface UpdatesResponse {
  updated: PrivateMessage[];
  deleted: string[];
}

interface ImportResponse {
  success: boolean;
  imported: number;
  error?: string;
}

interface SendMessageResponse {
  success: boolean;
  message?: PrivateMessage;
  error?: string;
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

function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Responder"
      className="msg-reply-btn"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "currentColor",
        opacity: 0.6,
        transition: "all 0.2s",
      }}
    >
      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
  );
}

const PAGE_SIZE = 50;
const CONTEXT_LIMIT = 25;

export default function PrivateChatView({
  socket,
  partner,
  currentUserId,
  currentUserName,
  myUserId,
  initialMessageId,
  onBack,
  pushToast,
}: PrivateChatViewProps) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [files, setFiles] = useState<PrivateFile[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const initialPageLoadedRef = useRef(false);
  const jumpedInitialRef = useRef<string | null>(null);
  const jumpToMessageRef = useRef<(messageId: string) => void>(() => {});
  const loadingOlderRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const forceScrollToBottomRef = useRef(false);
  const lastSyncTimeRef = useRef(0);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetType: "message" | "file"; messageId?: string; content?: string; fileId?: string; hasSelection?: boolean; selectionReply?: ReplyRef | null } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingOriginalText, setEditingOriginalText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);

  // Suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [slashInfo, setSlashInfo] = useState<{ query: string; slashIndex: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [missingFileIds, setMissingFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<PrivateFile | null>(null);
  const checkedFileIdsRef = useRef<Set<string>>(new Set());
  const [fileCheckVersion, setFileCheckVersion] = useState(0);

  // Scroll-down button / new message highlight / typing / read receipts
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingEmitRef = useRef(0);
  const lastReadEmitRef = useRef(0);
  const readTimerRef = useRef<number | null>(null);
  const userScrollingRef = useRef(false);

  // Tell the partner we've read their messages. Trailing throttle: a message
  // arriving inside the window is still marked as read once the window closes.
  const emitRead = useCallback(() => {
    if (!socket.connected) return;
    const emit = () => {
      lastReadEmitRef.current = Date.now();
      socket.emit("private_read", { withUserId: partner.persistentId });
    };
    const elapsed = Date.now() - lastReadEmitRef.current;
    if (elapsed >= 500) {
      emit();
      return;
    }
    if (readTimerRef.current !== null) return;
    readTimerRef.current = window.setTimeout(() => {
      readTimerRef.current = null;
      if (socket.connected) emit();
    }, 500 - elapsed);
  }, [socket, partner.persistentId]);

  const flashMessage = useCallback((id: string) => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    setHighlightId(id);
    highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), 1700);
  }, []);

  // Re-anchor to the very bottom once the initial load settles, so the last
  // message is never left half-visible when entering the chat.
  const markInitialLoadDone = useCallback(() => {
    initialLoadDoneRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container && !userScrollingRef.current) {
          container.scrollTop = container.scrollHeight;
          isAtBottomRef.current = true;
          setIsAtBottom(true);
          setUnseenCount(0);
        }
      });
    });
  }, []);

  // Selecting text inside a bubble copies it automatically and shows a toast
  const handleSelectionCopied = useCallback(() => {
    pushToast?.({ icon: "✅", title: "Texto copiado", variant: "light" }, 2000);
  }, [pushToast]);

  const notifyError = useCallback((error?: string) => {
    pushToast?.({ icon: "⚠️", title: "Operación rechazada", body: error || "Inténtalo de nuevo" });
  }, [pushToast]);

  useSelectionCopy(messagesContainerRef, {
    enabled: !editingMessageId,
    onCopied: handleSelectionCopied,
  });

  const copyMessage = (id: string, text: string) => {
    copyToClipboard(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const hasSelectionInBubble = (messageId: string): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;
    const bubble = document.getElementById(`msg-${messageId}`);
    if (!bubble) return false;
    const { anchorEl, focusEl } = getSelectionNodes(selection);
    return !!anchorEl && !!focusEl && bubble.contains(anchorEl) && bubble.contains(focusEl);
  };

  const startReply = (msg: PrivateMessage, useSelection = true) => {
    let ref: ReplyRef | null = null;
    if (useSelection && hasSelectionInBubble(msg.id)) {
      const selection = window.getSelection();
      if (selection) {
        ref = buildSelectionReply({ id: msg.id, senderName: msg.fromName }, selection);
      }
    }
    if (!ref) ref = buildMessageReply(msg.id, msg.fromName, msg.content);
    setReplyTo(ref);
    setContextMenu(null);
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleContextMenu = (e: React.MouseEvent, msg: PrivateMessage) => {
    e.preventDefault();
    const MENU_WIDTH = 150;
    const MENU_HEIGHT = 120;
    const x = Math.max(10, Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 10));
    const y = Math.max(10, Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 10));

    let selectionReply: ReplyRef | null = null;
    if (hasSelectionInBubble(msg.id)) {
      const selection = window.getSelection();
      if (selection) {
        selectionReply = buildSelectionReply({ id: msg.id, senderName: msg.fromName }, selection);
      }
    }

    setContextMenu({
      x,
      y,
      targetType: "message",
      messageId: msg.id,
      content: msg.content,
      hasSelection: !!selectionReply,
      selectionReply,
    });
  };

  const handleFileContextMenu = (e: React.MouseEvent, file: PrivateFile) => {
    if (file.fromId !== currentUserId) return; // Only allow context menu for own files
    e.preventDefault();
    const MENU_WIDTH = 130;
    const MENU_HEIGHT = 45;
    const x = Math.max(10, Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 10));
    const y = Math.max(10, Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 10));
    setContextMenu({
      x,
      y,
      targetType: "file",
      fileId: file.id,
    });
  };

  const startEdit = () => {
    if (!contextMenu || contextMenu.targetType !== "message") return;
    setEditingMessageId(contextMenu.messageId!);
    setEditingText(contextMenu.content || "");
    setEditingOriginalText(contextMenu.content || "");
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
    const messageId = editingMessageId;

    let content = editingText.trim();
    content = formatJsonContent(content);

    socket.emit(
      "edit_private_message",
      { id: messageId, toId: partner.persistentId, content },
      (res: MutationResponse) => {
        if (res.success) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, content, updatedAt: Date.now() } : m
            )
          );
          cancelEdit();
        } else {
          notifyError(res.error);
        }
      }
    );
  };

  const deleteMsg = () => {
    if (!contextMenu || contextMenu.targetType !== "message") return;
    const messageId = contextMenu.messageId;
    socket.emit(
      "delete_private_message",
      { id: messageId, toId: partner.persistentId },
      (res: MutationResponse) => {
        if (res.success) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        } else {
          notifyError(res.error);
        }
        setContextMenu(null);
      }
    );
  };

  const deleteFile = (fileId: string) => {
    socket.emit(
      "delete_private_file",
      { id: fileId, toId: partner.persistentId },
      (res: MutationResponse) => {
        if (res.success) {
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
        } else {
          notifyError(res.error);
        }
        setContextMenu(null);
      }
    );
  };

  const removeExpiredFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setMissingFileIds((prev) => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
    checkedFileIdsRef.current.delete(fileId);
  };


  // Prevent the document from scrolling while the chat is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Autofocus input when chat opens or changes. Everything tied to the
  // previous conversation is reset so no state leaks between partners.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setUnseenCount(0);
    setPartnerTyping(false);
    setHighlightId(null);
    initialLoadDoneRef.current = false;
    initialPageLoadedRef.current = false;
    setHasMoreOlder(false);
    setMessages([]);
    setFiles([]);
    setReplyTo(null);
    setText("");
    setEditingMessageId(null);
    setEditingText("");
    setEditingOriginalText("");
    setMissingFileIds(new Set());
    checkedFileIdsRef.current = new Set();
    lastReadEmitRef.current = 0;
    lastTypingEmitRef.current = 0;
    lastSyncTimeRef.current = 0;
    setPendingIds(new Set(getQueuedFor(partner.persistentId).map((item) => item.tempId)));
    if (readTimerRef.current !== null) {
      window.clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
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
        if (showEmojiPicker) {
          setShowEmojiPicker(false);
          return;
        }
        if (replyTo) {
          setReplyTo(null);
          return;
        }
        onBack();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onBack, showSuggestions, editingMessageId, showEmojiPicker, replyTo]);

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

  // Initial load: latest page from the server + legacy local import (once)
  useEffect(() => {
    initialPageLoadedRef.current = false;
    let cancelled = false;

    const mergeById = (prev: PrivateMessage[], incoming: PrivateMessage[]): PrivateMessage[] => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = false;
      for (const msg of incoming) {
        const existing = byId.get(msg.id);
        if (!existing || (msg.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          byId.set(msg.id, { ...existing, ...msg });
          changed = true;
        }
      }
      if (!changed) return prev;
      return Array.from(byId.values()).sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
      );
    };

    // Messages composed offline and still pending for this conversation are
    // re-attached so the server page never hides them.
    const mergeQueued = (prev: PrivateMessage[]): PrivateMessage[] => {
      const queued = getQueuedFor(partner.persistentId);
      if (queued.length === 0) return prev;
      const ids = new Set(prev.map((m) => m.id));
      const missing = queued
        .filter((item) => !ids.has(item.tempId))
        .map((item) => ({
          id: item.tempId,
          fromId: currentUserId,
          toId: item.toId,
          fromName: currentUserName,
          content: item.content,
          createdAt: item.createdAt,
          replyTo: item.replyTo,
        }));
      if (missing.length === 0) return prev;
      return [...prev, ...missing].sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
      );
    };

    const loadLatestPage = () => {
      socket.emit(
        "get_private_messages_page",
        { withUserId: partner.persistentId, limit: PAGE_SIZE },
        (res: MessagesPageResponse) => {
          if (cancelled) return;
          const page = res?.messages || [];
          setMessages((prev) =>
            mergeQueued(initialPageLoadedRef.current ? mergeById(prev, page) : page)
          );
          setHasMoreOlder(res?.hasMore === true);
          const newest = page.length > 0 ? page[page.length - 1].createdAt : 0;
          if (newest > 0) lastSyncTimeRef.current = newest;
          initialPageLoadedRef.current = true;
          emitRead();
          setTimeout(() => { markInitialLoadDone(); }, 0);
        }
      );
      socket.emit("get_private_files", { withUserId: partner.persistentId }, (res: FilesResponse) => {
        if (!cancelled && res?.files) setFiles(res.files);
      });
    };

    // One-time migration of the legacy localStorage history (own messages only)
    const importLegacy = () => {
      const legacy = getLegacyMessages(myUserId, partner.persistentId).filter(
        (m) => m.fromId === currentUserId
      );
      if (legacy.length === 0) return;
      socket.emit(
        "import_local_messages",
        { withUserId: partner.persistentId, messages: legacy },
        (res: ImportResponse) => {
          if (cancelled || !res?.success) return;
          clearLegacyMessages(myUserId, partner.persistentId);
          if (res.imported > 0) loadLatestPage();
        }
      );
    };

    if (socket.connected) {
      loadLatestPage();
      importLegacy();
    }
    const onConnect = () => {
      if (!initialPageLoadedRef.current) {
        loadLatestPage();
        importLegacy();
      }
    };
    socket.on("connect", onConnect);

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
    };
  }, [socket, partner.persistentId, myUserId, currentUserId, currentUserName, emitRead, markInitialLoadDone]);

  // Reconnect: gap fill + reconcile edits/deletions made while offline (B4)
  useEffect(() => {
    const handleReconnect = () => {
      if (!initialPageLoadedRef.current) return;
      const since = lastSyncTimeRef.current;
      if (since <= 0) return;

      socket.emit(
        "get_private_messages_since",
        { withUserId: partner.persistentId, since },
        (res: MessagesPageResponse) => {
          if (!res?.messages?.length) return;
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const fresh = res.messages.filter((m) => !existing.has(m.id));
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh].sort(
              (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
            );
          });
          const newest = res.messages[res.messages.length - 1].createdAt;
          if (newest > lastSyncTimeRef.current) lastSyncTimeRef.current = newest;
          emitRead();
        }
      );
      socket.emit(
        "get_private_updates_since",
        { withUserId: partner.persistentId, since },
        (res: UpdatesResponse) => {
          if (!res || (!res.updated?.length && !res.deleted?.length)) return;
          setMessages((prev) => {
            let next = prev;
            if (res.updated?.length) {
              const byId = new Map(res.updated.map((m) => [m.id, m]));
              next = next.map((m) => byId.get(m.id) ?? m);
            }
            if (res.deleted?.length) {
              const del = new Set(res.deleted);
              next = next.filter((m) => !del.has(m.id));
            }
            return next;
          });
        }
      );
    };

    socket.on("connect", handleReconnect);
    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [socket, partner.persistentId, emitRead]);

  // Load the previous page when the user scrolls to the top
  const loadOlderPage = useCallback(() => {
    if (loadingOlderRef.current || !hasMoreOlder) return;
    const container = messagesContainerRef.current;
    const first = messages[0];
    if (!container || !first) return;

    loadingOlderRef.current = true;
    const oldScrollHeight = container.scrollHeight;

    socket.emit(
      "get_private_messages_page",
      {
        withUserId: partner.persistentId,
        before: { createdAt: first.createdAt, id: first.id },
        limit: PAGE_SIZE,
      },
      (res: MessagesPageResponse) => {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const older = (res?.messages || []).filter((m) => !existing.has(m.id));
          return older.length > 0 ? [...older, ...prev] : prev;
        });
        setHasMoreOlder(res?.hasMore === true);
        requestAnimationFrame(() => {
          const c = messagesContainerRef.current;
          if (c) c.scrollTop = c.scrollHeight - oldScrollHeight;
          loadingOlderRef.current = false;
        });
      }
    );
  }, [socket, partner.persistentId, messages, hasMoreOlder]);

  // Listen for new messages
  useEffect(() => {
    const msgHandler = (msg: PrivateMessage) => {
      if (
        (msg.fromId === partner.persistentId && msg.toId === currentUserId) ||
        (msg.fromId === currentUserId && msg.toId === partner.persistentId)
      ) {
        const isIncoming = msg.fromId === partner.persistentId;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg].sort(
            (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
          );
        });
        if (isIncoming) {
          emitRead();
          flashMessage(msg.id);
          if (!isAtBottomRef.current) {
            setUnseenCount((prev) => prev + 1);
          }
        }
      }
    };
    const fileHandler = (f: PrivateFile) => {
      if (
        (f.fromId === partner.persistentId && f.toId === currentUserId) ||
        (f.fromId === currentUserId && f.toId === partner.persistentId)
      ) {
        setFiles((prev) => {
          if (prev.some((file) => file.id === f.id)) return prev;
          return [...prev, f].sort((a, b) => a.createdAt - b.createdAt);
        });
        if (f.fromId === partner.persistentId) emitRead();
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
    const fileDeletedHandler = ({ id, fromId }: { id: string; fromId: string }) => {
      if (fromId === partner.persistentId || fromId === currentUserId) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      }
    };
    const typingHandler = ({ fromId }: { fromId: string }) => {
      if (fromId !== partner.persistentId) return;
      setPartnerTyping(true);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setPartnerTyping(false), 4000);
    };
    const readHandler = ({ fromUserId, messageIds }: { fromUserId: string; messageIds: string[] }) => {
      if (fromUserId !== partner.persistentId) return;
      const ids = new Set(messageIds);
      setMessages((prev) =>
        prev.map((m) => (ids.has(m.id) && !m.readAt ? { ...m, readAt: Date.now() } : m))
      );
    };

    socket.on("private_message", msgHandler);
    socket.on("private_file", fileHandler);
    socket.on("private_message_edited", msgEditedHandler);
    socket.on("private_message_deleted", msgDeletedHandler);
    socket.on("private_file_deleted", fileDeletedHandler);
    socket.on("private_typing", typingHandler);
    socket.on("private_messages_read", readHandler);
    return () => {
      socket.off("private_message", msgHandler);
      socket.off("private_file", fileHandler);
      socket.off("private_message_edited", msgEditedHandler);
      socket.off("private_message_deleted", msgDeletedHandler);
      socket.off("private_file_deleted", fileDeletedHandler);
      socket.off("private_typing", typingHandler);
      socket.off("private_messages_read", readHandler);
    };
  }, [socket, partner.persistentId, myUserId, currentUserId, emitRead, flashMessage]);

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
  ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const visibleEntries = entries;

  const highlightCodeLines = (el: HTMLElement, reply: ReplyRef) => {
    if (reply.kind !== "code" || !reply.startLine) return;
    const start = reply.startLine;
    const end = reply.endLine ?? start;
    el.querySelectorAll<HTMLElement>(".code-line").forEach((lineEl) => {
      const num = Number(lineEl.dataset.line);
      if (num >= start && num <= end) {
        lineEl.classList.add("code-line-flash");
        window.setTimeout(() => lineEl.classList.remove("code-line-flash"), 1700);
      }
    });
    const targetLine = el.querySelector<HTMLElement>(`.code-line[data-line="${start}"]`);
    if (targetLine && el.scrollHeight > el.clientHeight) {
      targetLine.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const jumpToMessage = (reply: ReplyRef) => {
    const el = document.getElementById(`msg-${reply.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      flashMessage(reply.id);
      highlightCodeLines(el, reply);
      return;
    }

    // The quoted message is outside the loaded window: fetch a page around it
    socket.emit(
      "get_private_message_context",
      { withUserId: partner.persistentId, messageId: reply.id, limit: CONTEXT_LIMIT },
      (res: MessageContextResponse) => {
        if (!res?.messages?.length) return;
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const msg of res.messages) byId.set(msg.id, msg);
          return Array.from(byId.values()).sort(
            (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
          );
        });
        setHasMoreOlder(res.hasMoreBefore === true);
        window.setTimeout(() => {
          const target = document.getElementById(`msg-${reply.id}`);
          if (!target) return;
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          flashMessage(reply.id);
          highlightCodeLines(target, reply);
        }, 80);
      }
    );
  };

  jumpToMessageRef.current = (messageId: string) =>
    jumpToMessage({ id: messageId, senderName: "", snippet: "" });

  // Jump to a message opened from the command palette
  useEffect(() => {
    jumpedInitialRef.current = null;
  }, [partner.persistentId]);

  useEffect(() => {
    if (!initialMessageId || jumpedInitialRef.current === initialMessageId) return;
    let attempts = 0;
    let timer: number | undefined;
    const tryJump = () => {
      if (initialPageLoadedRef.current || attempts >= 30) {
        jumpedInitialRef.current = initialMessageId;
        jumpToMessageRef.current(initialMessageId);
        return;
      }
      attempts += 1;
      timer = window.setTimeout(tryJump, 100);
    };
    tryJump();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initialMessageId, partner.persistentId]);

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

    if (container.scrollTop === 0) {
      loadOlderPage();
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

  // Anchor to bottom before first paint during the initial load
  useLayoutEffect(() => {
    if (!isAtBottomRef.current || initialLoadDoneRef.current) return;
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [entries.length, partner.persistentId]);

  // Smooth-scroll to bottom for incoming messages once initial load is done
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (!isAtBottomRef.current && !forceScrollToBottomRef.current) return;
    forceScrollToBottomRef.current = false;
    messagesContainerRef.current?.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries.length, partner.persistentId]);

  // Scroll to bottom so the "typing" bubble is visible when it appears
  useEffect(() => {
    if (!partnerTyping) return;
    if (!isAtBottomRef.current) return;
    const container = messagesContainerRef.current;
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [partnerTyping]);

  // Self-healing: if content grew while the smooth scroll was animating (or any
  // late reflow happens), re-anchor to the bottom so the newest message is
  // always fully visible when the user is at the bottom.
  useEffect(() => {
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
  }, [entries.length, partner.persistentId]);

  // Re-anchor when content grows late (images, diagrams, fonts, etc.) while at bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Track last sync timestamp for incremental resync. Only messages matter:
  // the gap-fill endpoint filters by message createdAt, not file createdAt.
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsgTime = messages[messages.length - 1].createdAt;
    if (lastMsgTime > lastSyncTimeRef.current) lastSyncTimeRef.current = lastMsgTime;
  }, [messages]);

  // Flush offline queue on reconnect. Every entry carries its own recipient,
  // so switching conversations while disconnected cannot misdeliver it.
  useEffect(() => {
    const flushQueue = () => {
      const queue = getQueuedMessages();
      if (queue.length === 0) return;

      for (const pending of queue) {
        socket.emit(
          "send_private_message",
          { toId: pending.toId, content: pending.content, replyTo: pending.replyTo },
          (res: SendMessageResponse) => {
            if (res.success && res.message) {
              removeQueuedMessage(pending.tempId);
              const sent = res.message;
              setMessages(prev => {
                const withoutTemp = prev.filter(m => m.id !== pending.tempId);
                if (withoutTemp.some(m => m.id === sent.id)) return withoutTemp;
                return [...withoutTemp, sent].sort(
                  (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
                );
              });
              setPendingIds(prev => {
                const next = new Set(prev);
                next.delete(pending.tempId);
                return next;
              });
            } else {
              // Keep it queued so a later reconnect can retry
              notifyError(res.error);
            }
          }
        );
      }
    };
    socket.on("connect", flushQueue);
    if (socket.connected) flushQueue();
    return () => { socket.off("connect", flushQueue); };
  }, [socket, notifyError]);

  // Check which shared files still exist on the server (they are ephemeral:
  // they disappear when the server restarts)
  useEffect(() => {
    const ids = files
      .filter((f) => !checkedFileIdsRef.current.has(f.id))
      .map((f) => f.id);
    if (ids.length === 0) return;
    ids.forEach((id) => checkedFileIdsRef.current.add(id));

    let cancelled = false;
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/private-file-status/${id}`);
          const data = await res.json();
          return { id, exists: !!data.exists };
        } catch {
          return { id, exists: true };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const missing = results.filter((r) => !r.exists).map((r) => r.id);
      if (missing.length > 0) {
        setMissingFileIds((prev) => {
          const next = new Set(prev);
          missing.forEach((id) => next.add(id));
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [files, fileCheckVersion]);

  // Re-check files after a reconnection (the server may have restarted)
  useEffect(() => {
    const handleConnect = () => {
      checkedFileIdsRef.current = new Set();
      setMissingFileIds(new Set());
      setFileCheckVersion((prev) => prev + 1);
    };
    socket.on("connect", handleConnect);
    return () => {
      socket.off("connect", handleConnect);
    };
  }, [socket]);

  // Scroll to the newest message (used when sending a message/file)
  const scrollToBottom = () => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setUnseenCount(0);
    userScrollingRef.current = false;
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      container?.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  // Send text message (with offline queue support)
  const sendMessage = () => {
    if (!text.trim()) return;

    let content = text.trim();
    content = formatJsonContent(content);

    const reply = replyTo;

    setText("");
    setReplyTo(null);
    setShowSuggestions(false);
    inputRef.current?.focus({ preventScroll: true });

    if (!socket.connected) {
      // Queue for later — show as pending in the UI
      const tempId = generateUUID();
      const createdAt = Date.now();
      enqueueMessage({
        tempId,
        toId: partner.persistentId,
        content,
        createdAt,
        replyTo: reply ?? undefined,
      });
      setPendingIds(prev => new Set(prev).add(tempId));
      setMessages(prev => [...prev, {
        id: tempId,
        fromId: currentUserId,
        toId: partner.persistentId,
        fromName: currentUserName,
        content,
        createdAt,
        replyTo: reply ?? undefined,
      }].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)));
      forceScrollToBottomRef.current = true;
      scrollToBottom();
      return;
    }

    socket.emit(
      "send_private_message",
      { toId: partner.persistentId, content, replyTo: reply ?? undefined },
      (res: SendMessageResponse) => {
        if (res.success && res.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.message!.id)) return prev;
            return [...prev, res.message!].sort(
              (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
            );
          });
          forceScrollToBottomRef.current = true;
          scrollToBottom();
        } else {
          notifyError(res.error);
          // Give the user their text back instead of losing it silently
          setText(prev => (prev.trim() ? prev : content));
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
        setFiles((prev) =>
          prev.some((f) => f.id === data.file.id)
            ? prev
            : [...prev, data.file].sort((a, b) => a.createdAt - b.createdAt)
        );
        forceScrollToBottomRef.current = true;
        scrollToBottom();
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
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleEmojiSelect = (emoji: string) => {
    if (inputRef.current) {
      insertAtCursor(inputRef.current, text, setText, emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (showEmojiPicker) setShowEmojiPicker(false);
    const now = Date.now();
    if (val.trim() && socket.connected && now - lastTypingEmitRef.current > 1500) {
      lastTypingEmitRef.current = now;
      socket.emit("private_typing", { toId: partner.persistentId });
    }
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
        className="chat-header"
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
            {partnerTyping ? (
              <span className="flex items-center gap-1" style={{ color: "var(--primary)", fontWeight: 600 }}>
                escribiendo
                <span className="typing-dot" style={{ animationDelay: "0s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
              </span>
            ) : (
              <span>{partner.isOnline === false ? "Desconectado" : "En línea"}</span>
            )}
          </div>
        </div>
      </div>

      {partner.isOnline === false && (
        <div
          className="animate-fadeIn"
          style={{
            padding: "8px 16px",
            background: "rgba(148, 163, 184, 0.08)",
            borderBottom: "1px solid var(--card-border)",
            color: "var(--muted)",
            fontSize: "0.75rem",
            textAlign: "center",
          }}
        >
          {partner.nickname} está desconectado. Los mensajes se entregarán cuando se conecte.
        </div>
      )}

      {/* Messages area */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
      <div
        className="chat-messages"
        style={{
          flex: 1,
          minHeight: 0,
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
        onScrollEnd={handleMessagesScrollEnd}
        onWheel={() => { userScrollingRef.current = true; }}
        onTouchMove={() => { userScrollingRef.current = true; }}
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
                  id={`msg-${msg.id}`}
                  data-message-id={msg.id}
                  className={`message-bubble animate-fadeIn ${highlightId === msg.id ? "animate-message-flash" : ""}`}
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
                      {msg.replyTo && (
                        <ReplyQuote reply={msg.replyTo} onJump={jumpToMessage} />
                      )}
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
                          justifyContent: "flex-end",
                        }}
                      >
                        {isMine ? (
                          <>
                            <ReplyButton onClick={() => startReply(msg)} />
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
                                {msg.readAt ? (
                                  <span title="Leído" style={{ color: "var(--primary)", display: "flex", alignItems: "center" }}>
                                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                      <path d="M18 6L7 17l-5-5" />
                                      <path d="M22 10l-7.5 7.5L13 16" />
                                    </svg>
                                  </span>
                                ) : (
                                  <span title="Enviado" style={{ display: "flex", alignItems: "center", opacity: 0.6 }}>
                                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                      <path d="M18 6L7 17l-5-5" />
                                    </svg>
                                  </span>
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <ReplyButton onClick={() => startReply(msg)} />
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
                            <span>{formatTime(msg.createdAt)}</span>
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
                  className="animate-fadeIn"
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                  }}
                >
                  {/* Image preview */}
                  {isImage(file.type) ? (
                    missingFileIds.has(file.id) ? (
                      <div
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--card-border)",
                          overflow: "hidden",
                          opacity: 0.55,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "8px",
                            padding: "1.25rem 1rem",
                          }}
                        >
                          <svg
                            width="28"
                            height="28"
                            fill="none"
                            stroke="var(--muted)"
                            strokeWidth="1.5"
                            viewBox="0 0 24 24"
                          >
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            Archivo expirado
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeExpiredFile(file.id)}
                            style={{ padding: "4px 10px", fontSize: "0.7rem" }}
                          >
                            Quitar del historial
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "var(--radius)",
                        overflow: "hidden",
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
                        onError={() => {
                          setMissingFileIds((prev) => new Set(prev).add(file.id));
                        }}
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
                    )
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
                        opacity: missingFileIds.has(file.id) ? 0.55 : 1,
                      }}
                    >
                      <FileIcon mimeType={file.type} fileName={file.name} size={28} />
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
                          {missingFileIds.has(file.id) ? (
                            <span style={{ color: "var(--warning)" }}>Ya no disponible</span>
                          ) : (
                            <>{formatSize(file.size)} · {file.fromName}</>
                          )}
                        </div>
                      </div>
                      {missingFileIds.has(file.id) ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeExpiredFile(file.id)}
                          style={{ padding: "6px 10px", flexShrink: 0 }}
                          title="Quitar del historial"
                        >
                          Quitar
                        </button>
                      ) : (
                        <>
                          {isPreviewableFile(file.name, file.type) && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setPreviewFile(file)}
                              style={{ padding: "6px 10px", flexShrink: 0 }}
                              title="Ver"
                            >
                              <svg
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          )}
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
                        </>
                      )}
                    </div>
                  )}
                  <div
                    className="text-muted"
                    style={{
                      fontSize: "0.65rem",
                      marginTop: "4px",
                      textAlign: "right",
                    }}
                  >
                    {formatTime(file.createdAt)}
                  </div>
                </div>
              );
            }
          })
        )}
        {partnerTyping && (
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
        <div ref={messagesEndRef} />
      </div>
      {!isAtBottom && entries.length > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          title="Volver abajo"
          className="btn btn-primary"
          style={{
            position: "absolute",
            bottom: "12px",
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
        className="flex gap-2 items-end chat-input-bar"
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--card-border)",
          background: "rgba(0,0,0,0.2)",
          position: "relative",
        }}
      >
        {replyTo && (
          <div className="reply-preview-wrap">
            <ReplyPreview reply={replyTo} onCancel={() => setReplyTo(null)} />
          </div>
        )}
        {showSuggestions && slashInfo && (
          <FormatSuggestionsDropdown
            query={slashInfo.query}
            selectedIndex={selectedIndex}
            onSelect={handleSelectOption}
            onClose={() => setShowSuggestions(false)}
          />
        )}
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
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
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setShowEmojiPicker((prev) => !prev);
            setShowSuggestions(false);
          }}
          title="Emojis"
          style={{ width: "40px", height: "40px", padding: 0, flexShrink: 0 }}
        >
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
        <textarea
          ref={inputRef}
          className="input no-scrollbar chat-input-textarea"
          style={{
            marginBottom: 0,
            flex: 1,
            minHeight: "40px",
            maxHeight: "160px",
            resize: "none",
            padding: "10px",
            lineHeight: "1.4",
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
            cursor: !text.trim() ? "default" : undefined,
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

      {previewFile && (
        <FilePreviewModal
          fileName={previewFile.name}
          url={`/api/file-content-private/${previewFile.id}`}
          downloadUrl={`/api/download-private/${previewFile.id}`}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (() => {
        const targetMessage = contextMenu.targetType === "message"
          ? messages.find((m) => m.id === contextMenu.messageId)
          : undefined;
        const targetIsMine = targetMessage ? targetMessage.fromId === currentUserId : false;
        const showDelete = contextMenu.targetType === "file" || targetIsMine;
        const menuWidth = 150;
        const menuHeight =
          contextMenu.targetType === "message"
            ? 34 * (1 + (contextMenu.hasSelection ? 1 : 0) + (targetIsMine ? 2 : 0)) + 8
            : 45;
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
            {contextMenu.targetType === "message" && contextMenu.hasSelection && (
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.selectionReply) {
                    setReplyTo(contextMenu.selectionReply);
                    setContextMenu(null);
                    inputRef.current?.focus({ preventScroll: true });
                  }
                }}
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
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
                </svg>
                Citar selección
              </button>
            )}
            {contextMenu.targetType === "message" && (
              <button
                type="button"
                onClick={() => {
                  if (targetMessage) startReply(targetMessage, false);
                }}
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
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
                Responder
              </button>
            )}
            {contextMenu.targetType === "message" && targetIsMine && (
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
            )}
            {showDelete && (
            <button
              type="button"
              onClick={() => {
                if (contextMenu.targetType === "message") deleteMsg();
                else if (contextMenu.fileId) deleteFile(contextMenu.fileId);
              }}
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
            )}
          </div>
        );
      })()}
    </div>
  );
}
