"use client";

import { useState, useCallback, useEffect } from "react";
import { Socket } from "socket.io-client";
import { Room } from "@/lib/types";

export interface RecentRoom {
  id: string;
  password?: string;
  joinedAt: number;
}

interface JoinRoomResponse {
  success: boolean;
  room?: Room;
  error?: string;
}

const RECENT_ROOMS_KEY = "wifi_sharer_recent_rooms";
const MAX_RECENT_ROOMS = 10;

function getRecentRooms(): RecentRoom[] {
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentRoom(roomId: string, password?: string) {
  const recent = getRecentRooms().filter((r) => r.id !== roomId);
  recent.unshift({ id: roomId, password, joinedAt: Date.now() });
  if (recent.length > MAX_RECENT_ROOMS) recent.pop();
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(recent));
}

function removeRecentRoom(roomId: string) {
  const recent = getRecentRooms().filter((r) => r.id !== roomId);
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(recent));
}

export function useRecentRooms(
  socket: Socket | null,
  showModal: (title: string, message: string, type: "info" | "warning" | "error") => void
) {
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>(() => getRecentRooms());
  const [activeRecentRooms, setActiveRecentRooms] = useState<string[]>([]);

  const checkActiveRecentRooms = useCallback((socketInstance: Socket) => {
    const recent = getRecentRooms();
    if (recent.length === 0) {
      setActiveRecentRooms([]);
      return;
    }
    socketInstance.emit(
      "check_rooms_exist",
      { roomIds: recent.map((r) => r.id) },
      (response: { activeRooms: string[] }) => {
        if (response && response.activeRooms) {
          setActiveRecentRooms(response.activeRooms);
          const stillActive = recent.filter((r) => response.activeRooms.includes(r.id));
          if (stillActive.length !== recent.length) {
            localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(stillActive));
            setRecentRooms(stillActive);
          }
        }
      }
    );
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => {
      checkActiveRecentRooms(socket);
    };

    if (socket.connected) {
      checkActiveRecentRooms(socket);
    }

    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [socket, checkActiveRecentRooms]);

  const handleJoinRecentRoom = useCallback(
    (recentRoom: RecentRoom, onSuccess?: (room: Room) => void) => {
      if (!socket) return;
      const savedNickname = localStorage.getItem("wifi_sharer_nickname");
      if (!savedNickname) {
        showModal("Apodo Requerido", "Por favor, ingresa un apodo primero.", "warning");
        return;
      }
      socket.emit(
        "join_room",
        {
          roomId: recentRoom.id,
          nickname: savedNickname,
          password: recentRoom.password || "",
        },
        (res: JoinRoomResponse) => {
          if (res.success) {
            localStorage.setItem("wifi_sharer_room_id", recentRoom.id);
            localStorage.setItem("wifi_sharer_room_password", recentRoom.password || "");
            addRecentRoom(recentRoom.id, recentRoom.password);
            setRecentRooms(getRecentRooms());
            if (res.room) onSuccess?.(res.room);
          } else {
            if (res.error === "Sala no encontrada") {
              removeRecentRoom(recentRoom.id);
              setRecentRooms(getRecentRooms());
            }
            showModal("Error", res.error || "Error al unirse a la sala.", "error");
          }
        }
      );
    },
    [socket, showModal]
  );

  const displayRecentRooms = recentRooms.filter((r) => activeRecentRooms.includes(r.id));

  return {
    recentRooms,
    activeRecentRooms,
    displayRecentRooms,
    setRecentRooms,
    checkActiveRecentRooms,
    handleJoinRecentRoom,
  };
}
