import fs from "fs";
import os from "os";
import selfsigned from "selfsigned";
import { ensureDataDir, getTlsCertFile, getTlsKeyFile } from "./paths";

export interface TlsMaterial {
  key: Buffer;
  cert: Buffer;
}

export interface TlsOptions {
  https?: boolean;
  certPath?: string;
  keyPath?: string;
}

function envFlag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

/**
 * Resolves TLS material:
 *   1. Explicit cert/key (CLI flags or WFS_TLS_CERT/WFS_TLS_KEY) → always HTTPS
 *   2. WFS_HTTPS/--https without cert → auto self-signed (generated once and
 *      reused from the data dir)
 *   3. Otherwise → HTTP
 */
export async function resolveTlsMaterial(options: TlsOptions = {}): Promise<TlsMaterial | null> {
  const certPath = options.certPath || process.env.WFS_TLS_CERT;
  const keyPath = options.keyPath || process.env.WFS_TLS_KEY;

  if (certPath && keyPath) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
  }

  const httpsEnabled = options.https === true || envFlag(process.env.WFS_HTTPS);
  if (!httpsEnabled) return null;

  const certFile = getTlsCertFile();
  const keyFile = getTlsKeyFile();
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    return {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    };
  }

  ensureDataDir();

  const altNames: { type: 2 | 7; value?: string; ip?: string }[] = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
  ];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        altNames.push({ type: 7, ip: iface.address });
      }
    }
  }

  const notAfterDate = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
  const pems = await selfsigned.generate([{ name: "commonName", value: "wifi-file-sharer" }], {
    notAfterDate,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [{ name: "subjectAltName", altNames }],
  });

  fs.writeFileSync(certFile, pems.cert, { mode: 0o644 });
  fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
  console.log("🔐 Certificado autofirmado generado en", certFile);

  return { cert: Buffer.from(pems.cert), key: Buffer.from(pems.private) };
}
