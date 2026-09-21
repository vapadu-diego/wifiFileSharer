import { PrivateMessage } from "./types";

/**
 * Read-only helpers for the legacy localStorage chat history. Since the server
 * (SQLite) is now the source of truth, this module only exists to migrate old
 * local messages once.
 */

export function getLegacyConversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function getLegacyMessages(myUserId: string, partnerUserId: string): PrivateMessage[] {
  if (typeof window === "undefined" || !myUserId || !partnerUserId) return [];
  const key = `wifi_sharer_chat_messages:${getLegacyConversationKey(myUserId, partnerUserId)}`;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLegacyMessages(myUserId: string, partnerUserId: string): void {
  if (typeof window === "undefined" || !myUserId || !partnerUserId) return;
  const key = `wifi_sharer_chat_messages:${getLegacyConversationKey(myUserId, partnerUserId)}`;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore quota/access errors
  }
}
