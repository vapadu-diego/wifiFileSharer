import { PrivateMessage, PrivateFile } from "./types";

/**
 * Returns a unique, sorted key for conversation between two users
 */
export function getConversationKey(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join(":");
}

/**
 * Retrieves local message history from localStorage
 */
export function getLocalMessages(myUserId: string, partnerUserId: string): PrivateMessage[] {
  if (typeof window === "undefined" || !myUserId || !partnerUserId) return [];
  const key = `wifi_sharer_chat_messages:${getConversationKey(myUserId, partnerUserId)}`;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Error reading local messages:", e);
    return [];
  }
}

/**
 * Saves local message history to localStorage
 */
export function saveLocalMessages(myUserId: string, partnerUserId: string, messages: PrivateMessage[]): void {
  if (typeof window === "undefined" || !myUserId || !partnerUserId) return;
  const key = `wifi_sharer_chat_messages:${getConversationKey(myUserId, partnerUserId)}`;
  try {
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (e) {
    console.error("Error saving local messages:", e);
  }
}

/**
 * Adds a single message to local history and returns the updated list
 */
export function addLocalMessage(myUserId: string, partnerUserId: string, message: PrivateMessage): PrivateMessage[] {
  const current = getLocalMessages(myUserId, partnerUserId);
  if (current.some((m) => m.id === message.id)) return current;
  const updated = [...current, message].sort((a, b) => a.createdAt - b.createdAt);
  saveLocalMessages(myUserId, partnerUserId, updated);
  return updated;
}

/**
 * Retrieves local file metadata history from localStorage
 */
export function getLocalFiles(myUserId: string, partnerUserId: string): PrivateFile[] {
  if (typeof window === "undefined" || !myUserId || !partnerUserId) return [];
  const key = `wifi_sharer_chat_files:${getConversationKey(myUserId, partnerUserId)}`;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Error reading local files:", e);
    return [];
  }
}

/**
 * Saves local file metadata history to localStorage
 */
export function saveLocalFiles(myUserId: string, partnerUserId: string, files: PrivateFile[]): void {
  if (typeof window === "undefined" || !myUserId || !partnerUserId) return;
  const key = `wifi_sharer_chat_files:${getConversationKey(myUserId, partnerUserId)}`;
  try {
    localStorage.setItem(key, JSON.stringify(files));
  } catch (e) {
    console.error("Error saving local files:", e);
  }
}

/**
 * Adds a single file metadata to local history and returns the updated list
 */
export function addLocalFile(myUserId: string, partnerUserId: string, file: PrivateFile): PrivateFile[] {
  const current = getLocalFiles(myUserId, partnerUserId);
  if (current.some((f) => f.id === file.id)) return current;
  const updated = [...current, file].sort((a, b) => a.createdAt - b.createdAt);
  saveLocalFiles(myUserId, partnerUserId, updated);
  return updated;
}
