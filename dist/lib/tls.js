"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTlsMaterial = resolveTlsMaterial;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const selfsigned_1 = __importDefault(require("selfsigned"));
const paths_1 = require("./paths");
function envFlag(value) {
    return value === "1" || value?.toLowerCase() === "true";
}
/**
 * Resolves TLS material:
 *   1. Explicit cert/key (CLI flags or WFS_TLS_CERT/WFS_TLS_KEY) → always HTTPS
 *   2. WFS_HTTPS/--https without cert → auto self-signed (generated once and
 *      reused from the data dir)
 *   3. Otherwise → HTTP
 */
async function resolveTlsMaterial(options = {}) {
    const certPath = options.certPath || process.env.WFS_TLS_CERT;
    const keyPath = options.keyPath || process.env.WFS_TLS_KEY;
    if (certPath && keyPath) {
        return {
            cert: fs_1.default.readFileSync(certPath),
            key: fs_1.default.readFileSync(keyPath),
        };
    }
    const httpsEnabled = options.https === true || envFlag(process.env.WFS_HTTPS);
    if (!httpsEnabled)
        return null;
    const certFile = (0, paths_1.getTlsCertFile)();
    const keyFile = (0, paths_1.getTlsKeyFile)();
    if (fs_1.default.existsSync(certFile) && fs_1.default.existsSync(keyFile)) {
        return {
            cert: fs_1.default.readFileSync(certFile),
            key: fs_1.default.readFileSync(keyFile),
        };
    }
    (0, paths_1.ensureDataDir)();
    const altNames = [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
    ];
    for (const interfaces of Object.values(os_1.default.networkInterfaces())) {
        for (const iface of interfaces ?? []) {
            if (iface.family === "IPv4" && !iface.internal) {
                altNames.push({ type: 7, ip: iface.address });
            }
        }
    }
    const notAfterDate = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
    const pems = await selfsigned_1.default.generate([{ name: "commonName", value: "wifi-file-sharer" }], {
        notAfterDate,
        keySize: 2048,
        algorithm: "sha256",
        extensions: [{ name: "subjectAltName", altNames }],
    });
    fs_1.default.writeFileSync(certFile, pems.cert, { mode: 0o644 });
    fs_1.default.writeFileSync(keyFile, pems.private, { mode: 0o600 });
    console.log("🔐 Certificado autofirmado generado en", certFile);
    return { cert: Buffer.from(pems.cert), key: Buffer.from(pems.private) };
}
