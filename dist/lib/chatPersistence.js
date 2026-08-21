"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversationKey = getConversationKey;
exports.getLocalMessages = getLocalMessages;
exports.saveLocalMessages = saveLocalMessages;
exports.addLocalMessage = addLocalMessage;
exports.getLocalFiles = getLocalFiles;
exports.saveLocalFiles = saveLocalFiles;
exports.addLocalFile = addLocalFile;
/**
 * Returns a unique, sorted key for conversation between two users
 */
function getConversationKey(userId1, userId2) {
    return [userId1, userId2].sort().join(":");
}
/**
 * Retrieves local message history from localStorage
 */
function getLocalMessages(myUserId, partnerUserId) {
    if (typeof window === "undefined" || !myUserId || !partnerUserId)
        return [];
    const key = `wifi_sharer_chat_messages:${getConversationKey(myUserId, partnerUserId)}`;
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    }
    catch (e) {
        console.error("Error reading local messages:", e);
        return [];
    }
}
/**
 * Saves local message history to localStorage
 */
function saveLocalMessages(myUserId, partnerUserId, messages) {
    if (typeof window === "undefined" || !myUserId || !partnerUserId)
        return;
    const key = `wifi_sharer_chat_messages:${getConversationKey(myUserId, partnerUserId)}`;
    try {
        localStorage.setItem(key, JSON.stringify(messages));
    }
    catch (e) {
        console.error("Error saving local messages:", e);
    }
}
/**
 * Adds a single message to local history and returns the updated list
 */
function addLocalMessage(myUserId, partnerUserId, message) {
    const current = getLocalMessages(myUserId, partnerUserId);
    if (current.some((m) => m.id === message.id))
        return current;
    const updated = [...current, message].sort((a, b) => a.createdAt - b.createdAt);
    saveLocalMessages(myUserId, partnerUserId, updated);
    return updated;
}
/**
 * Retrieves local file metadata history from localStorage
 */
function getLocalFiles(myUserId, partnerUserId) {
    if (typeof window === "undefined" || !myUserId || !partnerUserId)
        return [];
    const key = `wifi_sharer_chat_files:${getConversationKey(myUserId, partnerUserId)}`;
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    }
    catch (e) {
        console.error("Error reading local files:", e);
        return [];
    }
}
/**
 * Saves local file metadata history to localStorage
 */
function saveLocalFiles(myUserId, partnerUserId, files) {
    if (typeof window === "undefined" || !myUserId || !partnerUserId)
        return;
    const key = `wifi_sharer_chat_files:${getConversationKey(myUserId, partnerUserId)}`;
    try {
        localStorage.setItem(key, JSON.stringify(files));
    }
    catch (e) {
        console.error("Error saving local files:", e);
    }
}
/**
 * Adds a single file metadata to local history and returns the updated list
 */
function addLocalFile(myUserId, partnerUserId, file) {
    const current = getLocalFiles(myUserId, partnerUserId);
    if (current.some((f) => f.id === file.id))
        return current;
    const updated = [...current, file].sort((a, b) => a.createdAt - b.createdAt);
    saveLocalFiles(myUserId, partnerUserId, updated);
    return updated;
}
