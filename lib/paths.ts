import fs from "fs";
import os from "os";
import path from "path";

let cachedDataDir: string | null = null;

/**
 * Stable data directory resolution:
 *   1. WFS_DATA_DIR (explicit override)
 *   2. Legacy ./wifi-sharer-uploads when it already exists (backwards compatible)
 *   3. ~/.wifi-file-sharer (stable across working directories)
 */
export function getDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  const envDir = process.env.WFS_DATA_DIR;
  if (envDir && envDir.trim()) {
    cachedDataDir = path.resolve(envDir.trim());
    return cachedDataDir;
  }

  const legacy = path.join(process.cwd(), "wifi-sharer-uploads");
  if (fs.existsSync(legacy)) {
    cachedDataDir = legacy;
    return cachedDataDir;
  }

  cachedDataDir = path.join(os.homedir(), ".wifi-file-sharer");
  return cachedDataDir;
}

export function ensureDataDir(): string {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), "data.db");
}

/** Uploaded files live at the root of the data dir (legacy layout compatible) */
export function getUploadDir(): string {
  return getDataDir();
}

export function getSecretFile(): string {
  return path.join(getDataDir(), ".identity-secret");
}

export function getLegacyRegistryFile(): string {
  return path.join(getDataDir(), "identities.json");
}

export function getLegacyFilesMetaFile(): string {
  return path.join(getDataDir(), "private-files.json");
}

export function getTlsCertFile(): string {
  return path.join(getDataDir(), "tls-cert.pem");
}

export function getTlsKeyFile(): string {
  return path.join(getDataDir(), "tls-key.pem");
}
