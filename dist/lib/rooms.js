"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeTextFromRoom = exports.removeFileFromRoom = exports.markRoomTextsRead = exports.addTextToRoom = exports.addFileToRoom = exports.deleteRoom = exports.banUserIp = exports.kickUser = exports.checkRoomsExist = exports.leaveRoom = exports.updateUserSocketId = exports.transferHost = exports.joinRoomAsGhost = exports.joinRoom = exports.getAllRooms = exports.getRoom = exports.createRoom = void 0;
const types_1 = require("./types");
const fs_1 = __importDefault(require("fs"));
// In-memory store
const rooms = new Map();
const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
};
const createRoom = (hostId, password, settings, customId) => {
    let id = generateRoomId();
    if (customId) {
        const cleanId = customId.trim().toUpperCase();
        if (!/^[A-Z0-9]{1,10}$/.test(cleanId)) {
            throw new Error("El nombre de la sala debe ser alfanumérico y de máximo 10 caracteres.");
        }
        if (rooms.has(cleanId)) {
            throw new Error("El nombre de la sala ya está en uso.");
        }
        id = cleanId;
    }
    else {
        // Ensure random ID uniqueness (though unlikely to collide)
        while (rooms.has(id)) {
            id = generateRoomId();
        }
    }
    const newRoom = {
        id,
        password,
        hostId,
        users: [],
        ghosts: [],
        files: [],
        texts: [],
        settings: { ...types_1.DEFAULT_ROOM_SETTINGS, ...settings },
        bannedIps: [],
        createdAt: Date.now(),
    };
    rooms.set(id, newRoom);
    return newRoom;
};
exports.createRoom = createRoom;
const getRoom = (roomId) => {
    return rooms.get(roomId);
};
exports.getRoom = getRoom;
// Get all rooms (for admin panel)
const getAllRooms = () => {
    const summaries = [];
    rooms.forEach((room) => {
        summaries.push({
            id: room.id,
            hasPassword: !!room.password,
            userCount: room.users.length,
            fileCount: room.files.length,
            textCount: room.texts.length,
            createdAt: room.createdAt,
        });
    });
    return summaries;
};
exports.getAllRooms = getAllRooms;
const joinRoom = (roomId, user, password) => {
    const room = rooms.get(roomId);
    if (!room)
        return { success: false, error: "Sala no encontrada" };
    // Check if IP is banned
    if (room.bannedIps.includes(user.ip)) {
        return { success: false, error: "Has sido bloqueado de esta sala" };
    }
    if (room.password && room.password !== password) {
        return { success: false, error: "Contraseña incorrecta" };
    }
    const existingUser = room.users.find((u) => u.id === user.id);
    if (!existingUser) {
        room.users.push(user);
    }
    // If room has no host (was left empty but kept active), make this user the host
    if (!room.hostId) {
        room.hostId = user.id;
    }
    return { success: true };
};
exports.joinRoom = joinRoom;
// Join as ghost (admin only - doesn't appear in users list)
const joinRoomAsGhost = (roomId, ghost) => {
    const room = rooms.get(roomId);
    if (!room)
        return { success: false, error: "Sala no encontrada" };
    // Ghosts bypass password check
    const existingGhost = room.ghosts.find((g) => g.id === ghost.id);
    if (!existingGhost) {
        room.ghosts.push({ ...ghost, isGhost: true });
    }
    return { success: true, room };
};
exports.joinRoomAsGhost = joinRoomAsGhost;
const transferHost = (roomId) => {
    const room = rooms.get(roomId);
    if (!room || room.users.length === 0)
        return false;
    // Transfer host to the first user in the list
    room.hostId = room.users[0].id;
    return true;
};
exports.transferHost = transferHost;
const updateUserSocketId = (roomId, newSocketId, nickname) => {
    const room = rooms.get(roomId);
    if (!room)
        return { success: false, error: "Sala no encontrada" };
    const userIndex = room.users.findIndex((u) => u.nickname === nickname);
    if (userIndex === -1)
        return { success: false, error: "Usuario no encontrado en la sala" };
    const oldSocketId = room.users[userIndex].id;
    // Update the socket ID
    room.users[userIndex].id = newSocketId;
    // If this user was the host, update host ID as well
    if (room.hostId === oldSocketId) {
        room.hostId = newSocketId;
    }
    return { success: true, room };
};
exports.updateUserSocketId = updateUserSocketId;
const leaveRoom = (roomId, userId, keepActive = false) => {
    const room = rooms.get(roomId);
    if (!room)
        return undefined;
    // Check if it's a ghost leaving
    const ghostIndex = room.ghosts.findIndex((g) => g.id === userId);
    if (ghostIndex !== -1) {
        room.ghosts.splice(ghostIndex, 1);
        return room;
    }
    const wasHost = userId === room.hostId;
    room.users = room.users.filter((u) => u.id !== userId);
    // If no users left
    if (room.users.length === 0) {
        if (keepActive) {
            // Keep the room active without users - next person to join becomes host
            room.hostId = ""; // Clear host - will be assigned to next person who joins
            return room;
        }
        else {
            // Delete the room
            (0, exports.deleteRoom)(roomId);
            return undefined;
        }
    }
    // If the host left, transfer to the next user
    if (wasHost) {
        (0, exports.transferHost)(roomId);
    }
    return room;
};
exports.leaveRoom = leaveRoom;
// Check if rooms exist (for recent rooms feature)
const checkRoomsExist = (roomIds) => {
    return roomIds.filter(id => rooms.has(id));
};
exports.checkRoomsExist = checkRoomsExist;
// Kick user from room (host only)
const kickUser = (roomId, targetUserId) => {
    const room = rooms.get(roomId);
    if (!room)
        return { success: false };
    const userIndex = room.users.findIndex((u) => u.id === targetUserId);
    if (userIndex === -1)
        return { success: false };
    const kickedUser = room.users[userIndex];
    room.users.splice(userIndex, 1);
    return { success: true, kickedUser };
};
exports.kickUser = kickUser;
// Ban user IP from room (host only)
const banUserIp = (roomId, ip) => {
    const room = rooms.get(roomId);
    if (!room)
        return false;
    if (!room.bannedIps.includes(ip)) {
        room.bannedIps.push(ip);
    }
    return true;
};
exports.banUserIp = banUserIp;
const deleteRoom = (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
        room.files.forEach((file) => {
            try {
                if (fs_1.default.existsSync(file.path)) {
                    fs_1.default.unlinkSync(file.path);
                }
            }
            catch (err) {
                console.error(`Error deleting file ${file.path}:`, err);
            }
        });
        rooms.delete(roomId);
    }
};
exports.deleteRoom = deleteRoom;
const addFileToRoom = (roomId, file) => {
    const room = rooms.get(roomId);
    if (room) {
        room.files.push(file);
    }
};
exports.addFileToRoom = addFileToRoom;
const addTextToRoom = (roomId, text) => {
    const room = rooms.get(roomId);
    if (room) {
        room.texts.push(text);
    }
};
exports.addTextToRoom = addTextToRoom;
/**
 * Marks all messages up to (and including) `upToMessageId` as read by `userId`.
 * Returns true if any message changed.
 */
const markRoomTextsRead = (roomId, userId, upToMessageId) => {
    const room = rooms.get(roomId);
    if (!room)
        return false;
    const lastIndex = room.texts.findIndex((t) => t.id === upToMessageId);
    if (lastIndex === -1)
        return false;
    let changed = false;
    for (let i = 0; i <= lastIndex; i++) {
        const text = room.texts[i];
        if (text.senderId === userId)
            continue;
        if (!text.readBy)
            text.readBy = [];
        if (!text.readBy.includes(userId)) {
            text.readBy.push(userId);
            changed = true;
        }
    }
    return changed;
};
exports.markRoomTextsRead = markRoomTextsRead;
const removeFileFromRoom = (roomId, fileId) => {
    const room = rooms.get(roomId);
    if (!room)
        return false;
    const fileIndex = room.files.findIndex((f) => f.id === fileId);
    if (fileIndex === -1)
        return false;
    const file = room.files[fileIndex];
    try {
        if (fs_1.default.existsSync(file.path)) {
            fs_1.default.unlinkSync(file.path);
        }
    }
    catch (err) {
        console.error(`Error deleting file ${file.path}:`, err);
    }
    room.files.splice(fileIndex, 1);
    return true;
};
exports.removeFileFromRoom = removeFileFromRoom;
const removeTextFromRoom = (roomId, textId) => {
    const room = rooms.get(roomId);
    if (!room)
        return false;
    const textIndex = room.texts.findIndex((t) => t.id === textId);
    if (textIndex === -1)
        return false;
    room.texts.splice(textIndex, 1);
    return true;
};
exports.removeTextFromRoom = removeTextFromRoom;
