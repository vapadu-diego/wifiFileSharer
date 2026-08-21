import { Server, Socket } from "socket.io";
import { createRoom, joinRoom, joinRoomAsGhost, leaveRoom, addTextToRoom, getRoom, getAllRooms, kickUser, banUserIp, deleteRoom, removeFileFromRoom, removeTextFromRoom, updateUserSocketId, checkRoomsExist } from "./rooms";
import { addUser, removeUser, scheduleRemoveUser, cancelRemoveUser, getAllUsers, getPersistentId, getSocketId, addPrivateMessage, getConversation, getPrivateFiles } from "./presence";
import { User, SharedText, RoomSettings } from "./types";

function parseUserAgent(ua: string): { os: string; browser: string } {
  let os = "Unknown";
  let browser = "Unknown";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";

  return { os, browser };
}

// Check if connection is from localhost (server admin)
function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export const setupSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    const clientIp = socket.handshake.address || "Unknown";
    const userAgent = socket.handshake.headers["user-agent"] || "";
    const { os, browser } = parseUserAgent(userAgent);
    const isAdmin = isLocalhost(clientIp);

    // Tell client if they are admin
    socket.emit("admin_status", { isAdmin });

    socket.on("register_user", ({ nickname, persistentId }, callback) => {
      const wasReconnect = cancelRemoveUser(persistentId);
      const user = addUser(socket.id, persistentId, nickname, os, browser);
      const onlineUsers = getAllUsers();

      if (wasReconnect) {
        // Reconnection within grace period — notify others to update socketId
        socket.broadcast.emit("user_reconnected", user);
      } else {
        // New user
        socket.broadcast.emit("user_online", user);
      }

      callback({ success: true, user, onlineUsers });
    });

    // Get all online users
    socket.on("get_online_users", (callback) => {
      callback({ onlineUsers: getAllUsers() });
    });

    // Send a private message to another user
    socket.on("send_private_message", ({ toId, content }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      const fromUser = getAllUsers().find((u) => u.persistentId === myPersistentId);
      if (!fromUser) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      // Store with persistentIds
      const msg = addPrivateMessage(myPersistentId, toId, fromUser.nickname, content);
      // Route to target's current socket
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_message", msg);
      }
      callback({ success: true, message: msg });
    });

    // Get conversation history with a specific user
    socket.on("get_private_messages", ({ withUserId }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) { callback({ messages: [] }); return; }
      const messages = getConversation(myPersistentId, withUserId);
      callback({ messages });
    });

    // Get private files shared in a conversation
    socket.on("get_private_files", ({ withUserId }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) { callback({ files: [] }); return; }
      const files = getPrivateFiles(myPersistentId, withUserId);
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
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) { callback({ messages: [] }); return; }
      const allMessages = getConversation(myPersistentId, withUserId);
      const newMessages = allMessages.filter(m => m.createdAt > since);
      callback({ messages: newMessages });
    });

    // Incremental sync: get files since a timestamp
    socket.on("get_private_files_since", ({ withUserId, since }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) { callback({ files: [] }); return; }
      const allFiles = getPrivateFiles(myPersistentId, withUserId);
      const newFiles = allFiles.filter(f => f.createdAt > since);
      callback({ files: newFiles });
    });

    socket.on("create_room", ({ nickname, password, maxFileSize, customId }, callback) => {
      const settings: Partial<RoomSettings> = {};
      if (maxFileSize) settings.maxFileSize = maxFileSize;

      try {
        const room = createRoom(socket.id, password, settings, customId);

        const user: User = {
          id: socket.id,
          nickname,
          roomId: room.id,
          ip: clientIp,
          userAgent,
          os,
          browser,
          joinedAt: Date.now(),
        };

        joinRoom(room.id, user, password);
        socket.join(room.id);

        callback({ success: true, roomId: room.id });
        io.to(room.id).emit("room_updated", getRoom(room.id));
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : "Error al crear sala";
        callback({ success: false, error: errorMsg });
      }
    });

    socket.on("join_room", ({ roomId, nickname, password }, callback) => {
      const user: User = {
        id: socket.id,
        nickname,
        roomId,
        ip: clientIp,
        userAgent,
        os,
        browser,
        joinedAt: Date.now(),
      };

      const result = joinRoom(roomId, user, password);

      if (result.success) {
        socket.join(roomId);
        const room = getRoom(roomId);
        callback({ success: true, room });
        io.to(roomId).emit("room_updated", room);
      } else {
        callback({ success: false, error: result.error });
      }
    });

    // Admin: Join room as ghost (invisible observer)
    socket.on("join_room_ghost", ({ roomId }, callback) => {
      if (!isAdmin) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const ghost: User = {
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

      const result = joinRoomAsGhost(roomId, ghost);

      if (result.success) {
        socket.join(roomId);
        callback({ success: true, room: result.room });
        // Don't broadcast room_updated to hide ghost
      } else {
        callback({ success: false, error: result.error });
      }
    });

    // Admin: Get all active rooms
    socket.on("get_all_rooms", (callback) => {
      if (!isAdmin) {
        callback({ success: false, error: "No autorizado" });
        return;
      }
      callback({ success: true, rooms: getAllRooms() });
    });

    // Host: Kick user from room
    socket.on("kick_user", ({ roomId, targetUserId }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const result = kickUser(roomId, targetUserId);
      if (result.success) {
        io.to(targetUserId).emit("you_were_kicked");
        const targetSocket = io.sockets.sockets.get(targetUserId);
        if (targetSocket) {
          targetSocket.leave(roomId);
        }
        io.to(roomId).emit("room_updated", getRoom(roomId));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Usuario no encontrado" });
      }
    });

    // Host: Ban user IP from room
    socket.on("ban_user", ({ roomId, targetUserId, targetIp }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const kickResult = kickUser(roomId, targetUserId);
      if (targetIp) {
        banUserIp(roomId, targetIp);
      }

      if (kickResult.success) {
        io.to(targetUserId).emit("you_were_banned");
        const targetSocket = io.sockets.sockets.get(targetUserId);
        if (targetSocket) {
          targetSocket.leave(roomId);
        }
        io.to(roomId).emit("room_updated", getRoom(roomId));
        callback({ success: true });
      } else {
        callback({ success: false });
      }
    });

    // Admin: Close room forcefully
    socket.on("admin_close_room", ({ roomId }, callback) => {
      if (!isAdmin) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const room = getRoom(roomId);
      if (!room) {
        callback({ success: false, error: "Sala no encontrada" });
        return;
      }

      io.to(roomId).emit("room_closed");
      deleteRoom(roomId);
      callback({ success: true });
    });

    // Host: Delete file
    socket.on("delete_file", ({ roomId, fileId }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const success = removeFileFromRoom(roomId, fileId);
      if (success) {
        io.to(roomId).emit("room_updated", getRoom(roomId));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Archivo no encontrado" });
      }
    });

    // Host: Delete text
    socket.on("delete_text", ({ roomId, textId }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const success = removeTextFromRoom(roomId, textId);
      if (success) {
        io.to(roomId).emit("room_updated", getRoom(roomId));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Mensaje no encontrado" });
      }
    });

    socket.on("send_text", ({ roomId, content, senderName }) => {
      const text: SharedText = {
        id: Math.random().toString(36).substr(2, 9),
        content,
        senderId: socket.id,
        senderName,
        createdAt: Date.now(),
      };
      addTextToRoom(roomId, text);
      io.to(roomId).emit("new_text", text);
      const room = getRoom(roomId);
      if (room) io.to(roomId).emit("room_updated", room);
    });

    // User voluntarily leaves room
    socket.on("leave_room", ({ roomId, keepActive }, callback) => {
      const room = leaveRoom(roomId, socket.id, keepActive === true);
      socket.leave(roomId);
      
      if (room) {
        // Room still exists, notify other users
        io.to(roomId).emit("room_updated", room);
        callback({ success: true });
      } else {
        // Room was deleted (no users left and not kept active)
        io.to(roomId).emit("room_closed");
        callback({ success: true });
      }
    });

    // Check which rooms from a list still exist (for recent rooms feature)
    socket.on("check_rooms_exist", ({ roomIds }, callback) => {
      const activeRooms = checkRoomsExist(roomIds || []);
      callback({ activeRooms });
    });

    // Reconnect to an existing room after page refresh
    socket.on("reconnect_to_room", ({ roomId, nickname, password }, callback) => {
      const room = getRoom(roomId);
      
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
        const result = updateUserSocketId(roomId, socket.id, nickname);
        
        if (result.success && result.room) {
          socket.join(roomId);
          callback({ success: true, room: result.room });
          io.to(roomId).emit("room_updated", result.room);
        } else {
          callback({ success: false, error: result.error || "Error al reconectar" });
        }
      } else {
        // User was not in the room, treat as new join
        const user: User = {
          id: socket.id,
          nickname,
          roomId,
          ip: clientIp,
          userAgent,
          os,
          browser,
          joinedAt: Date.now(),
        };

        const joinResult = joinRoom(roomId, user, password);

        if (joinResult.success) {
          socket.join(roomId);
          const updatedRoom = getRoom(roomId);
          callback({ success: true, room: updatedRoom });
          io.to(roomId).emit("room_updated", updatedRoom);
        } else {
          callback({ success: false, error: joinResult.error });
        }
      }
    });

    socket.on("disconnecting", () => {
      // Grace period: don't remove user immediately, wait 15s
      scheduleRemoveUser(socket.id, (user) => {
        // Only fires if user didn't reconnect within 15 seconds
        io.emit("user_offline", { persistentId: user.persistentId });
      });

      // Rooms: leave immediately (reconnect_to_room handles re-joining)
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id) {
          const room = leaveRoom(roomId, socket.id);
          if (room) {
            io.to(roomId).emit("room_updated", room);
          } else {
            io.to(roomId).emit("room_closed");
          }
        }
      }
    });
  });
};
