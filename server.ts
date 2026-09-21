import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { parse } from "url";
import next from "next";
import express, { Request, Response } from "express";
import { Server } from "socket.io";
import os from "os";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { setupSocket } from "./lib/socket";
import { addFileToRoom, getRoom, serializeRoomMeta } from "./lib/rooms";
import {
  addPrivateFile,
  getPrivateFileById,
  getPrivateFiles,
  migrateLegacyPrivateFiles,
  pruneDeletedMessages,
  purgeExpiredFiles,
  removeOrphanUploads,
} from "./lib/privateChatRepo";
import { getUser, getSocketId } from "./lib/presence";
import { isRegisteredIdentity, migrateLegacyIdentities, verifyTokenSelf } from "./lib/identity";
import { initDb, closeDb } from "./lib/db";
import { getDataDir, getUploadDir, ensureDataDir } from "./lib/paths";
import { checkNodeVersion, getPurgeIntervalMs } from "./lib/config";
import { resolveTlsMaterial } from "./lib/tls";
import { SharedFile, PrivateFile } from "./lib/types";
import { MAX_CONVERSATION_FILES, MAX_ROOM_FILES } from "./lib/limits";

declare global {
  var io: Server | undefined;
}

interface AuthedRequest extends Request {
  persistentId?: string;
}

function getRequestIdentity(req: Request): string | undefined {
  const headerToken = req.headers["x-auth-token"];
  const queryToken = req.query.token;
  const cookieToken = getCookie(req.headers.cookie, "wfs_token");
  const token =
    (typeof headerToken === "string" ? headerToken : undefined) ||
    (typeof queryToken === "string" ? queryToken : undefined) ||
    cookieToken;
  if (!token) return undefined;
  return verifyTokenSelf(token);
}

function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function findRoomMember(roomId: string, persistentId: string) {
  const room = getRoom(roomId);
  if (!room) return undefined;
  const member = room.users.find((u) => u.persistentId === persistentId);
  if (!member) return undefined;
  return { room, member };
}

export interface StartServerOptions {
  port: number;
  hostname: string;
  https?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  dataDir?: string;
}

export async function startServer(options: StartServerOptions) {
  checkNodeVersion();

  // CLI --data-dir must win over legacy detection
  if (options.dataDir) {
    process.env.WFS_DATA_DIR = path.resolve(options.dataDir);
  }

  let { port } = options;
  const { hostname } = options;

  // Ensure we find the Next.js app directory correctly
  // In dev (server.ts), it's the current dir. In prod (dist/server.js), it's one level up.
  const isDist = __dirname.endsWith("dist");
  const dev = process.env.NODE_ENV === "development" || (!isDist && process.env.NODE_ENV !== "production");
  const dir = isDist ? path.join(__dirname, "..") : __dirname;
  const app = next({ dev, hostname, port, dir });
  const handle = app.getRequestHandler();

  await app.prepare();

  // --- Data layer ---
  ensureDataDir();
  initDb();
  migrateLegacyIdentities();
  migrateLegacyPrivateFiles();
  console.log(`📂 Datos:  ${getDataDir()}`);

  const purgeExpired = () => {
    try {
      const files = purgeExpiredFiles();
      const tombstones = pruneDeletedMessages();
      if (files > 0 || tombstones > 0) {
        console.log(`🧹 Retención: ${files} archivo(s) y ${tombstones} mensaje(s) purgados`);
      }
    } catch (e) {
      console.error("Error en la purga de retención:", e);
    }
  };
  purgeExpired();
  removeOrphanUploads();
  const purgeTimer = setInterval(purgeExpired, getPurgeIntervalMs());

  const server = express();
  const tls = await resolveTlsMaterial({
    https: options.https,
    certPath: options.tlsCert,
    keyPath: options.tlsKey,
  });
  const httpServer = tls
    ? createHttpsServer({ key: tls.key, cert: tls.cert }, server)
    : createHttpServer(server);
  const io = new Server(httpServer, {
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
      } catch {
        callback(null, false);
      }
    },
  });

  // Security headers for every response
  server.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (tls) res.setHeader("Strict-Transport-Security", "max-age=15552000");
    next();
  });

  // Every /api endpoint requires a valid identity token
  server.use("/api", (req: AuthedRequest, res: Response, next) => {
    const identity = getRequestIdentity(req);
    if (!identity) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    req.persistentId = identity;
    next();
  });

  // Setup Socket.io events
  setupSocket(io);
  global.io = io;

  const uploadDir = getUploadDir();
  fs.mkdirSync(uploadDir, { recursive: true });

  // Upload Endpoint
  server.post("/api/upload", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const form = formidable({
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
        fs.unlinkSync(uploadedFile.filepath);
        res.status(403).json({ error: "No perteneces a esta sala" });
        return;
      }

      const { room, member } = membership;

      if (room.files.length >= MAX_ROOM_FILES) {
        fs.unlinkSync(uploadedFile.filepath);
        res.status(413).json({ error: "La sala alcanzó el límite de archivos" });
        return;
      }

      if (uploadedFile.size > room.settings.maxFileSize) {
        fs.unlinkSync(uploadedFile.filepath);
        const maxMB = Math.round(room.settings.maxFileSize / 1024 / 1024);
        res.status(413).json({ error: `Archivo demasiado grande. Máximo: ${maxMB}MB` });
        return;
      }

      const sharedFile: SharedFile = {
        id: uploadedFile.newFilename,
        name: uploadedFile.originalFilename || "unknown",
        size: uploadedFile.size,
        type: uploadedFile.mimetype || "application/octet-stream",
        senderId: identity,
        senderName: member.nickname,
        path: uploadedFile.filepath,
        createdAt: Date.now(),
      };

      addFileToRoom(roomId, sharedFile);

      io.to(roomId).emit("file_uploaded", sharedFile);
      const updatedRoom = getRoom(roomId);
      if (updatedRoom) io.to(roomId).emit("room_updated", serializeRoomMeta(updatedRoom));

      res.json({ success: true, file: sharedFile });
    });
  });

  // Private Upload Endpoint
  server.post("/api/upload-private", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const form = formidable({
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

      if (toId !== identity && !isRegisteredIdentity(toId)) {
        fs.unlinkSync(uploadedFile.filepath);
        res.status(404).json({ error: "Destinatario desconocido" });
        return;
      }

      if (getPrivateFiles(identity, toId).length >= MAX_CONVERSATION_FILES) {
        fs.unlinkSync(uploadedFile.filepath);
        res.status(413).json({ error: "La conversación alcanzó el límite de archivos" });
        return;
      }

      const privateFile: PrivateFile = {
        id: uploadedFile.newFilename,
        name: uploadedFile.originalFilename || "unknown",
        size: uploadedFile.size,
        type: uploadedFile.mimetype || "application/octet-stream",
        fromId: identity,
        toId,
        fromName: getUser(identity)?.nickname || "Usuario",
        path: uploadedFile.filepath,
        createdAt: Date.now(),
      };

      addPrivateFile(privateFile);

      // Notify the recipient via socket
      const targetSocketId = getSocketId(toId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("private_file", privateFile);
      }

      res.json({ success: true, file: privateFile });
    });
  });

  // Private Download Endpoint
  server.get("/api/download-private/:fileId", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const { fileId } = req.params;
    const file = getPrivateFileById(fileId);
    if (!file || (file.fromId !== identity && file.toId !== identity)) {
      res.status(404).send("File not found or expired");
      return;
    }
    if (!fs.existsSync(file.path)) {
      res.status(404).send("File not found or expired");
      return;
    }
    res.download(file.path, file.name);
  });

  // Private File Status Endpoint (checks if the file still exists)
  server.get("/api/private-file-status/:fileId", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const { fileId } = req.params;
    const file = getPrivateFileById(fileId);
    if (!file || (file.fromId !== identity && file.toId !== identity)) {
      res.json({ exists: false });
      return;
    }
    const exists = fs.existsSync(file.path);
    res.json({ exists });
  });

  // Private Preview Endpoint
  server.get("/api/preview-private/:fileId", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const { fileId } = req.params;
    const file = getPrivateFileById(fileId);
    if (!file || (file.fromId !== identity && file.toId !== identity) || !fs.existsSync(file.path)) {
      res.status(404).send("File not found");
      return;
    }
    if (!file.type.startsWith("image/")) {
      res.status(400).send("Not an image");
      return;
    }
    res.setHeader("Content-Type", file.type);
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs.createReadStream(file.path).pipe(res);
  });

  // Download Endpoint
  server.get("/api/download/:fileId", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const { fileId } = req.params;
    const { roomId } = req.query;

    const membership = typeof roomId === "string" ? findRoomMember(roomId, identity) : undefined;
    if (!membership) {
      res.status(404).send("Room not found");
      return;
    }

    const file = membership.room.files.find(f => f.id === fileId);
    if (!file || !fs.existsSync(file.path)) {
      res.status(404).send("File not found or expired");
      return;
    }

    res.download(file.path, file.name);
  });

  // Preview Endpoint
  server.get("/api/preview/:fileId", (req: AuthedRequest, res: Response) => {
    const identity = req.persistentId!;
    const { fileId } = req.params;
    const { roomId } = req.query;

    const membership = typeof roomId === "string" ? findRoomMember(roomId, identity) : undefined;
    if (!membership) {
      res.status(404).send("Room not found");
      return;
    }

    const file = membership.room.files.find(f => f.id === fileId);
    if (!file || !fs.existsSync(file.path)) {
      res.status(404).send("File not found");
      return;
    }

    if (!file.type.startsWith("image/")) {
      res.status(400).send("Not an image");
      return;
    }

    res.setHeader("Content-Type", file.type);
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs.createReadStream(file.path).pipe(res);
  });

  // Next.js Handler
  server.all(/(.*)/, (req: Request, res: Response) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const tryListen = (currentPort: number) => {
    httpServer.listen(currentPort, hostname);
  };

  httpServer.on("listening", async () => {
    const address = httpServer.address();
    const actualPort = typeof address === "string" ? port : address?.port || port;

    // Get local IP address using native 'os' module
    const networkInterfaces = os.networkInterfaces();
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
      if (localIp !== "localhost") break;
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
      const open = (await import("open")).default;
      try {
        await open(url);
      } catch {
        // Silently fail if browser can't open
      }
    }
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const addr = httpServer.address();
      const nextPort = typeof addr === "object" && addr ? addr.port : port + 1;
      console.log(`⚠️  Puerto ocupado, probando con ${nextPort}...`);
      port = nextPort;
      tryListen(port);
    } else {
      console.error("Fallo crítico al iniciar el servidor:", err);
      process.exit(1);
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    clearInterval(purgeTimer);
    try {
      httpServer.close();
    } catch {
      // ignore
    }
    closeDb();
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
