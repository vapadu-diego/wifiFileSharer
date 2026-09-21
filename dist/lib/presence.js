"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSocketId = exports.getPersistentId = exports.getUser = exports.renameUser = exports.getAllUsers = exports.cancelRemoveUser = exports.scheduleRemoveUser = exports.removeUser = exports.addUser = void 0;
// Maps use persistentId as key (stable across reconnections)
const onlineUsers = new Map(); // persistentId → OnlineUser
const socketToPersistent = new Map(); // socketId → persistentId
const disconnectTimers = new Map(); // persistentId → grace period timer
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
/**
 * Updates the display nickname of an online user.
 */
const renameUser = (persistentId, nickname) => {
    const user = onlineUsers.get(persistentId);
    if (!user)
        return undefined;
    user.nickname = nickname;
    return user;
};
exports.renameUser = renameUser;
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
