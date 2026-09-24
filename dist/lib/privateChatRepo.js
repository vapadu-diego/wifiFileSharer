"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyPrivateFiles = exports.removeOrphanUploads = exports.purgeExpiredFiles = exports.removePrivateFileById = exports.deletePrivateFile = exports.getPrivateFileById = exports.getPrivateFiles = exports.addPrivateFile = exports.importLocalMessages = exports.searchPrivateMessages = exports.SEARCH_PAGE_SIZE = exports.getUnreadCounts = exports.pruneDeletedMessages = exports.deletePrivateMessage = exports.editPrivateMessage = exports.markConversationRead = exports.getPrivateUpdatesSince = exports.getMessageContext = exports.getConversationSince = exports.getConversationPage = exports.addPrivateMessage = void 0;
exports.conversationKey = conversationKey;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const paths_1 = require("./paths");
const config_1 = require("./config");
const identity_1 = require("./identity");
const types_1 = require("./types");
const search_1 = require("./search");
const limits_1 = require("./limits");
function conversationKey(a, b) {
    return [a, b].sort().join(":");
}
function rowToMessage(row) {
    const msg = {
        id: row.id,
        fromId: row.from_id,
        toId: row.to_id,
        fromName: row.from_name,
        content: row.content,
        createdAt: Number(row.created_at),
    };
    if (row.updated_at)
        msg.updatedAt = Number(row.updated_at);
    if (row.read_at)
        msg.readAt = Number(row.read_at);
    if (row.reply_to) {
        try {
            const reply = (0, types_1.sanitizeReplyRef)(JSON.parse(row.reply_to));
            if (reply)
                msg.replyTo = reply;
        }
        catch {
            // ignore malformed stored reply
        }
    }
    return msg;
}
function rowToFile(row) {
    return {
        id: row.id,
        name: row.name,
        size: Number(row.size),
        type: row.type,
        fromId: row.from_id,
        toId: row.to_id,
        fromName: row.from_name,
        path: row.path,
        createdAt: Number(row.created_at),
    };
}
function clampLimit(limit) {
    if (!limit || !Number.isFinite(limit))
        return limits_1.PAGE_SIZE_DEFAULT;
    return Math.max(1, Math.min(Math.floor(limit), limits_1.PAGE_SIZE_MAX));
}
// --- Private messages ---
const addPrivateMessage = (fromId, toId, fromName, content, replyTo) => {
    const msg = {
        id: Math.random().toString(36).substr(2, 9),
        fromId,
        toId,
        fromName,
        content,
        createdAt: Date.now(),
    };
    if (replyTo)
        msg.replyTo = replyTo;
    (0, db_1.getDb)()
        .prepare(`INSERT INTO private_messages
        (id, conversation_key, from_id, to_id, from_name, content, reply_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(msg.id, conversationKey(fromId, toId), fromId, toId, fromName, content, replyTo ? JSON.stringify(replyTo) : null, msg.createdAt);
    return msg;
};
exports.addPrivateMessage = addPrivateMessage;
const getConversationPage = (userId1, userId2, options = {}) => {
    const limit = clampLimit(options.limit);
    const key = conversationKey(userId1, userId2);
    const base = `SELECT * FROM private_messages WHERE conversation_key = ? AND deleted_at IS NULL`;
    const db = (0, db_1.getDb)();
    if (options.after) {
        const rows = db
            .prepare(`${base} AND (created_at > ? OR (created_at = ? AND id > ?))
         ORDER BY created_at ASC, id ASC LIMIT ?`)
            .all(key, options.after.createdAt, options.after.createdAt, options.after.id, limit + 1);
        const hasMore = rows.length > limit;
        return { messages: rows.slice(0, limit).map(rowToMessage), hasMore };
    }
    const before = options.before;
    const rows = before
        ? db
            .prepare(`${base} AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`)
            .all(key, before.createdAt, before.createdAt, before.id, limit + 1)
        : db
            .prepare(`${base} ORDER BY created_at DESC, id DESC LIMIT ?`)
            .all(key, limit + 1);
    const hasMore = rows.length > limit;
    return { messages: rows.slice(0, limit).reverse().map(rowToMessage), hasMore };
};
exports.getConversationPage = getConversationPage;
const getConversationSince = (userId1, userId2, since) => {
    const rows = (0, db_1.getDb)()
        .prepare(`SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL AND created_at > ?
       ORDER BY created_at ASC, id ASC`)
        .all(conversationKey(userId1, userId2), since);
    return rows.map(rowToMessage);
};
exports.getConversationSince = getConversationSince;
const getMessageContext = (userId1, userId2, messageId, limit) => {
    const db = (0, db_1.getDb)();
    const key = conversationKey(userId1, userId2);
    const size = clampLimit(limit);
    const target = db
        .prepare(`SELECT * FROM private_messages
       WHERE conversation_key = ? AND id = ? AND deleted_at IS NULL`)
        .get(key, messageId);
    if (!target)
        return undefined;
    const beforeRows = db
        .prepare(`SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL
         AND (created_at < ? OR (created_at = ? AND id <= ?))
       ORDER BY created_at DESC, id DESC LIMIT ?`)
        .all(key, target.created_at, target.created_at, target.id, size + 1);
    const afterRows = db
        .prepare(`SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL
         AND (created_at > ? OR (created_at = ? AND id > ?))
       ORDER BY created_at ASC, id ASC LIMIT ?`)
        .all(key, target.created_at, target.created_at, target.id, size + 1);
    const hasMoreBefore = beforeRows.length > size;
    const hasMoreAfter = afterRows.length > size;
    const messages = [
        ...beforeRows.slice(0, size).reverse().map(rowToMessage),
        ...afterRows.slice(0, size).map(rowToMessage),
    ];
    return { messages, hasMoreBefore, hasMoreAfter };
};
exports.getMessageContext = getMessageContext;
const getPrivateUpdatesSince = (userId1, userId2, since) => {
    const key = conversationKey(userId1, userId2);
    const db = (0, db_1.getDb)();
    const updatedRows = db
        .prepare(`SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL
         AND updated_at IS NOT NULL AND updated_at > ?
       ORDER BY updated_at ASC`)
        .all(key, since);
    const deletedRows = db
        .prepare(`SELECT id FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NOT NULL AND deleted_at > ?`)
        .all(key, since);
    return {
        updated: updatedRows.map(rowToMessage),
        deleted: deletedRows.map((r) => r.id),
    };
};
exports.getPrivateUpdatesSince = getPrivateUpdatesSince;
const markConversationRead = (readerId, otherId, readAt = Date.now()) => {
    const db = (0, db_1.getDb)();
    const key = conversationKey(readerId, otherId);
    const rows = db
        .prepare(`SELECT id FROM private_messages
       WHERE conversation_key = ? AND to_id = ? AND read_at IS NULL AND deleted_at IS NULL`)
        .all(key, readerId);
    const fileRows = db
        .prepare(`SELECT id FROM private_files
       WHERE conversation_key = ? AND to_id = ? AND read_at IS NULL`)
        .all(key, readerId);
    if (rows.length === 0 && fileRows.length === 0)
        return [];
    const updateMessage = db.prepare(`UPDATE private_messages SET read_at = ? WHERE id = ?`);
    const updateFile = db.prepare(`UPDATE private_files SET read_at = ? WHERE id = ?`);
    (0, db_1.withTransaction)(() => {
        for (const row of rows)
            updateMessage.run(readAt, row.id);
        for (const row of fileRows)
            updateFile.run(readAt, row.id);
    });
    return rows.map((r) => r.id);
};
exports.markConversationRead = markConversationRead;
const editPrivateMessage = (fromId, toId, messageId, newContent) => {
    const db = (0, db_1.getDb)();
    const key = conversationKey(fromId, toId);
    const updatedAt = Date.now();
    const info = db
        .prepare(`UPDATE private_messages SET content = ?, updated_at = ?
       WHERE id = ? AND conversation_key = ? AND from_id = ? AND deleted_at IS NULL`)
        .run(newContent, updatedAt, messageId, key, fromId);
    if (Number(info.changes) === 0)
        return undefined;
    const row = db
        .prepare(`SELECT * FROM private_messages WHERE id = ?`)
        .get(messageId);
    return rowToMessage(row);
};
exports.editPrivateMessage = editPrivateMessage;
const deletePrivateMessage = (fromId, toId, messageId) => {
    const info = (0, db_1.getDb)()
        .prepare(`UPDATE private_messages SET deleted_at = ?
       WHERE id = ? AND conversation_key = ? AND from_id = ? AND deleted_at IS NULL`)
        .run(Date.now(), messageId, conversationKey(fromId, toId), fromId);
    return Number(info.changes) > 0;
};
exports.deletePrivateMessage = deletePrivateMessage;
const pruneDeletedMessages = () => {
    const cutoff = Date.now() - limits_1.TOMBSTONE_RETENTION_MS;
    const info = (0, db_1.getDb)()
        .prepare(`DELETE FROM private_messages WHERE deleted_at IS NOT NULL AND deleted_at < ?`)
        .run(cutoff);
    return Number(info.changes);
};
exports.pruneDeletedMessages = pruneDeletedMessages;
const getUnreadCounts = (userId) => {
    const rows = (0, db_1.getDb)()
        .prepare(`SELECT from_id, COUNT(*) AS n FROM (
         SELECT from_id FROM private_messages
          WHERE to_id = ? AND read_at IS NULL AND deleted_at IS NULL
         UNION ALL
         SELECT from_id FROM private_files
          WHERE to_id = ? AND read_at IS NULL
       )
       GROUP BY from_id`)
        .all(userId, userId);
    const counts = {};
    for (const row of rows) {
        const n = Number(row.n);
        if (n > 0)
            counts[row.from_id] = n;
    }
    return counts;
};
exports.getUnreadCounts = getUnreadCounts;
exports.SEARCH_PAGE_SIZE = 30;
/**
 * Full-text search across the requester's conversations. Only messages where
 * the requester is a participant are returned. The trigram tokenizer matches
 * substrings (e.g. "Directory" finds `getDirectory`); terms shorter than 3
 * chars are filtered with LIKE since trigram cannot index them.
 */
const searchPrivateMessages = (meId, query, options = {}) => {
    const trimmed = query.trim();
    if (trimmed.length < 2)
        return { results: [], hasMore: false };
    const limit = Math.max(1, Math.min(Math.floor(options.limit ?? exports.SEARCH_PAGE_SIZE), 50));
    const { fts, short } = (0, search_1.buildSearchTerms)(trimmed);
    const db = (0, db_1.getDb)();
    const filters = ["m.deleted_at IS NULL", "(m.from_id = ? OR m.to_id = ?)"];
    const params = [meId, meId];
    if (options.withUserId) {
        filters.push("m.conversation_key = ?");
        params.push(conversationKey(meId, options.withUserId));
    }
    for (const term of short) {
        filters.push("m.content LIKE ? ESCAPE '\\'");
        params.push(`%${(0, search_1.escapeLike)(term)}%`);
    }
    let rows;
    if (fts) {
        rows = db
            .prepare(`SELECT m.*, snippet(private_messages_fts, 0, '[[', ']]', '…', 12) AS snip
         FROM private_messages_fts
         JOIN private_messages m ON m.rowid = private_messages_fts.rowid
         WHERE private_messages_fts MATCH ? AND ${filters.join(" AND ")}
         ORDER BY private_messages_fts.rank, m.created_at DESC, m.id DESC
         LIMIT ?`)
            .all(fts, ...params, limit + 1);
    }
    else {
        rows = db
            .prepare(`SELECT m.* FROM private_messages m
         WHERE ${filters.join(" AND ")}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ?`)
            .all(...params, limit + 1);
    }
    const hasMore = rows.length > limit;
    const nicknames = new Map((0, identity_1.listIdentities)().map((identity) => [identity.persistentId, identity.nickname]));
    const results = rows.slice(0, limit).map((row) => {
        const message = rowToMessage(row);
        const partnerId = message.fromId === meId ? message.toId : message.fromId;
        return {
            message,
            partnerId,
            partnerName: nicknames.get(partnerId) || message.fromName,
            snippet: row.snip ?? (0, search_1.makeSnippet)(message.content, trimmed),
        };
    });
    return { results, hasMore };
};
exports.searchPrivateMessages = searchPrivateMessages;
/**
 * Imports legacy local history. Only messages authored by the requester are
 * accepted, so a participant cannot fabricate the other side's words.
 */
const importLocalMessages = (myId, withUserId, raw) => {
    if (!Array.isArray(raw) || !withUserId)
        return 0;
    const db = (0, db_1.getDb)();
    const key = conversationKey(myId, withUserId);
    const insert = db.prepare(`INSERT OR IGNORE INTO private_messages
      (id, conversation_key, from_id, to_id, from_name, content, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const now = Date.now();
    let imported = 0;
    (0, db_1.withTransaction)(() => {
        for (const item of raw.slice(0, limits_1.MAX_IMPORT_MESSAGES)) {
            if (!item || typeof item !== "object")
                continue;
            const m = item;
            if (typeof m.id !== "string" || !m.id)
                continue;
            if (m.fromId !== myId || m.toId !== withUserId)
                continue;
            if (typeof m.content !== "string" || !m.content || m.content.length > limits_1.MAX_CONTENT_LENGTH)
                continue;
            const createdAt = typeof m.createdAt === "number" && Number.isFinite(m.createdAt) ? m.createdAt : now;
            if (createdAt > now + 60 * 60 * 1000)
                continue;
            const reply = (0, types_1.sanitizeReplyRef)(m.replyTo);
            const info = insert.run(m.id.slice(0, 40), key, myId, withUserId, typeof m.fromName === "string" ? m.fromName.slice(0, 60) : "", m.content, reply ? JSON.stringify(reply) : null, createdAt);
            imported += Number(info.changes);
        }
    });
    return imported;
};
exports.importLocalMessages = importLocalMessages;
// --- Private files ---
const addPrivateFile = (file) => {
    const retention = (0, config_1.getRetentionMs)();
    const expiresAt = retention > 0 ? file.createdAt + retention : null;
    (0, db_1.getDb)()
        .prepare(`INSERT OR REPLACE INTO private_files
        (id, conversation_key, from_id, to_id, from_name, name, size, type, path, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(file.id, conversationKey(file.fromId, file.toId), file.fromId, file.toId, file.fromName, file.name, file.size, file.type, file.path, file.createdAt, expiresAt);
};
exports.addPrivateFile = addPrivateFile;
const getPrivateFiles = (userId1, userId2) => {
    const rows = (0, db_1.getDb)()
        .prepare(`SELECT * FROM private_files WHERE conversation_key = ?
       ORDER BY created_at ASC`)
        .all(conversationKey(userId1, userId2));
    return rows.map(rowToFile);
};
exports.getPrivateFiles = getPrivateFiles;
const getPrivateFileById = (fileId) => {
    const row = (0, db_1.getDb)()
        .prepare(`SELECT * FROM private_files WHERE id = ?`)
        .get(fileId);
    return row ? rowToFile(row) : undefined;
};
exports.getPrivateFileById = getPrivateFileById;
const deletePrivateFile = (fromId, toId, fileId) => {
    const db = (0, db_1.getDb)();
    const key = conversationKey(fromId, toId);
    const row = db
        .prepare(`SELECT * FROM private_files WHERE id = ? AND conversation_key = ?`)
        .get(fileId, key);
    if (!row || row.from_id !== fromId)
        return undefined;
    db.prepare(`DELETE FROM private_files WHERE id = ?`).run(fileId);
    return rowToFile(row);
};
exports.deletePrivateFile = deletePrivateFile;
const removePrivateFileById = (fileId) => {
    (0, db_1.getDb)().prepare(`DELETE FROM private_files WHERE id = ?`).run(fileId);
};
exports.removePrivateFileById = removePrivateFileById;
/**
 * Deletes expired files (row + disk) and rows whose file is gone.
 */
const purgeExpiredFiles = () => {
    const db = (0, db_1.getDb)();
    const now = Date.now();
    const retention = (0, config_1.getRetentionMs)();
    const rows = db
        .prepare(`SELECT id, path, created_at, expires_at FROM private_files`)
        .all();
    const remove = db.prepare(`DELETE FROM private_files WHERE id = ?`);
    let removed = 0;
    (0, db_1.withTransaction)(() => {
        for (const row of rows) {
            const expiresAt = row.expires_at ?? (retention > 0 ? Number(row.created_at) + retention : null);
            const expired = expiresAt !== null && expiresAt <= now;
            const missing = !fs_1.default.existsSync(row.path);
            if (!expired && !missing)
                continue;
            if (!missing) {
                try {
                    fs_1.default.unlinkSync(row.path);
                }
                catch {
                    // ignore unlink errors
                }
            }
            remove.run(row.id);
            removed++;
        }
    });
    return removed;
};
exports.purgeExpiredFiles = purgeExpiredFiles;
/**
 * Removes upload files that are not referenced by any private-file row
 * (room uploads from previous runs, leftovers).
 */
const removeOrphanUploads = () => {
    const dir = (0, paths_1.getUploadDir)();
    if (!fs_1.default.existsSync(dir))
        return 0;
    const known = new Set((0, db_1.getDb)().prepare(`SELECT path FROM private_files`).all().map((r) => path_1.default.basename(r.path)));
    const reserved = new Set([
        "data.db",
        "data.db-wal",
        "data.db-shm",
        "private-files.json",
        "identities.json",
        ".identity-secret",
        "tls-cert.pem",
        "tls-key.pem",
    ]);
    let removed = 0;
    for (const entry of fs_1.default.readdirSync(dir)) {
        if (reserved.has(entry) || entry.endsWith(".migrated"))
            continue;
        const full = path_1.default.join(dir, entry);
        try {
            if (!fs_1.default.statSync(full).isFile())
                continue;
        }
        catch {
            continue;
        }
        if (known.has(entry))
            continue;
        try {
            fs_1.default.unlinkSync(full);
            removed++;
        }
        catch {
            // ignore
        }
    }
    return removed;
};
exports.removeOrphanUploads = removeOrphanUploads;
/**
 * One-time import of the legacy private-files.json metadata into SQLite.
 */
const migrateLegacyPrivateFiles = () => {
    const metaFile = (0, paths_1.getLegacyFilesMetaFile)();
    if (!fs_1.default.existsSync(metaFile))
        return;
    const db = (0, db_1.getDb)();
    const count = db.prepare(`SELECT COUNT(*) AS n FROM private_files`).get();
    if (Number(count.n) > 0)
        return;
    try {
        const stored = JSON.parse(fs_1.default.readFileSync(metaFile, "utf-8"));
        if (Array.isArray(stored)) {
            const retention = (0, config_1.getRetentionMs)();
            const insert = db.prepare(`INSERT OR IGNORE INTO private_files
          (id, conversation_key, from_id, to_id, from_name, name, size, type, path, created_at, expires_at, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            (0, db_1.withTransaction)(() => {
                for (const file of stored) {
                    if (!file || !file.id || !file.fromId || !file.toId || !file.path)
                        continue;
                    if (!fs_1.default.existsSync(file.path))
                        continue;
                    const createdAt = typeof file.createdAt === "number" ? file.createdAt : Date.now();
                    insert.run(file.id, conversationKey(file.fromId, file.toId), file.fromId, file.toId, file.fromName || "", file.name || "unknown", typeof file.size === "number" ? file.size : 0, file.type || "application/octet-stream", file.path, createdAt, retention > 0 ? createdAt + retention : null, createdAt);
                }
            });
        }
        fs_1.default.renameSync(metaFile, `${metaFile}.migrated`);
        console.log("📦 Metadatos de archivos privados migrados a SQLite");
    }
    catch (e) {
        console.error("Error migrando private-files.json:", e);
    }
};
exports.migrateLegacyPrivateFiles = migrateLegacyPrivateFiles;
