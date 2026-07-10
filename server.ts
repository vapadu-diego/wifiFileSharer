import { createServer } from "http";
import { parse } from "url";
import next from "next";
import express, { Request, Response } from "express";
import { Server } from "socket.io";
import os from "os";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { setupSocket } from "./lib/socket";
import { addFileToRoom, getRoom } from "./lib/rooms";
import { SharedFile } from "./lib/types";

const isDist = __dirname.endsWith("dist");
const dev = process.env.NODE_ENV === "development" || (!isDist && process.env.NODE_ENV !== "production");

export async function startServer(options: { port: number; hostname: string }) {
  let { port } = options;
  const { hostname } = options;

  // Ensure we find the Next.js app directory correctly
  // In dev (server.ts), it's the current dir. In prod (dist/server.js), it's one level up.
  const dir = isDist ? path.join(__dirname, "..") : __dirname;
  const app = next({ dev, hostname, port, dir });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = express();
  const httpServer = createServer(server);
  const io = new Server(httpServer);

  // Setup Socket.io events
  setupSocket(io);
  (global as any).io = io;

  // Create temporary upload directory if it doesn't exist and clean it
  const uploadDir = path.join(process.cwd(), "wifi-sharer-uploads");
  if (fs.existsSync(uploadDir)) {
    // Cleanup old files on startup
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
      try {
        const filePath = path.join(uploadDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Error cleaning up file ${file}:`, err);
      }
    }
  } else {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Upload Endpoint
  server.post("/api/upload", (req: Request, res: Response) => {
    const form = formidable({
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

      const room = getRoom(roomId);
      if (!room) {
        fs.unlinkSync(uploadedFile.filepath);
        res.status(404).json({ error: "Room not found" });
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
        senderId: senderId || "unknown",
        senderName: senderName || "Anonymous",
        path: uploadedFile.filepath,
        createdAt: Date.now(),
      };

      addFileToRoom(roomId, sharedFile);

      io.to(roomId).emit("file_uploaded", sharedFile);
      io.to(roomId).emit("room_updated", getRoom(roomId));

      res.json({ success: true, file: sharedFile });
    });
  });

  // Download Endpoint
  server.get("/api/download/:fileId", (req: Request, res: Response) => {
    const { fileId } = req.params;
    const { roomId } = req.query;

    const room = getRoom(roomId as string);
    if (!room) {
      res.status(404).send("Room not found");
      return;
    }

    const file = room.files.find(f => f.id === fileId);
    if (!file || !fs.existsSync(file.path)) {
      res.status(404).send("File not found or expired");
      return;
    }

    res.download(file.path, file.name);
  });

  // Preview Endpoint
  server.get("/api/preview/:fileId", (req: Request, res: Response) => {
    const { fileId } = req.params;
    const { roomId } = req.query;

    const room = getRoom(roomId as string);
    if (!room) {
      res.status(404).send("Room not found");
      return;
    }

    const file = room.files.find(f => f.id === fileId);
    if (!file || !fs.existsSync(file.path)) {
      res.status(404).send("File not found");
      return;
    }

    if (!file.type.startsWith("image/")) {
      res.status(400).send("Not an image");
      return;
    }

    res.setHeader("Content-Type", file.type);
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(file.path).pipe(res);
  });

  // Next.js Handler
  server.all(/(.*)/, (req: Request, res: Response) => {
    const parsedUrl = parse(req.url!, true);
    handle(req as any, res as any, parsedUrl);
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

    const url = `http://localhost:${actualPort}`;
    console.log(`\n🚀 Wifi File Sharer is running!`);
    console.log(`📡 Local:   ${url}`);
    console.log(`🌐 Network: http://${localIp}:${actualPort}\n`);

    if (!dev) {
      const open = (await import("open")).default;
      try {
        await open(url);
      } catch (e) {
        // Silently fail if browser can't open
      }
    }
  });

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      const nextPort = (httpServer.address() as any)?.port || port + 1;
      // Note: we can't get address if it failed to bind, so we just increment our tracked port
      console.log(`⚠️  Puerto ocupado, probando con ${port + 1}...`);
      port++;
      tryListen(port);
    } else {
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
