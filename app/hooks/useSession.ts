"use client";

import { useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { OnlineUser } from "@/lib/types";

const PERSISTENT_ID_KEY = "wifi_sharer_persistent_id";

function getOrCreatePersistentId(): string {
  let id = localStorage.getItem(PERSISTENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PERSISTENT_ID_KEY, id);
  }
  return id;
}

interface RegisterUserResponse {
  success: boolean;
  user: OnlineUser;
  onlineUsers: OnlineUser[];
}

export function useSession() {
  const [myNickname, setMyNickname] = useState("");
  const [myPersistentId, setMyPersistentId] = useState("");

  const registerUser = useCallback(
    (
      socketInstance: Socket,
      nickname: string,
      onSuccess?: (onlineUsers: OnlineUser[], persistentId: string) => void
    ) => {
      const persistentId = getOrCreatePersistentId();
      socketInstance.emit(
        "register_user",
        { nickname, persistentId },
        (res: RegisterUserResponse) => {
          if (res.success) {
            setMyNickname(nickname);
            setMyPersistentId(persistentId);
            localStorage.setItem("wifi_sharer_nickname", nickname);
            onSuccess?.(res.onlineUsers || [], persistentId);
          }
        }
      );
    },
    []
  );

  return { myNickname, myPersistentId, registerUser, setMyNickname, setMyPersistentId };
}
