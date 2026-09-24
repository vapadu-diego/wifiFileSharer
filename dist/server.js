"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const http_1 = require("http");
const https_1 = require("https");
const url_1 = require("url");
const next_1 = __importDefault(require("next"));
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const os_1 = __importDefault(require("os"));
const formidable_1 = __importDefault(require("formidable"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const socket_1 = require("./lib/socket");
const rooms_1 = require("./lib/rooms");
const privateChatRepo_1 = require("./lib/privateChatRepo");
const presence_1 = require("./lib/presence");
const identity_1 = require("./lib/identity");
const db_1 = require("./lib/db");
const paths_1 = require("./lib/paths");
const config_1 = require("./lib/config");
const tls_1 = require("./lib/tls");
const types_1 = require("./lib/types");
const limits_1 = require("./lib/limits");
function getRequestIdentity(req) {
    const headerToken = req.headers["x-auth-token"];
    const queryToken = req.query.token;
    const cookieToken = getCookie(req.headers.cookie, "wfs_token");
    const token = (typeof headerToken === "string" ? headerToken : undefined) ||
        (typeof queryToken === "string" ? queryToken : undefined) ||
        cookieToken;
    if (!token)
        return undefined;
    return (0, identity_1.verifyTokenSelf)(token);
}
function getCookie(header, name) {
    if (!header)
        return undefined;
    const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
}
function findRoomMember(roomId, persistentId) {
    const room = (0, rooms_1.getRoom)(roomId);
    if (!room)
        return undefined;
    const member = room.users.find((u) => u.persistentId === persistentId);
    if (!member)
        return undefined;
    return { room, member };
}
/**
 * Reads a text/code file for in-chat preview. Rejects binaries (NUL byte) and
 * files larger than MAX_PREVIEW_BYTES; HTML/XML are returned as data, never
 * served inline, so they cannot execute.
 */
function buildFilePreview(filePath, name, type) {
    const language = (0, types_1.getPreviewLanguage)(name, type);
    if (!language)
        return { ok: false, reason: "not-previewable" };
    let fd;
    try {
        fd = fs_1.default.openSync(filePath, "r");
    }
    catch {
        return { ok: false, reason: "missing" };
    }
    try {
        const size = fs_1.default.fstatSync(fd).size;
        if (size > limits_1.MAX_PREVIEW_BYTES)
            return { ok: false, reason: "too-large" };
        const buffer = Buffer.alloc(size);
        fs_1.default.readSync(fd, buffer, 0, size, 0);
        if (buffer.subarray(0, Math.min(size, 8192)).includes(0)) {
            return { ok: false, reason: "binary" };
        }
        return { ok: true, name, size, language, content: buffer.toString("utf-8"), truncated: false };
    }
    finally {
        fs_1.default.closeSync(fd);
    }
}
async function startServer(options) {
    (0, config_1.checkNodeVersion)();
    // CLI --data-dir must win over legacy detection
    if (options.dataDir) {
        process.env.WFS_DATA_DIR = path_1.default.resolve(options.dataDir);
    }
    let { port } = options;
    const { hostname } = options;
    // Ensure we find the Next.js app directory correctly
    // In dev (server.ts), it's the current dir. In prod (dist/server.js), it's one level up.
    const isDist = __dirname.endsWith("dist");
    const dev = process.env.NODE_ENV === "development" || (!isDist && process.env.NODE_ENV !== "production");
    const dir = isDist ? path_1.default.join(__dirname, "..") : __dirname;
    const app = (0, next_1.default)({ dev, hostname, port, dir });
    const handle = app.getRequestHandler();
    await app.prepare();
    // --- Data layer ---
    (0, paths_1.ensureDataDir)();
    (0, db_1.initDb)();
    (0, identity_1.migrateLegacyIdentities)();
    (0, privateChatRepo_1.migrateLegacyPrivateFiles)();
    console.log(`📂 Datos:  ${(0, paths_1.getDataDir)()}`);
    const purgeExpired = () => {
        try {
            const files = (0, privateChatRepo_1.purgeExpiredFiles)();
            const tombstones = (0, privateChatRepo_1.pruneDeletedMessages)();
            if (files > 0 || tombstones > 0) {
                console.log(`🧹 Retención: ${files} archivo(s) y ${tombstones} mensaje(s) purgados`);
            }
        }
        catch (e) {
            console.error("Error en la purga de retención:", e);
        }
    };
    purgeExpired();
    (0, privateChatRepo_1.removeOrphanUploads)();
    const purgeTimer = setInterval(purgeExpired, (0, config_1.getPurgeIntervalMs)());
    const server = (0, express_1.default)();
    const tls = await (0, tls_1.resolveTlsMaterial)({
        https: options.https,
        certPath: options.tlsCert,
        keyPath: options.tlsKey,
    });
    const httpServer = tls
        ? (0, https_1.createServer)({ key: tls.key, cert: tls.cert }, server)
        : (0, http_1.createServer)(server);
    const io = new socket_io_1.Server(httpServer, {
        // Only same-origin browser connections are accepted (mitigates DNS rebinding)
        cors: { origin: false },
        allowRequest: (req, callback) => {
            const origin = req.headers.origin;
            if (!origin) {
                callback(null, true);
                return;
            }
            try {
                const originHost = new URL(origin).host;
                callback(null, originHost === req.headers.host);
            }
            catch {
                callback(null, false);
            }
        },
    });
    // Security headers for every response
    server.use((_req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (tls)
            res.setHeader("Strict-Transport-Security", "max-age=15552000");
        next();
    });
    // Every /api endpoint requires a valid identity token
    server.use("/api", (req, res, next) => {
        const identity = getRequestIdentity(req);
        if (!identity) {
            res.status(401).json({ error: "No autorizado" });
            return;
        }
        req.persistentId = identity;
        next();
    });
    // Setup Socket.io events
    (0, socket_1.setupSocket)(io);
    global.io = io;
    const uploadDir = (0, paths_1.getUploadDir)();
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
    // Upload Endpoint
    server.post("/api/upload", (req, res) => {
        const identity = req.persistentId;
        const form = (0, formidable_1.default)({
            uploadDir: uploadDir,
            keepExtensions: true,
            maxFileSize: 500 * 1024 * 1024, // Server max: 500MB
        });
        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error("Upload error:", err);
                res.status(500).json({ error: "Upload failed" });
                return;
            }
            const roomId = Array.isArray(fields.roomId) ? fields.roomId[0] : fields.roomId;
            const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
            if (!roomId || !uploadedFile) {
                res.status(400).json({ error: "Missing fields" });
                return;
            }
            const membership = findRoomMember(roomId, identity);
            if (!membership) {
                fs_1.default.unlinkSync(uploadedFile.filepath);
                res.status(403).json({ error: "No perteneces a esta sala" });
                return;
            }
            const { room, member } = membership;
            if (room.files.length >= limits_1.MAX_ROOM_FILES) {
                fs_1.default.unlinkSync(uploadedFile.filepath);
                res.status(413).json({ error: "La sala alcanzó el límite de archivos" });
                return;
            }
            if (uploadedFile.size > room.settings.maxFileSize) {
                fs_1.default.unlinkSync(uploadedFile.filepath);
                const maxMB = Math.round(room.settings.maxFileSize / 1024 / 1024);
                res.status(413).json({ error: `Archivo demasiado grande. Máximo: ${maxMB}MB` });
                return;
            }
            const sharedFile = {
                id: uploadedFile.newFilename,
                name: uploadedFile.originalFilename || "unknown",
                size: uploadedFile.size,
                type: uploadedFile.mimetype || "application/octet-stream",
                // Socket id, like `send_text`, so the uploader is recognized on the client
                senderId: (0, presence_1.getSocketId)(identity) || identity,
                senderName: member.nickname,
                path: uploadedFile.filepath,
                createdAt: Date.now(),
            };
            (0, rooms_1.addFileToRoom)(roomId, sharedFile);
            io.to(roomId).emit("file_uploaded", sharedFile);
            const updatedRoom = (0, rooms_1.getRoom)(roomId);
            if (updatedRoom)
                io.to(roomId).emit("room_updated", (0, rooms_1.serializeRoomMeta)(updatedRoom));
            res.json({ success: true, file: sharedFile });
        });
    });
    // Private Upload Endpoint
    server.post("/api/upload-private", (req, res) => {
        const identity = req.persistentId;
        const form = (0, formidable_1.default)({
            uploadDir: uploadDir,
            keepExtensions: true,
            maxFileSize: 500 * 1024 * 1024,
        });
        form.parse(req, (err, fields, files) => {
            if (err) {
                res.status(500).json({ error: "Upload failed" });
                return;
            }
            const toId = Array.isArray(fields.toId) ? fields.toId[0] : fields.toId;
            const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
            if (!toId || !uploadedFile) {
                res.status(400).json({ error: "Missing fields" });
                return;
            }
            if (toId !== identity && !(0, identity_1.isRegisteredIdentity)(toId)) {
                fs_1.default.unlinkSync(uploadedFile.filepath);
                res.status(404).json({ error: "Destinatario desconocido" });
                return;
            }
            if ((0, privateChatRepo_1.getPrivateFiles)(identity, toId).length >= limits_1.MAX_CONVERSATION_FILES) {
                fs_1.default.unlinkSync(uploadedFile.filepath);
                res.status(413).json({ error: "La conversación alcanzó el límite de archivos" });
                return;
            }
            const privateFile = {
                id: uploadedFile.newFilename,
                name: uploadedFile.originalFilename || "unknown",
                size: uploadedFile.size,
                type: uploadedFile.mimetype || "application/octet-stream",
                fromId: identity,
                toId,
                fromName: (0, presence_1.getUser)(identity)?.nickname || "Usuario",
                path: uploadedFile.filepath,
                createdAt: Date.now(),
            };
            (0, privateChatRepo_1.addPrivateFile)(privateFile);
            // Notify the recipient via socket
            const targetSocketId = (0, presence_1.getSocketId)(toId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("private_file", privateFile);
            }
            res.json({ success: true, file: privateFile });
        });
    });
    // Private Download Endpoint
    server.get("/api/download-private/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const file = (0, privateChatRepo_1.getPrivateFileById)(fileId);
        if (!file || (file.fromId !== identity && file.toId !== identity)) {
            res.status(404).send("File not found or expired");
            return;
        }
        if (!fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found or expired");
            return;
        }
        res.download(file.path, file.name);
    });
    // Private File Status Endpoint (checks if the file still exists)
    server.get("/api/private-file-status/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const file = (0, privateChatRepo_1.getPrivateFileById)(fileId);
        if (!file || (file.fromId !== identity && file.toId !== identity)) {
            res.json({ exists: false });
            return;
        }
        const exists = fs_1.default.existsSync(file.path);
        res.json({ exists });
    });
    // Private Preview Endpoint
    server.get("/api/preview-private/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const file = (0, privateChatRepo_1.getPrivateFileById)(fileId);
        if (!file || (file.fromId !== identity && file.toId !== identity) || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found");
            return;
        }
        if (!file.type.startsWith("image/")) {
            res.status(400).send("Not an image");
            return;
        }
        res.setHeader("Content-Type", file.type);
        res.setHeader("Cache-Control", "private, max-age=3600");
        fs_1.default.createReadStream(file.path).pipe(res);
    });
    // Private code/text preview (data only, rendered escaped by the client)
    server.get("/api/file-content-private/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const file = (0, privateChatRepo_1.getPrivateFileById)(fileId);
        if (!file || (file.fromId !== identity && file.toId !== identity)) {
            res.status(404).json({ ok: false, reason: "missing" });
            return;
        }
        res.json(buildFilePreview(file.path, file.name, file.type));
    });
    // Room code/text preview
    server.get("/api/file-content/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const { roomId } = req.query;
        const membership = typeof roomId === "string" ? findRoomMember(roomId, identity) : undefined;
        if (!membership) {
            res.status(404).json({ ok: false, reason: "missing" });
            return;
        }
        const file = membership.room.files.find((f) => f.id === fileId);
        if (!file) {
            res.status(404).json({ ok: false, reason: "missing" });
            return;
        }
        res.json(buildFilePreview(file.path, file.name, file.type));
    });
    // Download Endpoint
    server.get("/api/download/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const { roomId } = req.query;
        const membership = typeof roomId === "string" ? findRoomMember(roomId, identity) : undefined;
        if (!membership) {
            res.status(404).send("Room not found");
            return;
        }
        const file = membership.room.files.find(f => f.id === fileId);
        if (!file || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found or expired");
            return;
        }
        res.download(file.path, file.name);
    });
    // Preview Endpoint
    server.get("/api/preview/:fileId", (req, res) => {
        const identity = req.persistentId;
        const { fileId } = req.params;
        const { roomId } = req.query;
        const membership = typeof roomId === "string" ? findRoomMember(roomId, identity) : undefined;
        if (!membership) {
            res.status(404).send("Room not found");
            return;
        }
        const file = membership.room.files.find(f => f.id === fileId);
        if (!file || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found");
            return;
        }
        if (!file.type.startsWith("image/")) {
            res.status(400).send("Not an image");
            return;
        }
        res.setHeader("Content-Type", file.type);
        res.setHeader("Cache-Control", "private, max-age=3600");
        fs_1.default.createReadStream(file.path).pipe(res);
    });
    // Next.js Handler
    server.all(/(.*)/, (req, res) => {
        const parsedUrl = (0, url_1.parse)(req.url, true);
        handle(req, res, parsedUrl);
    });
    const tryListen = (currentPort) => {
        httpServer.listen(currentPort, hostname);
    };
    httpServer.on("listening", async () => {
        const address = httpServer.address();
        const actualPort = typeof address === "string" ? port : address?.port || port;
        // Get local IP address using native 'os' module
        const networkInterfaces = os_1.default.networkInterfaces();
        let localIp = "localhost";
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            if (interfaces) {
                for (const iface of interfaces) {
                    if (iface.family === "IPv4" && !iface.internal) {
                        localIp = iface.address;
                        break;
                    }
                }
            }
            if (localIp !== "localhost")
                break;
        }
        const scheme = tls ? "https" : "http";
        const url = `${scheme}://localhost:${actualPort}`;
        console.log(`\n🚀 Wifi File Sharer is running!`);
        console.log(`📡 Local:   ${url}`);
        console.log(`🌐 Network: ${scheme}://${localIp}:${actualPort}`);
        if (tls && !options.tlsCert && !process.env.WFS_TLS_CERT) {
            console.log("🔐 HTTPS con certificado autofirmado (el navegador pedirá aceptarlo)");
        }
        console.log("");
        if (!dev && !process.env.WFS_NO_OPEN) {
            const open = (await Promise.resolve().then(() => __importStar(require("open")))).default;
            try {
                await open(url);
            }
            catch {
                // Silently fail if browser can't open
            }
        }
    });
    httpServer.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            const addr = httpServer.address();
            const nextPort = typeof addr === "object" && addr ? addr.port : port + 1;
            console.log(`⚠️  Puerto ocupado, probando con ${nextPort}...`);
            port = nextPort;
            tryListen(port);
        }
        else {
            console.error("Fallo crítico al iniciar el servidor:", err);
            process.exit(1);
        }
    });
    // Graceful shutdown
    const shutdown = () => {
        clearInterval(purgeTimer);
        try {
            httpServer.close();
        }
        catch {
            // ignore
        }
        (0, db_1.closeDb)();
        process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    tryListen(port);
}
// Start if run directly
if (require.main === module) {
    const port = parseInt(process.env.PORT || "5000", 10);
    startServer({ port, hostname: "0.0.0.0" });
}
