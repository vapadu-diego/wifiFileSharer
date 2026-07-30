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

  const registerUser = useCallback(
    (
      socketInstance: Socket,
      nickname: string,
      onSuccess?: (onlineUsers: OnlineUser[], socketId: string) => void
    ) => {
      socketInstance.emit(
        "register_user",
        { nickname },
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
    []
  );

  return { myNickname, mySocketId, registerUser, setMyNickname, setMySocketId };
}
