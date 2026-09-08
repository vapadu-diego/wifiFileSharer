"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePrivateFile = exports.getPrivateFileById = exports.getPrivateFiles = exports.addPrivateFile = exports.deletePrivateMessage = exports.editPrivateMessage = exports.markConversationRead = exports.getConversation = exports.addPrivateMessage = exports.getSocketId = exports.getPersistentId = exports.getUser = exports.getAllUsers = exports.cancelRemoveUser = exports.scheduleRemoveUser = exports.removeUser = exports.addUser = void 0;
// Maps use persistentId as key (stable across reconnections)
const onlineUsers = new Map(); // persistentId → OnlineUser
const socketToPersistent = new Map(); // socketId → persistentId
const disconnectTimers = new Map(); // persistentId → grace period timer
const privateConversations = new Map();
function conversationKey(a, b) {
    return [a, b].sort().join(":");
}
// --- User presence ---
const addUser = (socketId, persistentId, nickname, os, browser) => {
    const existing = onlineUsers.get(persistentId);
    // If user already exists (reconnection), clean up old socket mapping
    if (existing) {
        socketToPersistent.delete(existing.id);
    }
    const user = {
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
exports.addUser = addUser;
const removeUser = (socketId) => {
    const persistentId = socketToPersistent.get(socketId);
    if (!persistentId)
        return undefined;
    const user = onlineUsers.get(persistentId);
    onlineUsers.delete(persistentId);
    socketToPersistent.delete(socketId);
    return user;
};
exports.removeUser = removeUser;
/**
 * Schedule user removal after a grace period (15s).
 * If the user reconnects before the timer fires, call cancelRemoveUser to cancel.
 */
const scheduleRemoveUser = (socketId, onRemoved) => {
    const persistentId = socketToPersistent.get(socketId);
    if (!persistentId)
        return;
    // Clean up old socket mapping
    socketToPersistent.delete(socketId);
    // If already scheduled, don't create another timer
    if (disconnectTimers.has(persistentId))
        return;
    const timer = setTimeout(() => {
        disconnectTimers.delete(persistentId);
        const user = onlineUsers.get(persistentId);
        if (user) {
            onlineUsers.delete(persistentId);
            onRemoved(user);
        }
    }, 15000); // 15 seconds grace period
    disconnectTimers.set(persistentId, timer);
};
exports.scheduleRemoveUser = scheduleRemoveUser;
/**
 * Cancel a scheduled removal (user reconnected within grace period).
 * Returns true if a timer was cancelled (i.e. this is a reconnection).
 */
const cancelRemoveUser = (persistentId) => {
    const timer = disconnectTimers.get(persistentId);
    if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(persistentId);
        return true;
    }
    return false;
};
exports.cancelRemoveUser = cancelRemoveUser;
const getAllUsers = () => {
    return Array.from(onlineUsers.values());
};
exports.getAllUsers = getAllUsers;
const getUser = (persistentId) => {
    return onlineUsers.get(persistentId);
};
exports.getUser = getUser;
const getPersistentId = (socketId) => {
    return socketToPersistent.get(socketId);
};
exports.getPersistentId = getPersistentId;
const getSocketId = (persistentId) => {
    return onlineUsers.get(persistentId)?.id;
};
exports.getSocketId = getSocketId;
// --- Private messages ---
const addPrivateMessage = (fromId, toId, fromName, content) => {
    const msg = {
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
    privateConversations.get(key).push(msg);
    return msg;
};
exports.addPrivateMessage = addPrivateMessage;
const getConversation = (userId1, userId2) => {
    const key = conversationKey(userId1, userId2);
    return privateConversations.get(key) || [];
};
exports.getConversation = getConversation;
/**
 * Marks all messages received by `readerId` (from `otherId`) as read.
 * Returns the ids of messages that changed.
 */
const markConversationRead = (readerId, otherId, readAt = Date.now()) => {
    const key = conversationKey(readerId, otherId);
    const messages = privateConversations.get(key);
    if (!messages)
        return [];
    const changedIds = [];
    for (const msg of messages) {
        if (msg.toId === readerId && !msg.readAt) {
            msg.readAt = readAt;
            changedIds.push(msg.id);
        }
    }
    return changedIds;
};
exports.markConversationRead = markConversationRead;
const editPrivateMessage = (fromId, toId, messageId, newContent) => {
    const key = conversationKey(fromId, toId);
    const messages = privateConversations.get(key);
    if (!messages)
        return undefined;
    const msg = messages.find((m) => m.id === messageId);
    if (msg) {
        msg.content = newContent;
        msg.updatedAt = Date.now();
    }
    return msg;
};
exports.editPrivateMessage = editPrivateMessage;
const deletePrivateMessage = (fromId, toId, messageId) => {
    const key = conversationKey(fromId, toId);
    const messages = privateConversations.get(key);
    if (!messages)
        return false;
    const initialLength = messages.length;
    const filtered = messages.filter((m) => m.id !== messageId);
    privateConversations.set(key, filtered);
    return filtered.length < initialLength;
};
exports.deletePrivateMessage = deletePrivateMessage;
// --- Private files ---
const privateFiles = new Map();
const addPrivateFile = (file) => {
    const key = conversationKey(file.fromId, file.toId);
    if (!privateFiles.has(key)) {
        privateFiles.set(key, []);
    }
    privateFiles.get(key).push(file);
};
exports.addPrivateFile = addPrivateFile;
const getPrivateFiles = (userId1, userId2) => {
    const key = conversationKey(userId1, userId2);
    return privateFiles.get(key) || [];
};
exports.getPrivateFiles = getPrivateFiles;
const getPrivateFileById = (fileId) => {
    for (const files of privateFiles.values()) {
        const found = files.find((f) => f.id === fileId);
        if (found)
            return found;
    }
    return undefined;
};
exports.getPrivateFileById = getPrivateFileById;
const deletePrivateFile = (fromId, toId, fileId) => {
    const key = conversationKey(fromId, toId);
    const files = privateFiles.get(key);
    if (!files)
        return undefined;
    const index = files.findIndex((f) => f.id === fileId);
    if (index === -1)
        return undefined;
    const [removed] = files.splice(index, 1);
    return removed;
};
exports.deletePrivateFile = deletePrivateFile;
