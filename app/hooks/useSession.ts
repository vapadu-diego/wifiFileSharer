"use client";

import { useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { DEFAULT_USER_SETTINGS, OnlineUser, UserSettings } from "@/lib/types";

const PERSISTENT_ID_KEY = "wifi_sharer_persistent_id";
const TOKEN_KEY = "wifi_sharer_token";
const TOKEN_COOKIE = "wfs_token";
const DISCOVERABLE_KEY = "wifi_sharer_discoverable";
const DEFAULT_RETENTION_DAYS = 7;

function readStoredDiscoverable(): boolean {
  if (typeof window === "undefined") return DEFAULT_USER_SETTINGS.discoverable;
  const stored = localStorage.getItem(DISCOVERABLE_KEY);
  return stored === null ? DEFAULT_USER_SETTINGS.discoverable : stored === "1";
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreatePersistentId(): string {
  let id = localStorage.getItem(PERSISTENT_ID_KEY);
  if (!id || id === "undefined" || id === "null" || id.length < 10) {
    id = generateUUID();
    localStorage.setItem(PERSISTENT_ID_KEY, id);
  }
  return id;
}

function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Cookie lets <img>, <a download> and fetch carry the identity on HTTP endpoints
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; SameSite=Lax; Max-Age=34560000`;
}

interface RegisterUserResponse {
  success: boolean;
  user: OnlineUser;
  onlineUsers: OnlineUser[];
  token?: string;
  unreadCounts?: Record<string, number>;
  settings?: UserSettings;
  retentionDays?: number;
  error?: string;
}

interface UpdateNicknameResponse {
  success: boolean;
  user?: OnlineUser | null;
  nickname?: string;
  error?: string;
}

interface UpdateSettingsResponse {
  success: boolean;
  settings?: UserSettings;
  error?: string;
}

export function useSession() {
  const [myNickname, setMyNickname] = useState("");
  const [myPersistentId, setMyPersistentId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return getOrCreatePersistentId();
    }
    return "";
  });
  const [mySettings, setMySettings] = useState<UserSettings>(() => ({
    discoverable: readStoredDiscoverable(),
  }));
  const [retentionDays, setRetentionDays] = useState(DEFAULT_RETENTION_DAYS);
  const myUserId = myPersistentId;

  const registerUser = useCallback(
    (
      socketInstance: Socket,
      nickname: string,
      onSuccess?: (
        onlineUsers: OnlineUser[],
        persistentId: string,
        unreadCounts: Record<string, number>
      ) => void,
      onError?: (error: string) => void
    ) => {
      const persistentId = myPersistentId || getOrCreatePersistentId();
      const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      socketInstance.emit(
        "register_user",
        { nickname, persistentId, token: token || undefined },
        (res: RegisterUserResponse) => {
          if (res.success) {
            if (res.token) storeToken(res.token);
            // The server is authoritative: it may return a different nickname
            // than the one sent (stored identity always wins).
            const canonical = res.user?.nickname || nickname;
            setMyNickname(canonical);
            setMyPersistentId(persistentId);
            localStorage.setItem("wifi_sharer_nickname", canonical);
            if (res.settings) {
              setMySettings(res.settings);
              localStorage.setItem(DISCOVERABLE_KEY, res.settings.discoverable ? "1" : "0");
            }
            if (typeof res.retentionDays === "number") setRetentionDays(res.retentionDays);
            onSuccess?.(res.onlineUsers || [], persistentId, res.unreadCounts || {});
          } else {
            onError?.(res.error || "No se pudo registrar la sesión");
          }
        }
      );
    },
    [myPersistentId]
  );

  const renameUser = useCallback(
    (
      socketInstance: Socket,
      nickname: string,
      onSuccess?: (nickname: string) => void,
      onError?: (error: string) => void
    ) => {
      socketInstance.emit(
        "update_nickname",
        { nickname },
        (res: UpdateNicknameResponse) => {
          if (res.success && res.nickname) {
            setMyNickname(res.nickname);
            localStorage.setItem("wifi_sharer_nickname", res.nickname);
            onSuccess?.(res.nickname);
          } else {
            onError?.(res.error || "No se pudo cambiar el nombre");
          }
        }
      );
    },
    []
  );

  const updateSettings = useCallback(
    (
      socketInstance: Socket,
      settings: Partial<UserSettings>,
      onSuccess?: (settings: UserSettings) => void,
      onError?: (error: string) => void
    ) => {
      socketInstance.emit(
        "update_settings",
        settings,
        (res: UpdateSettingsResponse) => {
          if (res.success && res.settings) {
            setMySettings(res.settings);
            localStorage.setItem(DISCOVERABLE_KEY, res.settings.discoverable ? "1" : "0");
            onSuccess?.(res.settings);
          } else {
            onError?.(res.error || "No se pudieron guardar los ajustes");
          }
        }
      );
    },
    []
  );

  return {
    myNickname,
    myPersistentId,
    myUserId,
    mySettings,
    setMySettings,
    retentionDays,
    registerUser,
    renameUser,
    updateSettings,
    setMyNickname,
    setMyPersistentId,
  };
}
