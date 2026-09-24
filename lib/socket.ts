import { Server, Socket } from "socket.io";
import fs from "fs";
import { createRoom, joinRoom, joinRoomAsGhost, leaveRoom, addTextToRoom, getRoom, getAllRooms, kickUser, banUserIp, deleteRoom, removeFileFromRoom, removeTextFromRoom, updateUserSocketId, checkRoomsExist, markRoomTextsRead, serializeRoom, serializeRoomMeta, getRoomTextsPage, renameUserInRooms, searchRoomTexts, getRoomTextContext } from "./rooms";
import { addUser, scheduleRemoveUser, cancelRemoveUser, getAllUsers, getPersistentId, getSocketId, getUser, renameUser } from "./presence";
import { addPrivateMessage, getConversationPage, getConversationSince, getMessageContext, getPrivateFiles, getPrivateUpdatesSince, getUnreadCounts, importLocalMessages, editPrivateMessage, deletePrivateMessage, deletePrivateFile, markConversationRead, searchPrivateMessages } from "./privateChatRepo";
import { User, SharedText, RoomSettings, sanitizeReplyRef } from "./types";
import { KNOWN_BROWSERS } from "./browserInfo";
import { registerIdentity, renameIdentity, isReservedNickname, isRegisteredIdentity, getIdentitySettings, setIdentityDiscoverable, PERSISTENT_ID_REGEX } from "./identity";
import { getDirectory } from "./directory";
import { getRetentionDays } from "./config";
import { MAX_CONTENT_LENGTH, MAX_NICKNAME_LENGTH, RATE_LIMIT_MAX_EVENTS, RATE_LIMIT_WINDOW_MS } from "./limits";

function parseUserAgent(ua: string, secChUa = ""): { os: string; browser: string } {
  let os = "Unknown";
  let browser = "Unknown";

  // Order matters: Android UAs contain "Linux" and iOS UAs contain "Mac OS"
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  // Brave on desktop/Android hides behind Chrome's UA but advertises itself
  // through the Sec-CH-UA client hint (it may omit it on some sites)
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Vivaldi")) browser = "Vivaldi";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Internet";
  else if (ua.includes("Brave") || secChUa.includes('"Brave"')) browser = "Brave";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  return { os, browser };
}

// Check if connection is from localhost (server admin)
function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

interface MessageCursor {
  createdAt: number;
  id: string;
}

function sanitizeCursor(value: unknown): MessageCursor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const cursor = value as { createdAt?: unknown; id?: unknown };
  if (typeof cursor.createdAt !== "number" || !Number.isFinite(cursor.createdAt)) return undefined;
  if (typeof cursor.id !== "string" || !cursor.id) return undefined;
  return { createdAt: cursor.createdAt, id: cursor.id };
}

export const setupSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    const clientIp = socket.handshake.address || "Unknown";
    const userAgent = socket.handshake.headers["user-agent"] || "";
    const secChUa = socket.handshake.headers["sec-ch-ua"];
    const { os, browser: headerBrowser } = parseUserAgent(
      userAgent,
      typeof secChUa === "string" ? secChUa : ""
    );
    // The client can refine this (e.g. Brave hides from the User-Agent)
    let browser = headerBrowser;
    const isAdmin = isLocalhost(clientIp);

    // Per-connection state (released automatically when the socket dies)
    const rateBuckets = new Map<string, { count: number; resetAt: number }>();
    const typingTs = new Map<string, number>();

    const allowEvent = (
      kind: string,
      limit: number = RATE_LIMIT_MAX_EVENTS,
      windowMs: number = RATE_LIMIT_WINDOW_MS
    ): boolean => {
      const now = Date.now();
      const bucket = rateBuckets.get(kind);
      if (!bucket || now > bucket.resetAt) {
        rateBuckets.set(kind, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (bucket.count >= limit) return false;
      bucket.count++;
      return true;
    };

    type AckCallback = (res: unknown) => void;

    /**
     * Registers an event that always replies through a callback. Protects the
     * server against malformed emissions (a missing/non-function callback used
     * to crash the whole process) and reports internal errors to the client.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ackOn = (event: string, handler: (payload: any, callback: AckCallback) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event, (payload: any, callback: unknown) => {
        const reply: AckCallback = typeof callback === "function" ? (callback as AckCallback) : () => {};
        try {
          handler(payload, reply);
        } catch (err) {
          console.error(`Error handling "${event}":`, err);
          reply({ success: false, error: "Error interno del servidor" });
        }
      });
    };

    // Tell client if they are admin
    socket.emit("admin_status", { isAdmin });

    ackOn("register_user", ({ nickname, persistentId, token, browser: browserHint }, callback) => {
      if (typeof persistentId !== "string" || !PERSISTENT_ID_REGEX.test(persistentId)) {
        callback({ success: false, error: "Identificador de usuario inválido" });
        return;
      }
      if (typeof nickname !== "string" || !nickname.trim()) {
        callback({ success: false, error: "Apodo inválido" });
        return;
      }
      const cleanNickname = nickname.trim().slice(0, MAX_NICKNAME_LENGTH);

      // Client-side detection refines the UA heuristic (Brave, Chromium variants)
      if (
        typeof browserHint === "string" &&
        (KNOWN_BROWSERS as readonly string[]).includes(browserHint)
      ) {
        browser = browserHint;
      }

      const identity = registerIdentity(
        persistentId,
        typeof token === "string" ? token : undefined,
        cleanNickname
      );
      if (!identity.ok) {
        callback({ success: false, error: identity.error });
        return;
      }

      const wasReconnect = cancelRemoveUser(persistentId);
      const displaced = getUser(persistentId);

      if (displaced && displaced.id !== socket.id) {
        const oldSocket = io.sockets.sockets.get(displaced.id);
        if (oldSocket) {
          oldSocket.emit("identity_replaced");
          // Remove the displaced session from every room it was part of
          for (const roomId of Array.from(oldSocket.rooms)) {
            if (roomId === oldSocket.id) continue;
            const room = leaveRoom(roomId, oldSocket.id);
            if (room) {
              io.to(roomId).emit("room_updated", serializeRoomMeta(room));
            } else {
              io.to(roomId).emit("room_closed");
            }
            oldSocket.leave(roomId);
          }
        }
      }

      // The displaced socket may have scheduled a removal timer for this identity
      cancelRemoveUser(persistentId);

      // The stored nickname always wins: it only changes via update_nickname
      const user = addUser(socket.id, persistentId, identity.nickname, os, browser);
      const onlineUsers = getDirectory();

      if (wasReconnect || displaced) {
        // Reconnection or takeover — notify others to update socketId
        socket.broadcast.emit("user_reconnected", user);
      } else {
        // New user
        socket.broadcast.emit("user_online", user);
      }

      callback({
        success: true,
        user,
        onlineUsers,
        token: identity.token,
        unreadCounts: getUnreadCounts(persistentId),
        settings: getIdentitySettings(persistentId),
        retentionDays: getRetentionDays(),
      });
    });

    // Change the display nickname. The new name must be free across the whole
    // registry (case-insensitive) and cannot use the reserved ghost prefix.
    ackOn("update_nickname", ({ nickname }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof nickname !== "string") {
        callback({ success: false, error: "Nombre inválido" });
        return;
      }
      const cleanNickname = nickname.trim().replace(/\s+/g, " ");
      if (!cleanNickname || cleanNickname.length > MAX_NICKNAME_LENGTH) {
        callback({
          success: false,
          error: `El nombre debe tener entre 1 y ${MAX_NICKNAME_LENGTH} caracteres`,
        });
        return;
      }
      if (isReservedNickname(cleanNickname)) {
        callback({ success: false, error: "Ese nombre está reservado" });
        return;
      }
      if (!allowEvent("nickname", 5, 60_000)) {
        callback({ success: false, error: "Demasiados cambios de nombre, espera un minuto" });
        return;
      }

      const result = renameIdentity(myPersistentId, cleanNickname);
      if (!result.ok) {
        callback({ success: false, error: result.error });
        return;
      }

      const user = renameUser(myPersistentId, result.nickname);
      const affectedRooms = renameUserInRooms(myPersistentId, result.nickname);

      if (user) {
        socket.broadcast.emit("user_updated", user);
      }
      for (const roomId of affectedRooms) {
        const room = getRoom(roomId);
        if (room) io.to(roomId).emit("room_updated", serializeRoomMeta(room));
      }

      callback({ success: true, user: user ?? null, nickname: result.nickname });
    });

    // Change identity settings (offline visibility)
    ackOn("update_settings", ({ discoverable }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof discoverable !== "boolean") {
        callback({ success: false, error: "Ajuste inválido" });
        return;
      }
      if (!allowEvent("settings", 10, 60_000)) {
        callback({ success: false, error: "Demasiados cambios seguidos, espera un momento" });
        return;
      }
      if (!setIdentityDiscoverable(myPersistentId, discoverable)) {
        callback({ success: false, error: "Identidad no registrada" });
        return;
      }
      callback({ success: true, settings: { discoverable } });
    });

    // Get all contacts (online users + offline discoverable identities)
    socket.on("get_online_users", (callback) => {
      if (typeof callback !== "function") return;
      if (!getPersistentId(socket.id)) {
        callback({ onlineUsers: [] });
        return;
      }
      callback({ onlineUsers: getDirectory() });
    });

    // Send a private message to another user
    ackOn("send_private_message", ({ toId, content, replyTo }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof toId !== "string" || !PERSISTENT_ID_REGEX.test(toId)) {
        callback({ success: false, error: "Destinatario inválido" });
        return;
      }
      if (!isRegisteredIdentity(toId)) {
        callback({ success: false, error: "Destinatario desconocido" });
        return;
      }
      if (typeof content !== "string" || !content.trim()) {
        callback({ success: false, error: "Mensaje vacío" });
        return;
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        callback({ success: false, error: "Mensaje demasiado largo" });
        return;
      }
      if (!allowEvent("private_message")) {
        callback({ success: false, error: "Demasiados mensajes seguidos, espera unos segundos" });
        return;
      }
      const fromUser = getAllUsers().find((u) => u.persistentId === myPersistentId);
      if (!fromUser) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      // Store with persistentIds
      const msg = addPrivateMessage(myPersistentId, toId, fromUser.nickname, content, sanitizeReplyRef(replyTo));
      // Route to target's current socket
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_message", msg);
      }
      callback({ success: true, message: msg });
    });

    // Notify the partner that a private message was read
    socket.on("private_read", ({ withUserId }) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || !withUserId) return;
      const changedIds = markConversationRead(myPersistentId, withUserId);
      if (changedIds.length === 0) return;
      const targetSocketId = getSocketId(withUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_messages_read", {
          fromUserId: myPersistentId,
          messageIds: changedIds,
        });
      }
    });

    // Typing indicator for private chats (throttled to avoid spam)
    socket.on("private_typing", ({ toId }) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || !toId) return;
      const now = Date.now();
      const key = `p:${toId}`;
      if (now - (typingTs.get(key) || 0) < 1500) return;
      typingTs.set(key, now);
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_typing", { fromId: myPersistentId });
      }
    });

    // Typing indicator for rooms (throttled to avoid spam)
    socket.on("room_typing", ({ roomId }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      const now = Date.now();
      const key = `r:${roomId}`;
      if (now - (typingTs.get(key) || 0) < 1500) return;
      typingTs.set(key, now);
      const room = getRoom(roomId);
      const nickname = room?.users.find((u) => u.id === socket.id)?.nickname;
      if (!nickname || nickname.startsWith("👻")) return;
      socket.to(roomId).emit("room_typing", { userId: socket.id, nickname });
    });

    // Mark room messages as read (chat tab is open)
    socket.on("room_mark_read", ({ roomId, upToMessageId }) => {
      if (!roomId || !upToMessageId || !socket.rooms.has(roomId)) return;
      const changedIds = markRoomTextsRead(roomId, socket.id, upToMessageId);
      if (changedIds.length > 0) {
        io.to(roomId).emit("room_read_updated", {
          roomId,
          userId: socket.id,
          messageIds: changedIds,
        });
      }
    });

    // Paginated room history (older messages than the snapshot)
    ackOn("get_room_texts_page", ({ roomId, before, limit }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof roomId !== "string" || !socket.rooms.has(roomId)) {
        callback({ texts: [], hasMore: false });
        return;
      }
      callback(getRoomTextsPage(roomId, sanitizeCursor(before), typeof limit === "number" ? limit : undefined));
    });

    // Search across the requester's private conversations (Ctrl+K palette)
    ackOn("search_private_messages", ({ query, withUserId, limit }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof query !== "string") {
        callback({ results: [], hasMore: false });
        return;
      }
      if (!allowEvent("search", 20, 10_000)) {
        callback({ results: [], hasMore: false, error: "Demasiadas búsquedas seguidas" });
        return;
      }
      const result = searchPrivateMessages(myPersistentId, query, {
        withUserId: typeof withUserId === "string" ? withUserId : undefined,
        limit: typeof limit === "number" ? limit : undefined,
      });
      callback({
        ...result,
        results: result.results.map((item) => ({
          ...item,
          partnerOnline: !!getSocketId(item.partnerId),
        })),
      });
    });

    // Search inside the room history (members only)
    ackOn("search_room_texts", ({ roomId, query }, callback) => {
      if (typeof roomId !== "string" || !socket.rooms.has(roomId) || typeof query !== "string") {
        callback({ results: [], hasMore: false });
        return;
      }
      if (!allowEvent("search", 20, 10_000)) {
        callback({ results: [], hasMore: false, error: "Demasiadas búsquedas seguidas" });
        return;
      }
      callback(searchRoomTexts(roomId, query));
    });

    // Context page around a room message (jump to a search result)
    ackOn("get_room_text_context", ({ roomId, messageId, limit }, callback) => {
      if (typeof roomId !== "string" || !socket.rooms.has(roomId) || typeof messageId !== "string") {
        callback({ texts: [], hasMoreBefore: false, hasMoreAfter: false });
        return;
      }
      const result = getRoomTextContext(roomId, messageId, typeof limit === "number" ? limit : undefined);
      callback(result ?? { texts: [], hasMoreBefore: false, hasMoreAfter: false });
    });

    // Edit a private message (author only)
    ackOn("edit_private_message", ({ id, toId, content }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (
        typeof id !== "string" ||
        typeof toId !== "string" ||
        typeof content !== "string" ||
        !content.trim() ||
        content.length > MAX_CONTENT_LENGTH
      ) {
        callback({ success: false, error: "Datos de mensaje inválidos" });
        return;
      }
      if (!allowEvent("edit_message")) {
        callback({ success: false, error: "Demasiadas operaciones seguidas" });
        return;
      }
      const updatedMsg = editPrivateMessage(myPersistentId, toId, id, content);
      if (!updatedMsg) {
        callback({ success: false, error: "Solo puedes editar tus propios mensajes" });
        return;
      }
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_message_edited", {
          id,
          fromId: myPersistentId,
          content,
          updatedAt: updatedMsg.updatedAt,
        });
      }
      callback({ success: true, message: updatedMsg });
    });

    // Delete a private message (author only)
    ackOn("delete_private_message", ({ id, toId }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof id !== "string" || typeof toId !== "string") {
        callback({ success: false, error: "Datos inválidos" });
        return;
      }
      if (!allowEvent("delete_message")) {
        callback({ success: false, error: "Demasiadas operaciones seguidas" });
        return;
      }
      const deleted = deletePrivateMessage(myPersistentId, toId, id);
      if (!deleted) {
        callback({ success: false, error: "Solo puedes eliminar tus propios mensajes" });
        return;
      }
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_message_deleted", {
          id,
          fromId: myPersistentId,
        });
      }
      callback({ success: true });
    });

    // Delete a private file (sender only)
    ackOn("delete_private_file", ({ id, toId }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof id !== "string" || typeof toId !== "string") {
        callback({ success: false, error: "Datos inválidos" });
        return;
      }
      const removed = deletePrivateFile(myPersistentId, toId, id);
      if (!removed) {
        callback({ success: false, error: "Solo puedes eliminar archivos que enviaste" });
        return;
      }
      if (removed.path && fs.existsSync(removed.path)) {
        try {
          fs.unlinkSync(removed.path);
        } catch {
          // File could not be removed from disk; record is still deleted
        }
      }
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_file_deleted", {
          id,
          fromId: myPersistentId,
        });
      }
      callback({ success: true });
    });

    // Get private files shared in a conversation
    ackOn("get_private_files", ({ withUserId }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) { callback({ files: [] }); return; }
      const files = getPrivateFiles(myPersistentId, withUserId);
      callback({ files });
    });

    // Paginated conversation history (server is the source of truth)
    ackOn("get_private_messages_page", ({ withUserId, before, after, limit }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof withUserId !== "string") {
        callback({ messages: [], hasMore: false });
        return;
      }
      const result = getConversationPage(myPersistentId, withUserId, {
        before: sanitizeCursor(before),
        after: sanitizeCursor(after),
        limit: typeof limit === "number" ? limit : undefined,
      });
      callback(result);
    });

    // Page around a specific message (used to jump to a quoted message)
    ackOn("get_private_message_context", ({ withUserId, messageId, limit }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof withUserId !== "string" || typeof messageId !== "string") {
        callback({ messages: [], hasMoreBefore: false, hasMoreAfter: false });
        return;
      }
      const result = getMessageContext(myPersistentId, withUserId, messageId, limit);
      callback(result ?? { messages: [], hasMoreBefore: false, hasMoreAfter: false });
    });

    // Incremental sync: get messages since a timestamp (gap fill on reconnect)
    ackOn("get_private_messages_since", ({ withUserId, since }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof withUserId !== "string") { callback({ messages: [] }); return; }
      const sinceTs = typeof since === "number" && Number.isFinite(since) ? since : 0;
      callback({ messages: getConversationSince(myPersistentId, withUserId, sinceTs) });
    });

    // One-time import of legacy local history (own messages only)
    ackOn("import_local_messages", ({ withUserId, messages }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof withUserId !== "string" || !isRegisteredIdentity(withUserId)) {
        callback({ success: false, imported: 0, error: "Destinatario desconocido" });
        return;
      }
      if (!allowEvent("import_messages", 5, 60_000)) {
        callback({ success: false, imported: 0, error: "Demasiadas importaciones seguidas" });
        return;
      }
      const imported = importLocalMessages(myPersistentId, withUserId, messages);
      callback({ success: true, imported });
    });

    // Unread counters (used after a page reload)
    ackOn("get_private_unread_counts", (_payload, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) { callback({ counts: {} }); return; }
      callback({ counts: getUnreadCounts(myPersistentId) });
    });

    // Reconcile edits/deletions made while this participant was offline
    ackOn("get_private_updates_since", ({ withUserId, since }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof withUserId !== "string") {
        callback({ updated: [], deleted: [] });
        return;
      }
      const sinceTs = typeof since === "number" && Number.isFinite(since) ? since : 0;
      callback(getPrivateUpdatesSince(myPersistentId, withUserId, sinceTs));
    });

    ackOn("create_room", ({ nickname, password, maxFileSize, customId }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof nickname !== "string" || !nickname.trim()) {
        callback({ success: false, error: "Apodo inválido" });
        return;
      }
      if (!allowEvent("room_action", 10, 30_000)) {
        callback({ success: false, error: "Demasiadas operaciones seguidas" });
        return;
      }
      const settings: Partial<RoomSettings> = {};
      if (maxFileSize) settings.maxFileSize = maxFileSize;

      try {
        const room = createRoom(socket.id, password, settings, customId);

        const user: User = {
          id: socket.id,
          nickname: nickname.trim().slice(0, MAX_NICKNAME_LENGTH),
          roomId: room.id,
          ip: clientIp,
          userAgent,
          os,
          browser,
          joinedAt: Date.now(),
          persistentId: myPersistentId,
        };

        joinRoom(room.id, user, password);
        socket.join(room.id);

        callback({ success: true, roomId: room.id });
        const created = getRoom(room.id);
        if (created) io.to(room.id).emit("room_snapshot", serializeRoom(created));
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : "Error al crear sala";
        callback({ success: false, error: errorMsg });
      }
    });

    ackOn("join_room", ({ roomId, nickname, password }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof roomId !== "string" || !roomId) {
        callback({ success: false, error: "Sala inválida" });
        return;
      }
      if (typeof nickname !== "string" || !nickname.trim()) {
        callback({ success: false, error: "Apodo inválido" });
        return;
      }
      const user: User = {
        id: socket.id,
        nickname: nickname.trim().slice(0, MAX_NICKNAME_LENGTH),
        roomId,
        ip: clientIp,
        userAgent,
        os,
        browser,
        joinedAt: Date.now(),
        persistentId: myPersistentId,
      };

      const result = joinRoom(roomId, user, password);

      if (result.success) {
        socket.join(roomId);
        const room = getRoom(roomId);
        if (room) {
          const snapshot = serializeRoom(room);
          callback({ success: true, room: snapshot });
          // The joiner gets the full snapshot; existing members only need meta
          socket.emit("room_snapshot", snapshot);
          socket.to(roomId).emit("room_updated", serializeRoomMeta(room));
        } else {
          callback({ success: true, room: undefined });
        }
      } else {
        callback({ success: false, error: result.error });
      }
    });

    // Admin: Join room as ghost (invisible observer)
    ackOn("join_room_ghost", ({ roomId }, callback) => {
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
        callback({ success: true, room: result.room ? serializeRoom(result.room) : undefined });
        // Don't broadcast room_updated to hide ghost
      } else {
        callback({ success: false, error: result.error });
      }
    });

    // Admin: Get all active rooms
    socket.on("get_all_rooms", (callback) => {
      if (typeof callback !== "function") return;
      if (!isAdmin) {
        callback({ success: false, error: "No autorizado" });
        return;
      }
      callback({ success: true, rooms: getAllRooms() });
    });

    // Host: Kick user from room
    ackOn("kick_user", ({ roomId, targetUserId }, callback) => {
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
        const updated = getRoom(roomId);
        if (updated) io.to(roomId).emit("room_updated", serializeRoomMeta(updated));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Usuario no encontrado" });
      }
    });

    // Host: Ban user IP from room
    ackOn("ban_user", ({ roomId, targetUserId }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      // Resolve the IP server-side; never trust a client-provided address
      const target = room.users.find((u) => u.id === targetUserId);
      const kickResult = kickUser(roomId, targetUserId);
      if (target?.ip) {
        banUserIp(roomId, target.ip);
      }

      if (kickResult.success) {
        io.to(targetUserId).emit("you_were_banned");
        const targetSocket = io.sockets.sockets.get(targetUserId);
        if (targetSocket) {
          targetSocket.leave(roomId);
        }
        const updated = getRoom(roomId);
        if (updated) io.to(roomId).emit("room_updated", serializeRoomMeta(updated));
        callback({ success: true });
      } else {
        callback({ success: false });
      }
    });

    // Admin: Close room forcefully
    ackOn("admin_close_room", ({ roomId }, callback) => {
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
    ackOn("delete_file", ({ roomId, fileId }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const success = removeFileFromRoom(roomId, fileId);
      if (success) {
        const updated = getRoom(roomId);
        if (updated) io.to(roomId).emit("room_updated", serializeRoomMeta(updated));
        callback({ success: true });
      } else {
        callback({ success: false, error: "Archivo no encontrado" });
      }
    });

    // Host: Delete text
    ackOn("delete_text", ({ roomId, textId }, callback) => {
      const room = getRoom(roomId);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: "No autorizado" });
        return;
      }

      const success = removeTextFromRoom(roomId, textId);
      if (success) {
        io.to(roomId).emit("text_deleted", { roomId, textId });
        callback({ success: true });
      } else {
        callback({ success: false, error: "Mensaje no encontrado" });
      }
    });

    socket.on("send_text", ({ roomId, content, replyTo }) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId || typeof roomId !== "string" || typeof content !== "string") return;
      if (!socket.rooms.has(roomId)) return;
      if (!content.trim() || content.length > MAX_CONTENT_LENGTH) return;
      if (!allowEvent("room_text")) return;

      const room = getRoom(roomId);
      if (!room) return;

      // Sender identity always comes from server-side state
      const member = room.users.find((u) => u.id === socket.id);
      const ghost = (room.ghosts ?? []).find((g) => g.id === socket.id);
      const senderName = member?.nickname || ghost?.nickname;
      if (!senderName) return;

      const text: SharedText = {
        id: Math.random().toString(36).substr(2, 9),
        content,
        senderId: socket.id,
        senderName,
        createdAt: Date.now(),
      };
      const reply = sanitizeReplyRef(replyTo);
      if (reply) text.replyTo = reply;
      addTextToRoom(roomId, text);
      // Messages travel as a delta: the full room is not rebroadcast
      io.to(roomId).emit("new_text", text);
    });

    // User voluntarily leaves room
    ackOn("leave_room", ({ roomId, keepActive }, callback) => {
      const room = leaveRoom(roomId, socket.id, keepActive === true);
      socket.leave(roomId);
      
      if (room) {
        // Room still exists, notify other users
        io.to(roomId).emit("room_updated", serializeRoomMeta(room));
        callback({ success: true });
      } else {
        // Room was deleted (no users left and not kept active)
        io.to(roomId).emit("room_closed");
        callback({ success: true });
      }
    });

    // Check which rooms from a list still exist (for recent rooms feature)
    ackOn("check_rooms_exist", ({ roomIds }, callback) => {
      if (!getPersistentId(socket.id)) {
        callback({ activeRooms: [] });
        return;
      }
      const activeRooms = checkRoomsExist(Array.isArray(roomIds) ? roomIds : []);
      callback({ activeRooms });
    });

    // Reconnect to an existing room after page refresh
    ackOn("reconnect_to_room", ({ roomId, nickname, password }, callback) => {
      const myPersistentId = getPersistentId(socket.id);
      if (!myPersistentId) {
        callback({ success: false, error: "Usuario no registrado" });
        return;
      }
      if (typeof roomId !== "string" || !roomId) {
        callback({ success: false, error: "Sala inválida" });
        return;
      }
      const room = getRoom(roomId);
      
      if (!room) {
        callback({ success: false, error: "Sala no encontrada" });
        return;
      }

      // Check if IP is banned
      if ((room.bannedIps ?? []).includes(clientIp)) {
        callback({ success: false, error: "Has sido bloqueado de esta sala" });
        return;
      }

      // Verify password if room has one
      if (room.password && room.password !== password) {
        callback({ success: false, error: "Contraseña incorrecta" });
        return;
      }

      // Identity match takes precedence over the nickname (B7)
      const existingUser = room.users.find((u) => u.persistentId === myPersistentId);
      
      if (existingUser) {
        // User was in the room, update their socket ID
        const result = updateUserSocketId(roomId, socket.id, myPersistentId);
        
        if (result.success && result.room) {
          socket.join(roomId);
          const snapshot = serializeRoom(result.room);
          callback({ success: true, room: snapshot });
          socket.emit("room_snapshot", snapshot);
          socket.to(roomId).emit("room_updated", serializeRoomMeta(result.room));
        } else {
          callback({ success: false, error: result.error || "Error al reconectar" });
        }
      } else {
        // User was not in the room, treat as new join
        const user: User = {
          id: socket.id,
          nickname: (typeof nickname === "string" && nickname.trim() ? nickname.trim() : "Anónimo").slice(0, MAX_NICKNAME_LENGTH),
          roomId,
          ip: clientIp,
          userAgent,
          os,
          browser,
          joinedAt: Date.now(),
          persistentId: myPersistentId,
        };

        const joinResult = joinRoom(roomId, user, password);

        if (joinResult.success) {
          socket.join(roomId);
          const updatedRoom = getRoom(roomId);
          if (updatedRoom) {
            const snapshot = serializeRoom(updatedRoom);
            callback({ success: true, room: snapshot });
            socket.emit("room_snapshot", snapshot);
            socket.to(roomId).emit("room_updated", serializeRoomMeta(updatedRoom));
          } else {
            callback({ success: false, error: "Error al reconectar" });
          }
        } else {
          callback({ success: false, error: joinResult.error });
        }
      }
    });

    socket.on("disconnecting", () => {
      // Grace period: don't remove user immediately, wait 15s
      scheduleRemoveUser(socket.id, (user) => {
        // Only fires if user didn't reconnect within 15 seconds
        const settings = getIdentitySettings(user.persistentId);
        if (settings?.discoverable) {
          // Keep the contact in the directory, marked as offline and without
          // device info (there is no active device anymore)
          io.emit("user_updated", {
            ...user,
            id: user.persistentId,
            os: "",
            browser: "",
            isOnline: false,
          });
        } else {
          io.emit("user_offline", { persistentId: user.persistentId });
        }
      });

      // Rooms: leave immediately (reconnect_to_room handles re-joining)
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id) {
          const room = leaveRoom(roomId, socket.id);
          if (room) {
            io.to(roomId).emit("room_updated", serializeRoomMeta(room));
          } else {
            io.to(roomId).emit("room_closed");
          }
        }
      }
    });
  });
};
