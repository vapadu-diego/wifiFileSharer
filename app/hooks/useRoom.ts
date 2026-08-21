"use client";

import { useState, useEffect, useCallback } from "react";
import { Socket } from "socket.io-client";
import { Room } from "@/lib/types";

interface JoinRoomResponse {
  success: boolean;
  room?: Room | null;
  roomId?: string;
  error?: string;
}

export function useRoom(
  socket: Socket | null,
  showModal: (title: string, message: string, type: "info" | "warning" | "error") => void
) {
  const [room, setRoom] = useState<Room | null>(null);
  const [isGhost, setIsGhost] = useState(false);
  const [currentView, setCurrentView] = useState<"name" | "contacts" | "room">("name");
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdated = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setCurrentView("room");
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

    socket.on("room_updated", handleRoomUpdated);
    socket.on("room_closed", handleRoomClosed);
    socket.on("you_were_kicked", handleKicked);
    socket.on("you_were_banned", handleBanned);

    return () => {
      socket.off("room_updated", handleRoomUpdated);
      socket.off("room_closed", handleRoomClosed);
      socket.off("you_were_kicked", handleKicked);
      socket.off("you_were_banned", handleBanned);
    };
  }, [socket, showModal]);

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

  const handleRoomJoined = useCallback((roomId: string, password?: string) => {
    addRecentToStorage(roomId, password);
    setShowAdminPanel(false);
  }, []);

  const handleRoomExited = useCallback(() => {
    setRoom(null);
    setCurrentView("contacts");
    setIsGhost(false);
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
