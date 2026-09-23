const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_PURGE_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ROOM_TEXTS = 1000;

export const MIN_NODE_VERSION = "23.4.0";

/**
 * File retention window in milliseconds. `0` means keep files forever.
 * Accepts fractional days so tests can use short windows.
 */
export function getRetentionMs(): number {
  const raw = process.env.FILE_RETENTION_DAYS;
  const days = raw === undefined || raw.trim() === "" ? DEFAULT_RETENTION_DAYS : Number.parseFloat(raw);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * File retention window in days. `0` means keep files forever. Kept in sync
 * with `getRetentionMs` (fractional days are allowed).
 */
export function getRetentionDays(): number {
  const ms = getRetentionMs();
  return ms > 0 ? ms / (24 * 60 * 60 * 1000) : 0;
}

export function getPurgeIntervalMs(): number {
  const raw = Number.parseInt(process.env.WFS_PURGE_INTERVAL_MS || "", 10);
  return Number.isFinite(raw) && raw >= 250 ? raw : DEFAULT_PURGE_INTERVAL_MS;
}

export function getMaxRoomTexts(): number {
  const raw = Number.parseInt(process.env.WFS_MAX_ROOM_TEXTS || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_ROOM_TEXTS;
}

/**
 * `node:sqlite` is only available (without flags) from Node 23.4.
 */
export function checkNodeVersion(): void {
  const [major, minor] = process.versions.node.split(".").map((n) => Number.parseInt(n, 10));
  if (major > 23 || (major === 23 && minor >= 4)) return;
  console.error(
    `\n❌ Este servidor requiere Node.js >= ${MIN_NODE_VERSION} (usa node:sqlite).\n` +
      `   Versión actual: ${process.versions.node}\n` +
      `   Actualiza Node.js o usa la variante con better-sqlite3.\n`
  );
  process.exit(1);
}
