import { OnlineUser, PrivateMessage, PrivateFile } from "./types";

const onlineUsers = new Map<string, OnlineUser>();
const privateConversations = new Map<string, PrivateMessage[]>();

function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export const addUser = (id: string, nickname: string, os: string, browser: string): OnlineUser => {
  const user: OnlineUser = { id, nickname, os, browser, joinedAt: Date.now() };
  onlineUsers.set(id, user);
  return user;
};

export const removeUser = (id: string): OnlineUser | undefined => {
  const user = onlineUsers.get(id);
  onlineUsers.delete(id);
  return user;
};

export const getAllUsers = (): OnlineUser[] => {
  return Array.from(onlineUsers.values());
};

export const getUser = (id: string): OnlineUser | undefined => {
  return onlineUsers.get(id);
};

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

// Private files
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
