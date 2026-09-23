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
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pf_conv_created ON private_files (conversation_key, created_at);
CREATE INDEX IF NOT EXISTS idx_pf_expires ON private_files (expires_at);
`;

export function initDb(): DatabaseSync {
  if (db) return db;
  ensureDataDir();
  db = new DatabaseSync(getDbPath());
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  migrateSchema(db);
  db.exec("PRAGMA user_version = 2");
  return db;
}

function hasColumn(database: DatabaseSync, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}

function migrateSchema(database: DatabaseSync): void {
  if (!hasColumn(database, "users", "discoverable")) {
    database.exec(`ALTER TABLE users ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1`);
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
