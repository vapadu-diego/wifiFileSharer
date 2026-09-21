"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataDir = getDataDir;
exports.ensureDataDir = ensureDataDir;
exports.getDbPath = getDbPath;
exports.getUploadDir = getUploadDir;
exports.getSecretFile = getSecretFile;
exports.getLegacyRegistryFile = getLegacyRegistryFile;
exports.getLegacyFilesMetaFile = getLegacyFilesMetaFile;
exports.getTlsCertFile = getTlsCertFile;
exports.getTlsKeyFile = getTlsKeyFile;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
let cachedDataDir = null;
/**
 * Stable data directory resolution:
 *   1. WFS_DATA_DIR (explicit override)
 *   2. Legacy ./wifi-sharer-uploads when it already exists (backwards compatible)
 *   3. ~/.wifi-file-sharer (stable across working directories)
 */
function getDataDir() {
    if (cachedDataDir)
        return cachedDataDir;
    const envDir = process.env.WFS_DATA_DIR;
    if (envDir && envDir.trim()) {
        cachedDataDir = path_1.default.resolve(envDir.trim());
        return cachedDataDir;
    }
    const legacy = path_1.default.join(process.cwd(), "wifi-sharer-uploads");
    if (fs_1.default.existsSync(legacy)) {
        cachedDataDir = legacy;
        return cachedDataDir;
    }
    cachedDataDir = path_1.default.join(os_1.default.homedir(), ".wifi-file-sharer");
    return cachedDataDir;
}
function ensureDataDir() {
    const dir = getDataDir();
    fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function getDbPath() {
    return path_1.default.join(getDataDir(), "data.db");
}
/** Uploaded files live at the root of the data dir (legacy layout compatible) */
function getUploadDir() {
    return getDataDir();
}
function getSecretFile() {
    return path_1.default.join(getDataDir(), ".identity-secret");
}
function getLegacyRegistryFile() {
    return path_1.default.join(getDataDir(), "identities.json");
}
function getLegacyFilesMetaFile() {
    return path_1.default.join(getDataDir(), "private-files.json");
}
function getTlsCertFile() {
    return path_1.default.join(getDataDir(), "tls-cert.pem");
}
function getTlsKeyFile() {
    return path_1.default.join(getDataDir(), "tls-key.pem");
}
