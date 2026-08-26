import { OnlineUser, PrivateMessage, PrivateFile } from "./types";

// Maps use persistentId as key (stable across reconnections)
const onlineUsers = new Map<string, OnlineUser>();          // persistentId → OnlineUser
const socketToPersistent = new Map<string, string>();       // socketId → persistentId
const disconnectTimers = new Map<string, NodeJS.Timeout>(); // persistentId → grace period timer
const privateConversations = new Map<string, PrivateMessage[]>();

function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

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

export const getUser = (persistentId: string): OnlineUser | undefined => {
  return onlineUsers.get(persistentId);
};

export const getPersistentId = (socketId: string): string | undefined => {
  return socketToPersistent.get(socketId);
};

export const getSocketId = (persistentId: string): string | undefined => {
  return onlineUsers.get(persistentId)?.id;
};

// --- Private messages ---

export const addPrivateMessage = (
  fromId: string,
  toId: string,
  fromName: string,
  content: string
): PrivateMessage => {
  const msg: PrivateMessage = {
    id: Math.random().toString(36).substr(2, 9),
    fromId,
    toId,
    fromName,
    content,
    createdAt: Date.now(),
  };
  const key = conversationKey(fromId, toId);
  if (!privateConversations.has(key)) {
    privateConversations.set(key, []);
  }
  privateConversations.get(key)!.push(msg);
  return msg;
};

export const getConversation = (userId1: string, userId2: string): PrivateMessage[] => {
  const key = conversationKey(userId1, userId2);
  return privateConversations.get(key) || [];
};

export const editPrivateMessage = (
  fromId: string,
  toId: string,
  messageId: string,
  newContent: string
): PrivateMessage | undefined => {
  const key = conversationKey(fromId, toId);
  const messages = privateConversations.get(key);
  if (!messages) return undefined;

  const msg = messages.find((m) => m.id === messageId);
  if (msg) {
    msg.content = newContent;
    msg.updatedAt = Date.now();
  }
  return msg;
};

export const deletePrivateMessage = (
  fromId: string,
  toId: string,
  messageId: string
): boolean => {
  const key = conversationKey(fromId, toId);
  const messages = privateConversations.get(key);
  if (!messages) return false;

  const initialLength = messages.length;
  const filtered = messages.filter((m) => m.id !== messageId);
  privateConversations.set(key, filtered);
  return filtered.length < initialLength;
};

// --- Private files ---

const privateFiles = new Map<string, PrivateFile[]>();

export const addPrivateFile = (file: PrivateFile): void => {
  const key = conversationKey(file.fromId, file.toId);
  if (!privateFiles.has(key)) {
    privateFiles.set(key, []);
  }
  privateFiles.get(key)!.push(file);
};

export const getPrivateFiles = (userId1: string, userId2: string): PrivateFile[] => {
  const key = conversationKey(userId1, userId2);
  return privateFiles.get(key) || [];
};

export const getPrivateFileById = (fileId: string): PrivateFile | undefined => {
  for (const files of privateFiles.values()) {
    const found = files.find((f) => f.id === fileId);
    if (found) return found;
  }
  return undefined;
};

export const deletePrivateFile = (
  fromId: string,
  toId: string,
  fileId: string
): PrivateFile | undefined => {
  const key = conversationKey(fromId, toId);
  const files = privateFiles.get(key);
  if (!files) return undefined;

  const index = files.findIndex((f) => f.id === fileId);
  if (index === -1) return undefined;

  const [removed] = files.splice(index, 1);
  return removed;
};
