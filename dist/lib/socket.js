"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocket = void 0;
const fs_1 = __importDefault(require("fs"));
const rooms_1 = require("./rooms");
const presence_1 = require("./presence");
function parseUserAgent(ua) {
    let os = "Unknown";
    let browser = "Unknown";
    if (ua.includes("Windows"))
        os = "Windows";
    else if (ua.includes("Mac OS"))
        os = "macOS";
    else if (ua.includes("Linux"))
        os = "Linux";
    else if (ua.includes("Android"))
        os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad"))
        os = "iOS";
    if (ua.includes("Firefox"))
        browser = "Firefox";
    else if (ua.includes("Edg/"))
        browser = "Edge";
    else if (ua.includes("Chrome"))
        browser = "Chrome";
    else if (ua.includes("Safari"))
        browser = "Safari";
    else if (ua.includes("Opera") || ua.includes("OPR"))
        browser = "Opera";
    return { os, browser };
}
// Check if connection is from localhost (server admin)
function isLocalhost(ip) {
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
const setupSocket = (io) => {
    const lastTypingTs = new Map();
    io.on("connection", (socket) => {
        const clientIp = socket.handshake.address || "Unknown";
        const userAgent = socket.handshake.headers["user-agent"] || "";
        const { os, browser } = parseUserAgent(userAgent);
        const isAdmin = isLocalhost(clientIp);
        // Tell client if they are admin
        socket.emit("admin_status", { isAdmin });
        socket.on("register_user", ({ nickname, persistentId }, callback) => {
            const wasReconnect = (0, presence_1.cancelRemoveUser)(persistentId);
            const user = (0, presence_1.addUser)(socket.id, persistentId, nickname, os, browser);
            const onlineUsers = (0, presence_1.getAllUsers)();
            if (wasReconnect) {
                // Reconnection within grace period — notify others to update socketId
                socket.broadcast.emit("user_reconnected", user);
            }
            else {
                // New user
                socket.broadcast.emit("user_online", user);
            }
            callback({ success: true, user, onlineUsers });
        });
        // Get all online users
        socket.on("get_online_users", (callback) => {
            callback({ onlineUsers: (0, presence_1.getAllUsers)() });
        });
        // Send a private message to another user
        socket.on("send_private_message", ({ toId, content }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ success: false, error: "Usuario no registrado" });
                return;
            }
            const fromUser = (0, presence_1.getAllUsers)().find((u) => u.persistentId === myPersistentId);
            if (!fromUser) {
                callback({ success: false, error: "Usuario no registrado" });
                return;
            }
            // Store with persistentIds
            const msg = (0, presence_1.addPrivateMessage)(myPersistentId, toId, fromUser.nickname, content);
            // Route to target's current socket
            const targetSocketId = (0, presence_1.getSocketId)(toId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_message", msg);
            }
            callback({ success: true, message: msg });
        });
        // Notify the partner that a private message was read
        socket.on("private_read", ({ withUserId }) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId || !withUserId)
                return;
            const changedIds = (0, presence_1.markConversationRead)(myPersistentId, withUserId);
            if (changedIds.length === 0)
                return;
            const targetSocketId = (0, presence_1.getSocketId)(withUserId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_messages_read", {
                    fromUserId: myPersistentId,
                    messageIds: changedIds,
                });
            }
        });
        // Typing indicator for private chats (throttled to avoid spam)
        socket.on("private_typing", ({ toId }) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId || !toId)
                return;
            const now = Date.now();
            const key = `p:${socket.id}:${toId}`;
            if (now - (lastTypingTs.get(key) || 0) < 1500)
                return;
            lastTypingTs.set(key, now);
            const targetSocketId = (0, presence_1.getSocketId)(toId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_typing", { fromId: myPersistentId });
            }
        });
        // Typing indicator for rooms (throttled to avoid spam)
        socket.on("room_typing", ({ roomId }) => {
            if (!roomId || !socket.rooms.has(roomId))
                return;
            const now = Date.now();
            const key = `r:${socket.id}`;
            if (now - (lastTypingTs.get(key) || 0) < 1500)
                return;
            lastTypingTs.set(key, now);
            const room = (0, rooms_1.getRoom)(roomId);
            const nickname = room?.users.find((u) => u.id === socket.id)?.nickname;
            if (!nickname || nickname.startsWith("👻"))
                return;
            socket.to(roomId).emit("room_typing", { userId: socket.id, nickname });
        });
        // Mark room messages as read (chat tab is open)
        socket.on("room_mark_read", ({ roomId, upToMessageId }) => {
            if (!roomId || !upToMessageId)
                return;
            const changed = (0, rooms_1.markRoomTextsRead)(roomId, socket.id, upToMessageId);
            if (changed) {
                io.to(roomId).emit("room_updated", (0, rooms_1.getRoom)(roomId));
            }
        });
        // Edit a private message
        socket.on("edit_private_message", ({ id, toId, content }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ success: false, error: "Usuario no registrado" });
                return;
            }
            const updatedMsg = (0, presence_1.editPrivateMessage)(myPersistentId, toId, id, content);
            const targetSocketId = (0, presence_1.getSocketId)(toId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_message_edited", {
                    id,
                    fromId: myPersistentId,
                    content,
                    updatedAt: updatedMsg ? updatedMsg.updatedAt : Date.now(),
                });
            }
            callback({
                success: true,
                message: updatedMsg || {
                    id,
                    fromId: myPersistentId,
                    toId,
                    fromName: "",
                    content,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            });
        });
        // Delete a private message
        socket.on("delete_private_message", ({ id, toId }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ success: false, error: "Usuario no registrado" });
                return;
            }
            (0, presence_1.deletePrivateMessage)(myPersistentId, toId, id);
            const targetSocketId = (0, presence_1.getSocketId)(toId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_message_deleted", {
                    id,
                    fromId: myPersistentId,
                });
            }
            callback({ success: true });
        });
        // Delete a private file
        socket.on("delete_private_file", ({ id, toId }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ success: false, error: "Usuario no registrado" });
                return;
            }
            const removed = (0, presence_1.deletePrivateFile)(myPersistentId, toId, id);
            if (removed && removed.path && fs_1.default.existsSync(removed.path)) {
                try {
                    fs_1.default.unlinkSync(removed.path);
                }
                catch {
                    // File could not be removed from disk; record is still deleted
                }
            }
            const targetSocketId = (0, presence_1.getSocketId)(toId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_file_deleted", {
                    id,
                    fromId: myPersistentId,
                });
            }
            callback({ success: true });
        });
        // Get conversation history with a specific user
        socket.on("get_private_messages", ({ withUserId }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ messages: [] });
                return;
            }
            const messages = (0, presence_1.getConversation)(myPersistentId, withUserId);
            callback({ messages });
        });
        // Get private files shared in a conversation
        socket.on("get_private_files", ({ withUserId }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ files: [] });
                return;
            }
            const files = (0, presence_1.getPrivateFiles)(myPersistentId, withUserId);
            callback({ files });
        });
        // P2P Synchronization events for chat history persistence (Option 3)
        socket.on("private_sync_ping", ({ toSocketId, fromUserId, lastTimestamp }) => {
            io.to(toSocketId).emit("private_sync_ping", { fromSocketId: socket.id, fromUserId, lastTimestamp });
        });
        socket.on("private_sync_data", ({ toSocketId, fromUserId, messages, files }) => {
            io.to(toSocketId).emit("private_sync_data", { fromUserId, messages, files });
        });
        // Incremental sync: get messages since a timestamp
        socket.on("get_private_messages_since", ({ withUserId, since }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ messages: [] });
                return;
            }
            const allMessages = (0, presence_1.getConversation)(myPersistentId, withUserId);
            const newMessages = allMessages.filter(m => m.createdAt > since);
            callback({ messages: newMessages });
        });
        // Incremental sync: get files since a timestamp
        socket.on("get_private_files_since", ({ withUserId, since }, callback) => {
            const myPersistentId = (0, presence_1.getPersistentId)(socket.id);
            if (!myPersistentId) {
                callback({ files: [] });
                return;
            }
            const allFiles = (0, presence_1.getPrivateFiles)(myPersistentId, withUserId);
            const newFiles = allFiles.filter(f => f.createdAt > since);
            callback({ files: newFiles });
        });
        socket.on("create_room", ({ nickname, password, maxFileSize, customId }, callback) => {
            const settings = {};
            if (maxFileSize)
                settings.maxFileSize = maxFileSize;
            try {
                const room = (0, rooms_1.createRoom)(socket.id, password, settings, customId);
                const user = {
                    id: socket.id,
                    nickname,
                    roomId: room.id,
                    ip: clientIp,
                    userAgent,
                    os,
                    browser,
                    joinedAt: Date.now(),
                };
                (0, rooms_1.joinRoom)(room.id, user, password);
                socket.join(room.id);
                callback({ success: true, roomId: room.id });
                io.to(room.id).emit("room_updated", (0, rooms_1.getRoom)(room.id));
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Error al crear sala";
                callback({ success: false, error: errorMsg });
            }
        });
        socket.on("join_room", ({ roomId, nickname, password }, callback) => {
            const user = {
                id: socket.id,
                nickname,
                roomId,
                ip: clientIp,
                userAgent,
                os,
                browser,
                joinedAt: Date.now(),
            };
            const result = (0, rooms_1.joinRoom)(roomId, user, password);
            if (result.success) {
                socket.join(roomId);
                const room = (0, rooms_1.getRoom)(roomId);
                callback({ success: true, room });
                io.to(roomId).emit("room_updated", room);
            }
            else {
                callback({ success: false, error: result.error });
            }
        });
        // Admin: Join room as ghost (invisible observer)
        socket.on("join_room_ghost", ({ roomId }, callback) => {
            if (!isAdmin) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            const ghost = {
                id: socket.id,
                nickname: "👻 Admin",
                roomId,
                ip: clientIp,
                userAgent,
                os,
                browser,
                joinedAt: Date.now(),
                isGhost: true,
            };
            const result = (0, rooms_1.joinRoomAsGhost)(roomId, ghost);
            if (result.success) {
                socket.join(roomId);
                callback({ success: true, room: result.room });
                // Don't broadcast room_updated to hide ghost
            }
            else {
                callback({ success: false, error: result.error });
            }
        });
        // Admin: Get all active rooms
        socket.on("get_all_rooms", (callback) => {
            if (!isAdmin) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            callback({ success: true, rooms: (0, rooms_1.getAllRooms)() });
        });
        // Host: Kick user from room
        socket.on("kick_user", ({ roomId, targetUserId }, callback) => {
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room || room.hostId !== socket.id) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            const result = (0, rooms_1.kickUser)(roomId, targetUserId);
            if (result.success) {
                io.to(targetUserId).emit("you_were_kicked");
                const targetSocket = io.sockets.sockets.get(targetUserId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                }
                io.to(roomId).emit("room_updated", (0, rooms_1.getRoom)(roomId));
                callback({ success: true });
            }
            else {
                callback({ success: false, error: "Usuario no encontrado" });
            }
        });
        // Host: Ban user IP from room
        socket.on("ban_user", ({ roomId, targetUserId, targetIp }, callback) => {
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room || room.hostId !== socket.id) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            const kickResult = (0, rooms_1.kickUser)(roomId, targetUserId);
            if (targetIp) {
                (0, rooms_1.banUserIp)(roomId, targetIp);
            }
            if (kickResult.success) {
                io.to(targetUserId).emit("you_were_banned");
                const targetSocket = io.sockets.sockets.get(targetUserId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                }
                io.to(roomId).emit("room_updated", (0, rooms_1.getRoom)(roomId));
                callback({ success: true });
            }
            else {
                callback({ success: false });
            }
        });
        // Admin: Close room forcefully
        socket.on("admin_close_room", ({ roomId }, callback) => {
            if (!isAdmin) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room) {
                callback({ success: false, error: "Sala no encontrada" });
                return;
            }
            io.to(roomId).emit("room_closed");
            (0, rooms_1.deleteRoom)(roomId);
            callback({ success: true });
        });
        // Host: Delete file
        socket.on("delete_file", ({ roomId, fileId }, callback) => {
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room || room.hostId !== socket.id) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            const success = (0, rooms_1.removeFileFromRoom)(roomId, fileId);
            if (success) {
                io.to(roomId).emit("room_updated", (0, rooms_1.getRoom)(roomId));
                callback({ success: true });
            }
            else {
                callback({ success: false, error: "Archivo no encontrado" });
            }
        });
        // Host: Delete text
        socket.on("delete_text", ({ roomId, textId }, callback) => {
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room || room.hostId !== socket.id) {
                callback({ success: false, error: "No autorizado" });
                return;
            }
            const success = (0, rooms_1.removeTextFromRoom)(roomId, textId);
            if (success) {
                io.to(roomId).emit("room_updated", (0, rooms_1.getRoom)(roomId));
                callback({ success: true });
            }
            else {
                callback({ success: false, error: "Mensaje no encontrado" });
            }
        });
        socket.on("send_text", ({ roomId, content, senderName }) => {
            const text = {
                id: Math.random().toString(36).substr(2, 9),
                content,
                senderId: socket.id,
                senderName,
                createdAt: Date.now(),
            };
            (0, rooms_1.addTextToRoom)(roomId, text);
            io.to(roomId).emit("new_text", text);
            const room = (0, rooms_1.getRoom)(roomId);
            if (room)
                io.to(roomId).emit("room_updated", room);
        });
        // User voluntarily leaves room
        socket.on("leave_room", ({ roomId, keepActive }, callback) => {
            const room = (0, rooms_1.leaveRoom)(roomId, socket.id, keepActive === true);
            socket.leave(roomId);
            if (room) {
                // Room still exists, notify other users
                io.to(roomId).emit("room_updated", room);
                callback({ success: true });
            }
            else {
                // Room was deleted (no users left and not kept active)
                io.to(roomId).emit("room_closed");
                callback({ success: true });
            }
        });
        // Check which rooms from a list still exist (for recent rooms feature)
        socket.on("check_rooms_exist", ({ roomIds }, callback) => {
            const activeRooms = (0, rooms_1.checkRoomsExist)(roomIds || []);
            callback({ activeRooms });
        });
        // Reconnect to an existing room after page refresh
        socket.on("reconnect_to_room", ({ roomId, nickname, password }, callback) => {
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room) {
                callback({ success: false, error: "Sala no encontrada" });
                return;
            }
            // Check if IP is banned
            if (room.bannedIps.includes(clientIp)) {
                callback({ success: false, error: "Has sido bloqueado de esta sala" });
                return;
            }
            // Verify password if room has one
            if (room.password && room.password !== password) {
                callback({ success: false, error: "Contraseña incorrecta" });
                return;
            }
            // Check if user with this nickname exists in the room
            const existingUser = room.users.find((u) => u.nickname === nickname);
            if (existingUser) {
                // User was in the room, update their socket ID
                const result = (0, rooms_1.updateUserSocketId)(roomId, socket.id, nickname);
                if (result.success && result.room) {
                    socket.join(roomId);
                    callback({ success: true, room: result.room });
                    io.to(roomId).emit("room_updated", result.room);
                }
                else {
                    callback({ success: false, error: result.error || "Error al reconectar" });
                }
            }
            else {
                // User was not in the room, treat as new join
                const user = {
                    id: socket.id,
                    nickname,
                    roomId,
                    ip: clientIp,
                    userAgent,
                    os,
                    browser,
                    joinedAt: Date.now(),
                };
                const joinResult = (0, rooms_1.joinRoom)(roomId, user, password);
                if (joinResult.success) {
                    socket.join(roomId);
                    const updatedRoom = (0, rooms_1.getRoom)(roomId);
                    callback({ success: true, room: updatedRoom });
                    io.to(roomId).emit("room_updated", updatedRoom);
                }
                else {
                    callback({ success: false, error: joinResult.error });
                }
            }
        });
        socket.on("disconnecting", () => {
            // Grace period: don't remove user immediately, wait 15s
            (0, presence_1.scheduleRemoveUser)(socket.id, (user) => {
                // Only fires if user didn't reconnect within 15 seconds
                io.emit("user_offline", { persistentId: user.persistentId });
            });
            // Rooms: leave immediately (reconnect_to_room handles re-joining)
            for (const roomId of socket.rooms) {
                if (roomId !== socket.id) {
                    const room = (0, rooms_1.leaveRoom)(roomId, socket.id);
                    if (room) {
                        io.to(roomId).emit("room_updated", room);
                    }
                    else {
                        io.to(roomId).emit("room_closed");
                    }
                }
            }
        });
    });
};
exports.setupSocket = setupSocket;
