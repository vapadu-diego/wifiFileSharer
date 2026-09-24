"use client";

import { useState, useEffect, useCallback } from "react";
import { Socket } from "socket.io-client";
import { Room, SharedText, SharedFile } from "@/lib/types";
import { showBrowserNotification } from "@/lib/notifications";

interface JoinRoomResponse {
  success: boolean;
  room?: Room | null;
  roomId?: string;
  error?: string;
}

interface RoomTextsPageResponse {
  texts: SharedText[];
  hasMore: boolean;
}

const ROOM_PAGE_SIZE = 50;

export function useRoom(
  socket: Socket | null,
  showModal: (title: string, message: string, type: "info" | "warning" | "error") => void,
  onNewMessage?: (info?: { sender?: string; body?: string }) => void
) {
  const [room, setRoom] = useState<Room | null>(null);
  const [isGhost, setIsGhost] = useState(false);
  const [currentView, setCurrentView] = useState<"name" | "contacts" | "room">("name");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [hasMoreTexts, setHasMoreTexts] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Full snapshot on join/create/reconnect: replaces the room state
    const handleRoomSnapshot = (snapshot: Room) => {
      setRoom(snapshot);
      setHasMoreTexts(snapshot.textsHasMore === true);
    };

    // Membership/metadata delta: keeps the already loaded messages
    const handleRoomUpdated = (meta: Room) => {
      setRoom((prev) => {
        if (!prev || prev.id !== meta.id) return meta;
        return { ...prev, ...meta, texts: prev.texts };
      });
    };

    const handleNewText = (text: SharedText) => {
      // The socket only receives `new_text` for rooms it belongs to, so the
      // open room is the right target.
      setRoom((prev) => {
        if (!prev) return prev;
        if (prev.texts.some((t) => t.id === text.id)) return prev;
        return { ...prev, texts: [...prev.texts, text] };
      });
    };

    const handleTextDeleted = ({ roomId, textId }: { roomId: string; textId: string }) => {
      setRoom((prev) => {
        if (!prev || prev.id !== roomId) return prev;
        return { ...prev, texts: prev.texts.filter((t) => t.id !== textId) };
      });
    };

    const handleRoomReadUpdated = ({
      roomId,
      userId,
      messageIds,
    }: {
      roomId: string;
      userId: string;
      messageIds: string[];
    }) => {
      setRoom((prev) => {
        if (!prev || prev.id !== roomId || !messageIds?.length) return prev;
        const ids = new Set(messageIds);
        return {
          ...prev,
          texts: prev.texts.map((t) => {
            if (!ids.has(t.id)) return t;
            const readBy = t.readBy ? [...t.readBy] : [];
            if (!readBy.includes(userId)) readBy.push(userId);
            return { ...t, readBy };
          }),
        };
      });
    };

    const handleRoomClosed = () => {
      const currentRoomId = localStorage.getItem("wifi_sharer_room_id");
      if (currentRoomId) {
        removeRecentFromStorage(currentRoomId);
      }
      setRoom(null);
      setCurrentView("contacts");
      setIsGhost(false);
      localStorage.removeItem("wifi_sharer_room_id");
      localStorage.removeItem("wifi_sharer_room_password");
      showModal("Sala Cerrada", "La sala ha sido cerrada y todos los archivos han sido eliminados.", "warning");
    };

    const handleKicked = () => {
      setRoom(null);
      setCurrentView("contacts");
      localStorage.removeItem("wifi_sharer_room_id");
      localStorage.removeItem("wifi_sharer_room_password");
      showModal("Fuiste Expulsado", "El anfitrión te ha expulsado de la sala.", "warning");
    };

    const handleBanned = () => {
      setRoom(null);
      setCurrentView("contacts");
      localStorage.removeItem("wifi_sharer_room_id");
      localStorage.removeItem("wifi_sharer_room_password");
      showModal("Has sido Bloqueado", "Has sido bloqueado de esta sala y no podrás volver a entrar.", "error");
    };

    // The server took the identity to another session: drop room membership locally
    const handleIdentityReplaced = () => {
      setRoom(null);
      setCurrentView("contacts");
      setIsGhost(false);
      localStorage.removeItem("wifi_sharer_room_id");
      localStorage.removeItem("wifi_sharer_room_password");
    };

    // Notifications for room messages (in-room toasts live in RoomView so they
    // can react to the active tab)
    const handleNewTextNotification = (text: SharedText) => {
      if (text.senderId !== socket.id) {
        showBrowserNotification(
          `💬 ${text.senderName} (Sala)`,
          text.content.length > 100 ? text.content.slice(0, 100) + "…" : text.content
        );
        onNewMessage?.({ sender: `${text.senderName} (Sala)`, body: text.content });
      }
    };

    // Notifications for room file uploads
    const handleFileUploaded = (file: SharedFile) => {
      if (file.senderId !== socket.id) {
        showBrowserNotification(
          `📎 ${file.senderName} (Sala)`,
          `Subió un archivo: ${file.name}`
        );
        onNewMessage?.({ sender: `${file.senderName} (Sala)`, body: `📎 ${file.name}` });
      }
    };

    socket.on("room_snapshot", handleRoomSnapshot);
    socket.on("room_updated", handleRoomUpdated);
    socket.on("new_text", handleNewText);
    socket.on("new_text", handleNewTextNotification);
    socket.on("text_deleted", handleTextDeleted);
    socket.on("room_read_updated", handleRoomReadUpdated);
    socket.on("room_closed", handleRoomClosed);
    socket.on("you_were_kicked", handleKicked);
    socket.on("you_were_banned", handleBanned);
    socket.on("identity_replaced", handleIdentityReplaced);
    socket.on("file_uploaded", handleFileUploaded);

    return () => {
      socket.off("room_snapshot", handleRoomSnapshot);
      socket.off("room_updated", handleRoomUpdated);
      socket.off("new_text", handleNewText);
      socket.off("new_text", handleNewTextNotification);
      socket.off("text_deleted", handleTextDeleted);
      socket.off("room_read_updated", handleRoomReadUpdated);
      socket.off("room_closed", handleRoomClosed);
      socket.off("you_were_kicked", handleKicked);
      socket.off("you_were_banned", handleBanned);
      socket.off("identity_replaced", handleIdentityReplaced);
      socket.off("file_uploaded", handleFileUploaded);
    };
  }, [socket, showModal, onNewMessage]);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      const savedRoomId = localStorage.getItem("wifi_sharer_room_id");
      const savedPassword = localStorage.getItem("wifi_sharer_room_password");
      const savedNickname = localStorage.getItem("wifi_sharer_nickname");
      if (savedRoomId && savedNickname) {
        socket.emit(
          "reconnect_to_room",
          { roomId: savedRoomId, nickname: savedNickname, password: savedPassword || "" },
          (response: JoinRoomResponse) => {
            if (response.success && response.room) {
              setRoom(response.room);
              setHasMoreTexts(response.room.textsHasMore === true);
              setCurrentView("room");
            } else {
              localStorage.removeItem("wifi_sharer_room_id");
              localStorage.removeItem("wifi_sharer_room_password");
              if (response.error && response.error !== "Sala no encontrada") {
                showModal("Error de Reconexión", response.error, "warning");
              }
            }
          }
        );
      }
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [socket, showModal]);

  /**
   * Loads a page of older messages and prepends it to the current window.
   */
  const loadOlderTexts = useCallback((): Promise<void> => {
    if (!socket || !room || !hasMoreTexts) return Promise.resolve();
    const first = room.texts[0];
    if (!first) return Promise.resolve();

    return new Promise((resolve) => {
      socket.emit(
        "get_room_texts_page",
        {
          roomId: room.id,
          before: { createdAt: first.createdAt, id: first.id },
          limit: ROOM_PAGE_SIZE,
        },
        (res: RoomTextsPageResponse) => {
          setRoom((prev) => {
            if (!prev) return prev;
            const existing = new Set(prev.texts.map((t) => t.id));
            const older = (res.texts || []).filter((t) => !existing.has(t.id));
            return older.length > 0 ? { ...prev, texts: [...older, ...prev.texts] } : prev;
          });
          setHasMoreTexts(res.hasMore === true);
          resolve();
        }
      );
    });
  }, [socket, room, hasMoreTexts]);

  /**
   * Loads the context page around a room message and merges it into the
   * loaded window (used to jump to a search result outside the snapshot).
   */
  const jumpToText = useCallback(
    (messageId: string): Promise<boolean> => {
      if (!socket || !room) return Promise.resolve(false);
      return new Promise((resolve) => {
        socket.emit(
          "get_room_text_context",
          { roomId: room.id, messageId, limit: 25 },
          (res: RoomTextsPageResponse) => {
            const texts = res?.texts || [];
            if (texts.length === 0) {
              resolve(false);
              return;
            }
            setRoom((prev) => {
              if (!prev) return prev;
              const byId = new Map(prev.texts.map((t) => [t.id, t]));
              for (const text of texts) {
                if (!byId.has(text.id)) byId.set(text.id, text);
              }
              return {
                ...prev,
                texts: Array.from(byId.values()).sort(
                  (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
                ),
              };
            });
            resolve(true);
          }
        );
      });
    },
    [socket, room]
  );

  const handleRoomJoined = useCallback((roomId: string, password?: string) => {
    addRecentToStorage(roomId, password);
    setShowAdminPanel(false);
  }, []);

  const handleRoomExited = useCallback(() => {
    setRoom(null);
    setCurrentView("contacts");
    setIsGhost(false);
    setHasMoreTexts(false);
    localStorage.removeItem("wifi_sharer_room_id");
    localStorage.removeItem("wifi_sharer_room_password");
  }, []);

  const handleAdminJoinRoom = useCallback(
    (roomId: string, ghost: boolean) => {
      if (!socket) return;
      if (ghost) {
        socket.emit("join_room_ghost", { roomId }, (res: JoinRoomResponse) => {
          if (res.success) {
            setRoom(res.room ?? null);
            setHasMoreTexts(res.room?.textsHasMore === true);
            setCurrentView("room");
            setIsGhost(true);
            setShowAdminPanel(false);
          } else {
            showModal("Error", res.error || "No se pudo entrar en modo fantasma.", "error");
          }
        });
      } else {
        const nickname = prompt("Ingresa tu apodo para esta sala:") || "Admin";
        socket.emit("join_room", { roomId, nickname, password: "" }, (res: JoinRoomResponse) => {
          if (res.success) {
            setRoom(res.room ?? null);
            setHasMoreTexts(res.room?.textsHasMore === true);
            setCurrentView("room");
            setIsGhost(false);
            setShowAdminPanel(false);
            addRecentToStorage(roomId);
          } else {
            showModal("Error", res.error || "Error al entrar a la sala.", "error");
          }
        });
      }
    },
    [socket, showModal]
  );

  return {
    room,
    setRoom,
    isGhost,
    setIsGhost,
    currentView,
    setCurrentView,
    showAdminPanel,
    setShowAdminPanel,
    handleRoomJoined,
    handleRoomExited,
    handleAdminJoinRoom,
    hasMoreTexts,
    loadOlderTexts,
    jumpToText,
  };
}

interface StoredRecentRoom {
  id: string;
  password?: string;
  joinedAt?: number;
}

function removeRecentFromStorage(roomId: string) {
  try {
    const stored = localStorage.getItem("wifi_sharer_recent_rooms");
    if (!stored) return;
    const recent: StoredRecentRoom[] = JSON.parse(stored).filter((r: StoredRecentRoom) => r.id !== roomId);
    localStorage.setItem("wifi_sharer_recent_rooms", JSON.stringify(recent));
  } catch { /* empty */ }
}

function addRecentToStorage(roomId: string, password?: string) {
  try {
    const stored = localStorage.getItem("wifi_sharer_recent_rooms");
    const recent: StoredRecentRoom[] = stored
      ? JSON.parse(stored).filter((r: StoredRecentRoom) => r.id !== roomId)
      : [];
    recent.unshift({ id: roomId, password, joinedAt: Date.now() });
    if (recent.length > 10) recent.pop();
    localStorage.setItem("wifi_sharer_recent_rooms", JSON.stringify(recent));
  } catch { /* empty */ }
}
