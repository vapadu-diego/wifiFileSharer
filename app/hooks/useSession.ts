"use client";

import { useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { OnlineUser } from "@/lib/types";

interface RegisterUserResponse {
  success: boolean;
  user: OnlineUser;
  onlineUsers: OnlineUser[];
}

export function useSession() {
  const [myNickname, setMyNickname] = useState("");
  const [mySocketId, setMySocketId] = useState("");
  const [myUserId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("wifi_sharer_user_id");
      if (!id) {
        id = Math.random().toString(36).substring(2, 11);
        localStorage.setItem("wifi_sharer_user_id", id);
      }
      return id;
    }
    return "";
  });

  const registerUser = useCallback(
    (
      socketInstance: Socket,
      nickname: string,
      onSuccess?: (onlineUsers: OnlineUser[], socketId: string) => void
    ) => {
      socketInstance.emit(
        "register_user",
        { nickname, userId: myUserId },
        (res: RegisterUserResponse) => {
          if (res.success) {
            setMyNickname(nickname);
            setMySocketId(socketInstance.id || "");
            localStorage.setItem("wifi_sharer_nickname", nickname);
            onSuccess?.(res.onlineUsers || [], socketInstance.id || "");
          }
        }
      );
    },
    [myUserId]
  );

  return { myNickname, mySocketId, myUserId, registerUser, setMyNickname, setMySocketId };
}
