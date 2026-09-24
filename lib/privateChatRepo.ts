import fs from "fs";
import path from "path";
import { getDb, withTransaction } from "./db";
import { getUploadDir, getLegacyFilesMetaFile } from "./paths";
import { getRetentionMs } from "./config";
import { listIdentities } from "./identity";
import { PrivateFile, PrivateMessage, sanitizeReplyRef } from "./types";
import { buildSearchTerms, escapeLike, makeSnippet } from "./search";
import {
  MAX_CONTENT_LENGTH,
  MAX_IMPORT_MESSAGES,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  TOMBSTONE_RETENTION_MS,
} from "./limits";

export function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export interface MessageCursor {
  createdAt: number;
  id: string;
}

export interface PageOptions {
  before?: MessageCursor;
  after?: MessageCursor;
  limit?: number;
}

interface MessageRow {
  id: string;
  from_id: string;
  to_id: string;
  from_name: string;
  content: string;
  reply_to: string | null;
  created_at: number;
  updated_at: number | null;
  read_at: number | null;
}

interface FileRow {
  id: string;
  from_id: string;
  to_id: string;
  from_name: string;
  name: string;
  size: number;
  type: string;
  path: string;
  created_at: number;
  expires_at: number | null;
}

function rowToMessage(row: MessageRow): PrivateMessage {
  const msg: PrivateMessage = {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    fromName: row.from_name,
    content: row.content,
    createdAt: Number(row.created_at),
  };
  if (row.updated_at) msg.updatedAt = Number(row.updated_at);
  if (row.read_at) msg.readAt = Number(row.read_at);
  if (row.reply_to) {
    try {
      const reply = sanitizeReplyRef(JSON.parse(row.reply_to));
      if (reply) msg.replyTo = reply;
    } catch {
      // ignore malformed stored reply
    }
  }
  return msg;
}

function rowToFile(row: FileRow): PrivateFile {
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

function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return PAGE_SIZE_DEFAULT;
  return Math.max(1, Math.min(Math.floor(limit), PAGE_SIZE_MAX));
}

// --- Private messages ---

export const addPrivateMessage = (
  fromId: string,
  toId: string,
  fromName: string,
  content: string,
  replyTo?: PrivateMessage["replyTo"]
): PrivateMessage => {
  const msg: PrivateMessage = {
    id: Math.random().toString(36).substr(2, 9),
    fromId,
    toId,
    fromName,
    content,
    createdAt: Date.now(),
  };
  if (replyTo) msg.replyTo = replyTo;

  getDb()
    .prepare(
      `INSERT INTO private_messages
        (id, conversation_key, from_id, to_id, from_name, content, reply_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      msg.id,
      conversationKey(fromId, toId),
      fromId,
      toId,
      fromName,
      content,
      replyTo ? JSON.stringify(replyTo) : null,
      msg.createdAt
    );

  return msg;
};

export const getConversationPage = (
  userId1: string,
  userId2: string,
  options: PageOptions = {}
): { messages: PrivateMessage[]; hasMore: boolean } => {
  const limit = clampLimit(options.limit);
  const key = conversationKey(userId1, userId2);
  const base = `SELECT * FROM private_messages WHERE conversation_key = ? AND deleted_at IS NULL`;
  const db = getDb();

  if (options.after) {
    const rows = db
      .prepare(
        `${base} AND (created_at > ? OR (created_at = ? AND id > ?))
         ORDER BY created_at ASC, id ASC LIMIT ?`
      )
      .all(key, options.after.createdAt, options.after.createdAt, options.after.id, limit + 1) as unknown as MessageRow[];
    const hasMore = rows.length > limit;
    return { messages: rows.slice(0, limit).map(rowToMessage), hasMore };
  }

  const before = options.before;
  const rows = before
    ? (db
        .prepare(
          `${base} AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`
        )
        .all(key, before.createdAt, before.createdAt, before.id, limit + 1) as unknown as MessageRow[])
    : (db
        .prepare(`${base} ORDER BY created_at DESC, id DESC LIMIT ?`)
        .all(key, limit + 1) as unknown as MessageRow[]);

  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(rowToMessage), hasMore };
};

export const getConversationSince = (
  userId1: string,
  userId2: string,
  since: number
): PrivateMessage[] => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL AND created_at > ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(conversationKey(userId1, userId2), since) as unknown as MessageRow[];
  return rows.map(rowToMessage);
};

export const getMessageContext = (
  userId1: string,
  userId2: string,
  messageId: string,
  limit?: number
): { messages: PrivateMessage[]; hasMoreBefore: boolean; hasMoreAfter: boolean } | undefined => {
  const db = getDb();
  const key = conversationKey(userId1, userId2);
  const size = clampLimit(limit);

  const target = db
    .prepare(
      `SELECT * FROM private_messages
       WHERE conversation_key = ? AND id = ? AND deleted_at IS NULL`
    )
    .get(key, messageId) as unknown as MessageRow | undefined;
  if (!target) return undefined;

  const beforeRows = db
    .prepare(
      `SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL
         AND (created_at < ? OR (created_at = ? AND id <= ?))
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(key, target.created_at, target.created_at, target.id, size + 1) as unknown as MessageRow[];

  const afterRows = db
    .prepare(
      `SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL
         AND (created_at > ? OR (created_at = ? AND id > ?))
       ORDER BY created_at ASC, id ASC LIMIT ?`
    )
    .all(key, target.created_at, target.created_at, target.id, size + 1) as unknown as MessageRow[];

  const hasMoreBefore = beforeRows.length > size;
  const hasMoreAfter = afterRows.length > size;
  const messages = [
    ...beforeRows.slice(0, size).reverse().map(rowToMessage),
    ...afterRows.slice(0, size).map(rowToMessage),
  ];
  return { messages, hasMoreBefore, hasMoreAfter };
};

export const getPrivateUpdatesSince = (
  userId1: string,
  userId2: string,
  since: number
): { updated: PrivateMessage[]; deleted: string[] } => {
  const key = conversationKey(userId1, userId2);
  const db = getDb();

  const updatedRows = db
    .prepare(
      `SELECT * FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NULL
         AND updated_at IS NOT NULL AND updated_at > ?
       ORDER BY updated_at ASC`
    )
    .all(key, since) as unknown as MessageRow[];

  const deletedRows = db
    .prepare(
      `SELECT id FROM private_messages
       WHERE conversation_key = ? AND deleted_at IS NOT NULL AND deleted_at > ?`
    )
    .all(key, since) as unknown as { id: string }[];

  return {
    updated: updatedRows.map(rowToMessage),
    deleted: deletedRows.map((r) => r.id),
  };
};

export const markConversationRead = (
  readerId: string,
  otherId: string,
  readAt: number = Date.now()
): string[] => {
  const db = getDb();
  const key = conversationKey(readerId, otherId);
  const rows = db
    .prepare(
      `SELECT id FROM private_messages
       WHERE conversation_key = ? AND to_id = ? AND read_at IS NULL AND deleted_at IS NULL`
    )
    .all(key, readerId) as unknown as { id: string }[];
  const fileRows = db
    .prepare(
      `SELECT id FROM private_files
       WHERE conversation_key = ? AND to_id = ? AND read_at IS NULL`
    )
    .all(key, readerId) as unknown as { id: string }[];

  if (rows.length === 0 && fileRows.length === 0) return [];

  const updateMessage = db.prepare(`UPDATE private_messages SET read_at = ? WHERE id = ?`);
  const updateFile = db.prepare(`UPDATE private_files SET read_at = ? WHERE id = ?`);
  withTransaction(() => {
    for (const row of rows) updateMessage.run(readAt, row.id);
    for (const row of fileRows) updateFile.run(readAt, row.id);
  });
  return rows.map((r) => r.id);
};

export const editPrivateMessage = (
  fromId: string,
  toId: string,
  messageId: string,
  newContent: string
): PrivateMessage | undefined => {
  const db = getDb();
  const key = conversationKey(fromId, toId);
  const updatedAt = Date.now();
  const info = db
    .prepare(
      `UPDATE private_messages SET content = ?, updated_at = ?
       WHERE id = ? AND conversation_key = ? AND from_id = ? AND deleted_at IS NULL`
    )
    .run(newContent, updatedAt, messageId, key, fromId);

  if (Number(info.changes) === 0) return undefined;

  const row = db
    .prepare(`SELECT * FROM private_messages WHERE id = ?`)
    .get(messageId) as unknown as MessageRow;
  return rowToMessage(row);
};

export const deletePrivateMessage = (
  fromId: string,
  toId: string,
  messageId: string
): boolean => {
  const info = getDb()
    .prepare(
      `UPDATE private_messages SET deleted_at = ?
       WHERE id = ? AND conversation_key = ? AND from_id = ? AND deleted_at IS NULL`
    )
    .run(Date.now(), messageId, conversationKey(fromId, toId), fromId);
  return Number(info.changes) > 0;
};

export const pruneDeletedMessages = (): number => {
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  const info = getDb()
    .prepare(`DELETE FROM private_messages WHERE deleted_at IS NOT NULL AND deleted_at < ?`)
    .run(cutoff);
  return Number(info.changes);
};

export const getUnreadCounts = (userId: string): Record<string, number> => {
  const rows = getDb()
    .prepare(
      `SELECT from_id, COUNT(*) AS n FROM (
         SELECT from_id FROM private_messages
          WHERE to_id = ? AND read_at IS NULL AND deleted_at IS NULL
         UNION ALL
         SELECT from_id FROM private_files
          WHERE to_id = ? AND read_at IS NULL
       )
       GROUP BY from_id`
    )
    .all(userId, userId) as unknown as { from_id: string; n: number }[];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const n = Number(row.n);
    if (n > 0) counts[row.from_id] = n;
  }
  return counts;
};

export interface PrivateSearchResult {
  message: PrivateMessage;
  partnerId: string;
  partnerName: string;
  snippet: string;
}

export const SEARCH_PAGE_SIZE = 30;

/**
 * Full-text search across the requester's conversations. Only messages where
 * the requester is a participant are returned. The trigram tokenizer matches
 * substrings (e.g. "Directory" finds `getDirectory`); terms shorter than 3
 * chars are filtered with LIKE since trigram cannot index them.
 */
export const searchPrivateMessages = (
  meId: string,
  query: string,
  options: { withUserId?: string; limit?: number } = {}
): { results: PrivateSearchResult[]; hasMore: boolean } => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { results: [], hasMore: false };

  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? SEARCH_PAGE_SIZE), 50));
  const { fts, short } = buildSearchTerms(trimmed);
  const db = getDb();

  const filters: string[] = ["m.deleted_at IS NULL", "(m.from_id = ? OR m.to_id = ?)"];
  const params: string[] = [meId, meId];

  if (options.withUserId) {
    filters.push("m.conversation_key = ?");
    params.push(conversationKey(meId, options.withUserId));
  }
  for (const term of short) {
    filters.push("m.content LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(term)}%`);
  }

  let rows: (MessageRow & { snip?: string })[];
  if (fts) {
    rows = db
      .prepare(
        `SELECT m.*, snippet(private_messages_fts, 0, '[[', ']]', '…', 12) AS snip
         FROM private_messages_fts
         JOIN private_messages m ON m.rowid = private_messages_fts.rowid
         WHERE private_messages_fts MATCH ? AND ${filters.join(" AND ")}
         ORDER BY private_messages_fts.rank, m.created_at DESC, m.id DESC
         LIMIT ?`
      )
      .all(fts, ...params, limit + 1) as unknown as (MessageRow & { snip?: string })[];
  } else {
    rows = db
      .prepare(
        `SELECT m.* FROM private_messages m
         WHERE ${filters.join(" AND ")}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ?`
      )
      .all(...params, limit + 1) as unknown as (MessageRow & { snip?: string })[];
  }

  const hasMore = rows.length > limit;
  const nicknames = new Map(listIdentities().map((identity) => [identity.persistentId, identity.nickname]));

  const results = rows.slice(0, limit).map((row) => {
    const message = rowToMessage(row);
    const partnerId = message.fromId === meId ? message.toId : message.fromId;
    return {
      message,
      partnerId,
      partnerName: nicknames.get(partnerId) || message.fromName,
      snippet: row.snip ?? makeSnippet(message.content, trimmed),
    };
  });

  return { results, hasMore };
};

/**
 * Imports legacy local history. Only messages authored by the requester are
 * accepted, so a participant cannot fabricate the other side's words.
 */
export const importLocalMessages = (
  myId: string,
  withUserId: string,
  raw: unknown
): number => {
  if (!Array.isArray(raw) || !withUserId) return 0;
  const db = getDb();
  const key = conversationKey(myId, withUserId);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO private_messages
      (id, conversation_key, from_id, to_id, from_name, content, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  let imported = 0;

  withTransaction(() => {
    for (const item of raw.slice(0, MAX_IMPORT_MESSAGES)) {
      if (!item || typeof item !== "object") continue;
      const m = item as Partial<PrivateMessage>;
      if (typeof m.id !== "string" || !m.id) continue;
      if (m.fromId !== myId || m.toId !== withUserId) continue;
      if (typeof m.content !== "string" || !m.content || m.content.length > MAX_CONTENT_LENGTH) continue;
      const createdAt =
        typeof m.createdAt === "number" && Number.isFinite(m.createdAt) ? m.createdAt : now;
      if (createdAt > now + 60 * 60 * 1000) continue;
      const reply = sanitizeReplyRef(m.replyTo);
      const info = insert.run(
        m.id.slice(0, 40),
        key,
        myId,
        withUserId,
        typeof m.fromName === "string" ? m.fromName.slice(0, 60) : "",
        m.content,
        reply ? JSON.stringify(reply) : null,
        createdAt
      );
      imported += Number(info.changes);
    }
  });

  return imported;
};

// --- Private files ---

export const addPrivateFile = (file: PrivateFile): void => {
  const retention = getRetentionMs();
  const expiresAt = retention > 0 ? file.createdAt + retention : null;
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO private_files
        (id, conversation_key, from_id, to_id, from_name, name, size, type, path, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      file.id,
      conversationKey(file.fromId, file.toId),
      file.fromId,
      file.toId,
      file.fromName,
      file.name,
      file.size,
      file.type,
      file.path,
      file.createdAt,
      expiresAt
    );
};

export const getPrivateFiles = (userId1: string, userId2: string): PrivateFile[] => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM private_files WHERE conversation_key = ?
       ORDER BY created_at ASC`
    )
    .all(conversationKey(userId1, userId2)) as unknown as FileRow[];
  return rows.map(rowToFile);
};

export const getPrivateFileById = (fileId: string): PrivateFile | undefined => {
  const row = getDb()
    .prepare(`SELECT * FROM private_files WHERE id = ?`)
    .get(fileId) as unknown as FileRow | undefined;
  return row ? rowToFile(row) : undefined;
};

export const deletePrivateFile = (
  fromId: string,
  toId: string,
  fileId: string
): PrivateFile | undefined => {
  const db = getDb();
  const key = conversationKey(fromId, toId);
  const row = db
    .prepare(`SELECT * FROM private_files WHERE id = ? AND conversation_key = ?`)
    .get(fileId, key) as unknown as FileRow | undefined;
  if (!row || row.from_id !== fromId) return undefined;

  db.prepare(`DELETE FROM private_files WHERE id = ?`).run(fileId);
  return rowToFile(row);
};

export const removePrivateFileById = (fileId: string): void => {
  getDb().prepare(`DELETE FROM private_files WHERE id = ?`).run(fileId);
};

/**
 * Deletes expired files (row + disk) and rows whose file is gone.
 */
export const purgeExpiredFiles = (): number => {
  const db = getDb();
  const now = Date.now();
  const retention = getRetentionMs();
  const rows = db
    .prepare(`SELECT id, path, created_at, expires_at FROM private_files`)
    .all() as unknown as { id: string; path: string; created_at: number; expires_at: number | null }[];

  const remove = db.prepare(`DELETE FROM private_files WHERE id = ?`);
  let removed = 0;

  withTransaction(() => {
    for (const row of rows) {
      const expiresAt =
        row.expires_at ?? (retention > 0 ? Number(row.created_at) + retention : null);
      const expired = expiresAt !== null && expiresAt <= now;
      const missing = !fs.existsSync(row.path);
      if (!expired && !missing) continue;
      if (!missing) {
        try {
          fs.unlinkSync(row.path);
        } catch {
          // ignore unlink errors
        }
      }
      remove.run(row.id);
      removed++;
    }
  });

  return removed;
};

/**
 * Removes upload files that are not referenced by any private-file row
 * (room uploads from previous runs, leftovers).
 */
export const removeOrphanUploads = (): number => {
  const dir = getUploadDir();
  if (!fs.existsSync(dir)) return 0;
  const known = new Set(
    (getDb().prepare(`SELECT path FROM private_files`).all() as unknown as { path: string }[]).map(
      (r) => path.basename(r.path)
    )
  );
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
  for (const entry of fs.readdirSync(dir)) {
    if (reserved.has(entry) || entry.endsWith(".migrated")) continue;
    const full = path.join(dir, entry);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    if (known.has(entry)) continue;
    try {
      fs.unlinkSync(full);
      removed++;
    } catch {
      // ignore
    }
  }
  return removed;
};

/**
 * One-time import of the legacy private-files.json metadata into SQLite.
 */
export const migrateLegacyPrivateFiles = (): void => {
  const metaFile = getLegacyFilesMetaFile();
  if (!fs.existsSync(metaFile)) return;

  const db = getDb();
  const count = db.prepare(`SELECT COUNT(*) AS n FROM private_files`).get() as unknown as { n: number };
  if (Number(count.n) > 0) return;

  try {
    const stored = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    if (Array.isArray(stored)) {
      const retention = getRetentionMs();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO private_files
          (id, conversation_key, from_id, to_id, from_name, name, size, type, path, created_at, expires_at, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(() => {
        for (const file of stored as Partial<PrivateFile>[]) {
          if (!file || !file.id || !file.fromId || !file.toId || !file.path) continue;
          if (!fs.existsSync(file.path)) continue;
          const createdAt = typeof file.createdAt === "number" ? file.createdAt : Date.now();
          insert.run(
            file.id,
            conversationKey(file.fromId, file.toId),
            file.fromId,
            file.toId,
            file.fromName || "",
            file.name || "unknown",
            typeof file.size === "number" ? file.size : 0,
            file.type || "application/octet-stream",
            file.path,
            createdAt,
            retention > 0 ? createdAt + retention : null,
            createdAt
          );
        }
      });
    }
    fs.renameSync(metaFile, `${metaFile}.migrated`);
    console.log("📦 Metadatos de archivos privados migrados a SQLite");
  } catch (e) {
    console.error("Error migrando private-files.json:", e);
  }
};
