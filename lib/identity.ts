import fs from "fs";
import crypto from "crypto";
import { getDb, withTransaction } from "./db";
import { ensureDataDir, getSecretFile, getLegacyRegistryFile } from "./paths";

export const PERSISTENT_ID_REGEX = /^[a-zA-Z0-9-]{8,64}$/;

interface IdentityRow {
  persistent_id: string;
  nickname: string;
  issued_at: number;
}

let secret: string | null = null;

function getSecret(): string {
  if (secret) return secret;
  const secretFile = getSecretFile();
  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, "utf-8").trim();
      if (stored.length >= 32) {
        secret = stored;
        return secret;
      }
    }
    secret = crypto.randomBytes(32).toString("hex");
    ensureDataDir();
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch (e) {
    console.error("Error loading identity secret:", e);
    // Ephemeral fallback: tokens are invalidated on restart but the app keeps working
    secret = crypto.randomBytes(32).toString("hex");
  }
  return secret;
}

function computeSignature(persistentId: string, issuedAt: number): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${persistentId}.${issuedAt}`)
    .digest("hex");
}

export function signToken(persistentId: string, issuedAt: number = Date.now()): string {
  const signature = computeSignature(persistentId, issuedAt);
  return Buffer.from(`${persistentId}.${issuedAt}.${signature}`).toString("base64url");
}

/**
 * Verifies a token's signature without knowing the claimed identity.
 * Returns the persistentId when the token is authentic.
 */
export function verifyTokenSelf(token: string): string | undefined {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return undefined;
    const [persistentId, issuedAtRaw, signature] = parts;
    const issuedAt = Number(issuedAtRaw);
    if (!persistentId || !Number.isFinite(issuedAt)) return undefined;

    const expected = computeSignature(persistentId, issuedAt);
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || a.length === 0) return undefined;
    if (!crypto.timingSafeEqual(a, b)) return undefined;

    return persistentId;
  } catch {
    return undefined;
  }
}

export function verifyToken(token: string, persistentId: string): boolean {
  return verifyTokenSelf(token) === persistentId;
}

function getIdentityRow(persistentId: string): IdentityRow | undefined {
  return getDb()
    .prepare(`SELECT persistent_id, nickname, issued_at FROM users WHERE persistent_id = ?`)
    .get(persistentId) as unknown as IdentityRow | undefined;
}

export function isRegisteredIdentity(persistentId: string): boolean {
  return !!getIdentityRow(persistentId);
}

export function getIdentityNickname(persistentId: string): string | undefined {
  return getIdentityRow(persistentId)?.nickname;
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Nicknames starting with the ghost emoji are reserved for the admin ghost.
 */
export function isReservedNickname(nickname: string): boolean {
  return nickname.trim().startsWith("👻");
}

/**
 * True when another registered identity (online or offline) already owns the
 * nickname. Comparison is case-insensitive.
 */
export function isNicknameTaken(nickname: string, exceptPersistentId?: string): boolean {
  const target = normalizeNickname(nickname);
  if (!target) return false;
  const rows = getDb()
    .prepare(`SELECT persistent_id, nickname FROM users`)
    .all() as unknown as { persistent_id: string; nickname: string }[];
  return rows.some(
    (row) => row.persistent_id !== exceptPersistentId && normalizeNickname(row.nickname) === target
  );
}

export type RegisterIdentityResult =
  | { ok: true; token: string; claimed: boolean; nickname: string }
  | { ok: false; error: string };

/**
 * Trust-on-first-use identity registration.
 * The first connection claiming an id receives a signed token; afterwards the
 * token is required, which blocks impersonation from other browsers/devices.
 * For existing identities the stored nickname always wins: it can only be
 * changed through `renameIdentity`.
 */
export function registerIdentity(
  persistentId: string,
  token: string | undefined,
  nickname: string
): RegisterIdentityResult {
  const row = getIdentityRow(persistentId);
  if (row) {
    if (token && verifyToken(token, persistentId)) {
      return { ok: true, token, claimed: false, nickname: row.nickname || nickname };
    }
    return {
      ok: false,
      error:
        "Esta identidad ya está registrada. Úsala desde su navegador original o abre la sesión desde esta ventana.",
    };
  }

  if (isReservedNickname(nickname)) {
    return { ok: false, error: "Ese nombre está reservado" };
  }
  if (isNicknameTaken(nickname)) {
    return { ok: false, error: "Ese nombre ya está en uso en la red" };
  }

  const issuedAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO users (persistent_id, nickname, issued_at, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(persistentId, nickname, issuedAt, issuedAt);
  return { ok: true, token: signToken(persistentId, issuedAt), claimed: true, nickname };
}

export type RenameIdentityResult =
  | { ok: true; nickname: string }
  | { ok: false; error: string };

/**
 * Renames a registered identity. The new nickname must be free across the
 * whole registry (case-insensitive) and cannot use the reserved ghost prefix.
 */
export function renameIdentity(persistentId: string, nickname: string): RenameIdentityResult {
  const row = getIdentityRow(persistentId);
  if (!row) {
    return { ok: false, error: "Identidad no registrada" };
  }
  if (isReservedNickname(nickname)) {
    return { ok: false, error: "Ese nombre está reservado" };
  }
  if (isNicknameTaken(nickname, persistentId)) {
    return { ok: false, error: "Ese nombre ya está en uso en la red" };
  }

  getDb().prepare(`UPDATE users SET nickname = ? WHERE persistent_id = ?`).run(nickname, persistentId);
  return { ok: true, nickname };
}

/**
 * One-time import of the legacy identities.json registry into SQLite.
 */
export function migrateLegacyIdentities(): void {
  const registryFile = getLegacyRegistryFile();
  if (!fs.existsSync(registryFile)) return;

  const db = getDb();
  const count = db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as unknown as { n: number };
  if (Number(count.n) > 0) return;

  try {
    const stored = JSON.parse(fs.readFileSync(registryFile, "utf-8"));
    if (stored && typeof stored === "object") {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO users (persistent_id, nickname, issued_at, created_at) VALUES (?, ?, ?, ?)`
      );
      withTransaction(() => {
        for (const [id, record] of Object.entries(stored)) {
          const rec = record as { issuedAt?: number; nickname?: string };
          if (!id || !PERSISTENT_ID_REGEX.test(id)) continue;
          const issuedAt = typeof rec?.issuedAt === "number" ? rec.issuedAt : Date.now();
          insert.run(id, rec?.nickname || "", issuedAt, issuedAt);
        }
      });
    }
    fs.renameSync(registryFile, `${registryFile}.migrated`);
    console.log("📦 Identidades migradas a SQLite");
  } catch (e) {
    console.error("Error migrando identities.json:", e);
  }
}
