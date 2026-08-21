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
const presence_1 = require("./lib/presence");
const isDist = __dirname.endsWith("dist");
const dev = process.env.NODE_ENV === "development" || (!isDist && process.env.NODE_ENV !== "production");
async function startServer(options) {
    let { port } = options;
    const { hostname } = options;
    // Ensure we find the Next.js app directory correctly
    // In dev (server.ts), it's the current dir. In prod (dist/server.js), it's one level up.
    const dir = isDist ? path_1.default.join(__dirname, "..") : __dirname;
    const app = (0, next_1.default)({ dev, hostname, port, dir });
    const handle = app.getRequestHandler();
    await app.prepare();
    const server = (0, express_1.default)();
    const httpServer = (0, http_1.createServer)(server);
    const io = new socket_io_1.Server(httpServer);
    // Setup Socket.io events
    (0, socket_1.setupSocket)(io);
    global.io = io;
    // Create temporary upload directory if it doesn't exist and clean it
    const uploadDir = path_1.default.join(process.cwd(), "wifi-sharer-uploads");
    if (fs_1.default.existsSync(uploadDir)) {
        // Cleanup old files on startup
        const files = fs_1.default.readdirSync(uploadDir);
        for (const file of files) {
            try {
                const filePath = path_1.default.join(uploadDir, file);
                if (fs_1.default.statSync(filePath).isFile()) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
            catch (err) {
                console.error(`Error cleaning up file ${file}:`, err);
            }
        }
    }
    else {
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
    }
    // Upload Endpoint
    server.post("/api/upload", (req, res) => {
        const form = (0, formidable_1.default)({
            uploadDir: uploadDir,
            keepExtensions: true,
            maxFileSize: 500 * 1024 * 1024, // Server max: 500MB
        });
        form.parse(req, (err, fields, files) => {
            // ... same logic as before, but using uploadDir ...
            if (err) {
                console.error("Upload error:", err);
                res.status(500).json({ error: "Upload failed" });
                return;
            }
            const roomId = Array.isArray(fields.roomId) ? fields.roomId[0] : fields.roomId;
            const senderId = Array.isArray(fields.senderId) ? fields.senderId[0] : fields.senderId;
            const senderName = Array.isArray(fields.senderName) ? fields.senderName[0] : fields.senderName;
            const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
            if (!roomId || !uploadedFile) {
                res.status(400).json({ error: "Missing fields" });
                return;
            }
            const room = (0, rooms_1.getRoom)(roomId);
            if (!room) {
                fs_1.default.unlinkSync(uploadedFile.filepath);
                res.status(404).json({ error: "Room not found" });
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
                senderId: senderId || "unknown",
                senderName: senderName || "Anonymous",
                path: uploadedFile.filepath,
                createdAt: Date.now(),
            };
            (0, rooms_1.addFileToRoom)(roomId, sharedFile);
            io.to(roomId).emit("file_uploaded", sharedFile);
            io.to(roomId).emit("room_updated", (0, rooms_1.getRoom)(roomId));
            res.json({ success: true, file: sharedFile });
        });
    });
    // Private Upload Endpoint
    server.post("/api/upload-private", (req, res) => {
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
            const fromId = Array.isArray(fields.fromId) ? fields.fromId[0] : fields.fromId;
            const fromName = Array.isArray(fields.fromName) ? fields.fromName[0] : fields.fromName;
            const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
            if (!toId || !fromId || !uploadedFile) {
                res.status(400).json({ error: "Missing fields" });
                return;
            }
            const privateFile = {
                id: uploadedFile.newFilename,
                name: uploadedFile.originalFilename || "unknown",
                size: uploadedFile.size,
                type: uploadedFile.mimetype || "application/octet-stream",
                fromId,
                toId,
                fromName: fromName || "Anonymous",
                path: uploadedFile.filepath,
                createdAt: Date.now(),
            };
            (0, presence_1.addPrivateFile)(privateFile);
            // Notify the recipient via socket
            const _io = global.io;
            if (_io && toId) {
                const targetSocketId = (0, presence_1.getSocketId)(toId);
                if (targetSocketId) {
                    _io.to(targetSocketId).emit("private_file", privateFile);
                }
            }
            res.json({ success: true, file: privateFile });
        });
    });
    // Private Download Endpoint
    server.get("/api/download-private/:fileId", (req, res) => {
        const { fileId } = req.params;
        const file = (0, presence_1.getPrivateFileById)(fileId);
        if (!file || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found or expired");
            return;
        }
        res.download(file.path, file.name);
    });
    // Private Preview Endpoint
    server.get("/api/preview-private/:fileId", (req, res) => {
        const { fileId } = req.params;
        const file = (0, presence_1.getPrivateFileById)(fileId);
        if (!file || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found");
            return;
        }
        if (!file.type.startsWith("image/")) {
            res.status(400).send("Not an image");
            return;
        }
        res.setHeader("Content-Type", file.type);
        res.setHeader("Cache-Control", "public, max-age=3600");
        fs_1.default.createReadStream(file.path).pipe(res);
    });
    // Download Endpoint
    server.get("/api/download/:fileId", (req, res) => {
        const { fileId } = req.params;
        const { roomId } = req.query;
        const room = (0, rooms_1.getRoom)(roomId);
        if (!room) {
            res.status(404).send("Room not found");
            return;
        }
        const file = room.files.find(f => f.id === fileId);
        if (!file || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found or expired");
            return;
        }
        res.download(file.path, file.name);
    });
    // Preview Endpoint
    server.get("/api/preview/:fileId", (req, res) => {
        const { fileId } = req.params;
        const { roomId } = req.query;
        const room = (0, rooms_1.getRoom)(roomId);
        if (!room) {
            res.status(404).send("Room not found");
            return;
        }
        const file = room.files.find(f => f.id === fileId);
        if (!file || !fs_1.default.existsSync(file.path)) {
            res.status(404).send("File not found");
            return;
        }
        if (!file.type.startsWith("image/")) {
            res.status(400).send("Not an image");
            return;
        }
        res.setHeader("Content-Type", file.type);
        res.setHeader("Cache-Control", "public, max-age=3600");
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
        const url = `http://localhost:${actualPort}`;
        console.log(`\n🚀 Wifi File Sharer is running!`);
        console.log(`📡 Local:   ${url}`);
        console.log(`🌐 Network: http://${localIp}:${actualPort}\n`);
        if (!dev) {
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
            // Note: we can't get address if it failed to bind, so we just increment our tracked port
            console.log(`⚠️  Puerto ocupado, probando con ${nextPort}...`);
            port = nextPort;
            tryListen(port);
        }
        else {
            console.error("Fallo crítico al iniciar el servidor:", err);
            process.exit(1);
        }
    });
    tryListen(port);
}
// Start if run directly
if (require.main === module) {
    const port = parseInt(process.env.PORT || "5000", 10);
    startServer({ port, hostname: "0.0.0.0" });
}
