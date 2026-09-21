"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERSISTENT_ID_REGEX = void 0;
exports.signToken = signToken;
exports.verifyTokenSelf = verifyTokenSelf;
exports.verifyToken = verifyToken;
exports.isRegisteredIdentity = isRegisteredIdentity;
exports.getIdentityNickname = getIdentityNickname;
exports.isReservedNickname = isReservedNickname;
exports.isNicknameTaken = isNicknameTaken;
exports.registerIdentity = registerIdentity;
exports.renameIdentity = renameIdentity;
exports.migrateLegacyIdentities = migrateLegacyIdentities;
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const paths_1 = require("./paths");
exports.PERSISTENT_ID_REGEX = /^[a-zA-Z0-9-]{8,64}$/;
let secret = null;
function getSecret() {
    if (secret)
        return secret;
    const secretFile = (0, paths_1.getSecretFile)();
    try {
        if (fs_1.default.existsSync(secretFile)) {
            const stored = fs_1.default.readFileSync(secretFile, "utf-8").trim();
            if (stored.length >= 32) {
                secret = stored;
                return secret;
            }
        }
        secret = crypto_1.default.randomBytes(32).toString("hex");
        (0, paths_1.ensureDataDir)();
        fs_1.default.writeFileSync(secretFile, secret, { mode: 0o600 });
    }
    catch (e) {
        console.error("Error loading identity secret:", e);
        // Ephemeral fallback: tokens are invalidated on restart but the app keeps working
        secret = crypto_1.default.randomBytes(32).toString("hex");
    }
    return secret;
}
function computeSignature(persistentId, issuedAt) {
    return crypto_1.default
        .createHmac("sha256", getSecret())
        .update(`${persistentId}.${issuedAt}`)
        .digest("hex");
}
function signToken(persistentId, issuedAt = Date.now()) {
    const signature = computeSignature(persistentId, issuedAt);
    return Buffer.from(`${persistentId}.${issuedAt}.${signature}`).toString("base64url");
}
/**
 * Verifies a token's signature without knowing the claimed identity.
 * Returns the persistentId when the token is authentic.
 */
function verifyTokenSelf(token) {
    try {
        const decoded = Buffer.from(token, "base64url").toString("utf-8");
        const parts = decoded.split(".");
        if (parts.length !== 3)
            return undefined;
        const [persistentId, issuedAtRaw, signature] = parts;
        const issuedAt = Number(issuedAtRaw);
        if (!persistentId || !Number.isFinite(issuedAt))
            return undefined;
        const expected = computeSignature(persistentId, issuedAt);
        const a = Buffer.from(signature, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || a.length === 0)
            return undefined;
        if (!crypto_1.default.timingSafeEqual(a, b))
            return undefined;
        return persistentId;
    }
    catch {
        return undefined;
    }
}
function verifyToken(token, persistentId) {
    return verifyTokenSelf(token) === persistentId;
}
function getIdentityRow(persistentId) {
    return (0, db_1.getDb)()
        .prepare(`SELECT persistent_id, nickname, issued_at FROM users WHERE persistent_id = ?`)
        .get(persistentId);
}
function isRegisteredIdentity(persistentId) {
    return !!getIdentityRow(persistentId);
}
function getIdentityNickname(persistentId) {
    return getIdentityRow(persistentId)?.nickname;
}
function normalizeNickname(nickname) {
    return nickname.trim().replace(/\s+/g, " ").toLowerCase();
}
/**
 * Nicknames starting with the ghost emoji are reserved for the admin ghost.
 */
function isReservedNickname(nickname) {
    return nickname.trim().startsWith("👻");
}
/**
 * True when another registered identity (online or offline) already owns the
 * nickname. Comparison is case-insensitive.
 */
function isNicknameTaken(nickname, exceptPersistentId) {
    const target = normalizeNickname(nickname);
    if (!target)
        return false;
    const rows = (0, db_1.getDb)()
        .prepare(`SELECT persistent_id, nickname FROM users`)
        .all();
    return rows.some((row) => row.persistent_id !== exceptPersistentId && normalizeNickname(row.nickname) === target);
}
/**
 * Trust-on-first-use identity registration.
 * The first connection claiming an id receives a signed token; afterwards the
 * token is required, which blocks impersonation from other browsers/devices.
 * For existing identities the stored nickname always wins: it can only be
 * changed through `renameIdentity`.
 */
function registerIdentity(persistentId, token, nickname) {
    const row = getIdentityRow(persistentId);
    if (row) {
        if (token && verifyToken(token, persistentId)) {
            return { ok: true, token, claimed: false, nickname: row.nickname || nickname };
        }
        return {
            ok: false,
            error: "Esta identidad ya está registrada. Úsala desde su navegador original o abre la sesión desde esta ventana.",
        };
    }
    if (isReservedNickname(nickname)) {
        return { ok: false, error: "Ese nombre está reservado" };
    }
    if (isNicknameTaken(nickname)) {
        return { ok: false, error: "Ese nombre ya está en uso en la red" };
    }
    const issuedAt = Date.now();
    (0, db_1.getDb)()
        .prepare(`INSERT INTO users (persistent_id, nickname, issued_at, created_at) VALUES (?, ?, ?, ?)`)
        .run(persistentId, nickname, issuedAt, issuedAt);
    return { ok: true, token: signToken(persistentId, issuedAt), claimed: true, nickname };
}
/**
 * Renames a registered identity. The new nickname must be free across the
 * whole registry (case-insensitive) and cannot use the reserved ghost prefix.
 */
function renameIdentity(persistentId, nickname) {
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
    (0, db_1.getDb)().prepare(`UPDATE users SET nickname = ? WHERE persistent_id = ?`).run(nickname, persistentId);
    return { ok: true, nickname };
}
/**
 * One-time import of the legacy identities.json registry into SQLite.
 */
function migrateLegacyIdentities() {
    const registryFile = (0, paths_1.getLegacyRegistryFile)();
    if (!fs_1.default.existsSync(registryFile))
        return;
    const db = (0, db_1.getDb)();
    const count = db.prepare(`SELECT COUNT(*) AS n FROM users`).get();
    if (Number(count.n) > 0)
        return;
    try {
        const stored = JSON.parse(fs_1.default.readFileSync(registryFile, "utf-8"));
        if (stored && typeof stored === "object") {
            const insert = db.prepare(`INSERT OR IGNORE INTO users (persistent_id, nickname, issued_at, created_at) VALUES (?, ?, ?, ?)`);
            (0, db_1.withTransaction)(() => {
                for (const [id, record] of Object.entries(stored)) {
                    const rec = record;
                    if (!id || !exports.PERSISTENT_ID_REGEX.test(id))
                        continue;
                    const issuedAt = typeof rec?.issuedAt === "number" ? rec.issuedAt : Date.now();
                    insert.run(id, rec?.nickname || "", issuedAt, issuedAt);
                }
            });
        }
        fs_1.default.renameSync(registryFile, `${registryFile}.migrated`);
        console.log("📦 Identidades migradas a SQLite");
    }
    catch (e) {
        console.error("Error migrando identities.json:", e);
    }
}
