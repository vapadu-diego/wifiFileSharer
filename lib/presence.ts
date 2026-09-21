import { OnlineUser } from "./types";

// Maps use persistentId as key (stable across reconnections)
const onlineUsers = new Map<string, OnlineUser>();          // persistentId → OnlineUser
const socketToPersistent = new Map<string, string>();       // socketId → persistentId
const disconnectTimers = new Map<string, NodeJS.Timeout>(); // persistentId → grace period timer

// --- User presence ---

export const addUser = (socketId: string, persistentId: string, nickname: string, os: string, browser: string): OnlineUser => {
  const existing = onlineUsers.get(persistentId);

  // If user already exists (reconnection), clean up old socket mapping
  if (existing) {
    socketToPersistent.delete(existing.id);
  }

  const user: OnlineUser = {
    id: socketId,
    persistentId,
    nickname,
    os,
    browser,
    joinedAt: existing?.joinedAt ?? Date.now(),
    isOnline: true,
  };

  onlineUsers.set(persistentId, user);
  socketToPersistent.set(socketId, persistentId);
  return user;
};

export const removeUser = (socketId: string): OnlineUser | undefined => {
  const persistentId = socketToPersistent.get(socketId);
  if (!persistentId) return undefined;

  const user = onlineUsers.get(persistentId);
  onlineUsers.delete(persistentId);
  socketToPersistent.delete(socketId);
  return user;
};

/**
 * Schedule user removal after a grace period (15s).
 * If the user reconnects before the timer fires, call cancelRemoveUser to cancel.
 */
export const scheduleRemoveUser = (socketId: string, onRemoved: (user: OnlineUser) => void): void => {
  const persistentId = socketToPersistent.get(socketId);
  if (!persistentId) return;

  // Clean up old socket mapping
  socketToPersistent.delete(socketId);

  // If already scheduled, don't create another timer
  if (disconnectTimers.has(persistentId)) return;

  const timer = setTimeout(() => {
    disconnectTimers.delete(persistentId);
    const user = onlineUsers.get(persistentId);
    if (user) {
      onlineUsers.delete(persistentId);
      onRemoved(user);
    }
  }, 15_000); // 15 seconds grace period

  disconnectTimers.set(persistentId, timer);
};

/**
 * Cancel a scheduled removal (user reconnected within grace period).
 * Returns true if a timer was cancelled (i.e. this is a reconnection).
 */
export const cancelRemoveUser = (persistentId: string): boolean => {
  const timer = disconnectTimers.get(persistentId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(persistentId);
    return true;
  }
  return false;
};

export const getAllUsers = (): OnlineUser[] => {
  return Array.from(onlineUsers.values());
};

/**
 * Updates the display nickname of an online user.
 */
export const renameUser = (persistentId: string, nickname: string): OnlineUser | undefined => {
  const user = onlineUsers.get(persistentId);
  if (!user) return undefined;
  user.nickname = nickname;
  return user;
};

export const getUser = (persistentId: string): OnlineUser | undefined => {
  return onlineUsers.get(persistentId);
};

export const getPersistentId = (socketId: string): string | undefined => {
  return socketToPersistent.get(socketId);
};

export const getSocketId = (persistentId: string): string | undefined => {
  return onlineUsers.get(persistentId)?.id;
};
