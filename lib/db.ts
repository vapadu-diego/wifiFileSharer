import { DatabaseSync } from "node:sqlite";
import { getDbPath, ensureDataDir } from "./paths";

let db: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  persistent_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS private_messages (
  id TEXT PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  deleted_at INTEGER,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pm_conv_created ON private_messages (conversation_key, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pm_conv_updated ON private_messages (conversation_key, updated_at);
CREATE INDEX IF NOT EXISTS idx_pm_conv_deleted ON private_messages (conversation_key, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pm_to_unread ON private_messages (to_id, read_at);

CREATE TABLE IF NOT EXISTS private_files (
  id TEXT PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pf_conv_created ON private_files (conversation_key, created_at);
CREATE INDEX IF NOT EXISTS idx_pf_expires ON private_files (expires_at);

-- Full-text search index (trigram: matches substrings inside identifiers)
CREATE VIRTUAL TABLE IF NOT EXISTS private_messages_fts USING fts5(
  content,
  content='private_messages',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS private_messages_fts_ai AFTER INSERT ON private_messages BEGIN
  INSERT INTO private_messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS private_messages_fts_ad AFTER DELETE ON private_messages BEGIN
  INSERT INTO private_messages_fts(private_messages_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS private_messages_fts_au AFTER UPDATE ON private_messages BEGIN
  INSERT INTO private_messages_fts(private_messages_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
  INSERT INTO private_messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`;

const SCHEMA_VERSION = 4;

export function initDb(): DatabaseSync {
  if (db) return db;
  ensureDataDir();
  db = new DatabaseSync(getDbPath());
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  const previousVersion = getUserVersion(db);
  db.exec(SCHEMA);
  migrateSchema(db, previousVersion);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

function getUserVersion(database: DatabaseSync): number {
  const row = database.prepare(`PRAGMA user_version`).get() as unknown as {
    user_version: number;
  };
  return Number(row?.user_version ?? 0);
}

function hasColumn(database: DatabaseSync, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}

function migrateSchema(database: DatabaseSync, previousVersion: number): void {
  if (!hasColumn(database, "users", "discoverable")) {
    database.exec(`ALTER TABLE users ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1`);
  }
  if (!hasColumn(database, "private_files", "read_at")) {
    database.exec(`ALTER TABLE private_files ADD COLUMN read_at INTEGER`);
    // Files created before read tracking existed are already old news.
    database.exec(`UPDATE private_files SET read_at = created_at`);
  }
  // The FTS index is created empty: rebuild it from existing messages once.
  if (previousVersion < 3) {
    database.exec(`INSERT INTO private_messages_fts(private_messages_fts) VALUES('rebuild')`);
  }
}

export function getDb(): DatabaseSync {
  if (!db) return initDb();
  return db;
}

export function closeDb(): void {
  if (!db) return;
  try {
    db.close();
  } catch {
    // already closed
  }
  db = null;
}

export function withTransaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // ignore rollback failures
    }
    throw err;
  }
}
