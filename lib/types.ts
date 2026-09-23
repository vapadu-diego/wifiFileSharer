export interface User {
  id: string; // Socket ID
  nickname: string;
  roomId: string;
  ip?: string;
  userAgent?: string;
  os: string;
  browser: string;
  joinedAt: number;
  isGhost?: boolean; // Admin observing in ghost mode
  persistentId?: string;
}

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string; // MIME type
  senderId: string;
  senderName: string;
  path: string;
  createdAt: number;
}

export interface SharedText {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: number;
  readBy?: string[];
  replyTo?: ReplyRef;
}

export interface RoomSettings {
  maxFileSize: number;
}

export interface Room {
  id: string;
  password?: string;
  hostId: string;
  users: User[];
  ghosts?: User[]; // Admins observing in ghost mode (server-only, never broadcast)
  files: SharedFile[];
  texts: SharedText[];
  settings: RoomSettings;
  bannedIps?: string[]; // Blocked IP addresses (server-only, never broadcast)
  createdAt: number;
  textsHasMore?: boolean; // Wire-only: snapshot indicates older messages exist
}

// For admin panel - room info without sensitive data
export interface RoomSummary {
  id: string;
  hasPassword: boolean;
  userCount: number;
  fileCount: number;
  textCount: number;
  createdAt: number;
}

export interface OnlineUser {
  id: string;
  persistentId: string;
  nickname: string;
  os: string;
  browser: string;
  joinedAt: number;
  isOnline?: boolean;
}

export interface UserSettings {
  discoverable: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  discoverable: true,
};

export interface ReplyRef {
  id: string;
  senderName: string;
  snippet: string;
  kind?: "text" | "code";
  language?: string;
  startLine?: number;
  endLine?: number;
  excerpt?: string;
}

const REPLY_SNIPPET_MAX = 200;
const REPLY_EXCERPT_MAX = 400;

export function sanitizeReplyRef(reply: unknown): ReplyRef | undefined {
  if (!reply || typeof reply !== "object") return undefined;
  const r = reply as Partial<ReplyRef>;
  if (typeof r.id !== "string" || !r.id) return undefined;

  const snippet = typeof r.snippet === "string" ? r.snippet.slice(0, REPLY_SNIPPET_MAX) : "";
  const kind = r.kind === "code" ? "code" : "text";
  const ref: ReplyRef = {
    id: r.id,
    senderName: typeof r.senderName === "string" ? r.senderName.slice(0, 50) : "",
    snippet,
    kind,
  };

  if (kind === "code") {
    if (typeof r.language === "string" && r.language) {
      ref.language = r.language.slice(0, 30);
    }
    const start = typeof r.startLine === "number" && r.startLine > 0 ? Math.floor(r.startLine) : undefined;
    const end = typeof r.endLine === "number" && r.endLine > 0 ? Math.floor(r.endLine) : undefined;
    if (start !== undefined) {
      ref.startLine = start;
      ref.endLine = end !== undefined && end >= start ? end : start;
    }
    if (typeof r.excerpt === "string" && r.excerpt) {
      ref.excerpt = r.excerpt.slice(0, REPLY_EXCERPT_MAX);
    }
  }

  return ref;
}

export interface PrivateMessage {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
  readAt?: number;
  replyTo?: ReplyRef;
}

export interface PrivateFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fromId: string;
  toId: string;
  fromName: string;
  path: string;
  createdAt: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxFileSize: 100 * 1024 * 1024,
};

export const FILE_SIZE_OPTIONS = [
  { label: "10 MB", value: 10 * 1024 * 1024 },
  { label: "50 MB", value: 50 * 1024 * 1024 },
  { label: "100 MB", value: 100 * 1024 * 1024 },
  { label: "250 MB", value: 250 * 1024 * 1024 },
  { label: "500 MB", value: 500 * 1024 * 1024 },
];

// File type categories for icons
export const FILE_TYPE_ICONS: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  document: "document",
  spreadsheet: "spreadsheet",
  archive: "archive",
  code: "code",
  default: "file",
};

// Extension → category mapping (takes precedence over MIME type)
export const EXTENSION_TO_CATEGORY: Record<string, string> = {
  // image
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  svg: "image", bmp: "image", ico: "image", avif: "image", tiff: "image",
  // video
  mp4: "video", mkv: "video", avi: "video", mov: "video", webm: "video",
  m4v: "video", wmv: "video", flv: "video", mpg: "video", mpeg: "video",
  // audio
  mp3: "audio", wav: "audio", ogg: "audio", oga: "audio", m4a: "audio",
  flac: "audio", aac: "audio", opus: "audio", wma: "audio",
  // pdf
  pdf: "pdf",
  // document
  doc: "document", docx: "document", odt: "document", txt: "document",
  rtf: "document", pages: "document", md: "document",
  // spreadsheet
  xls: "spreadsheet", xlsx: "spreadsheet", csv: "spreadsheet",
  ods: "spreadsheet", numbers: "spreadsheet",
  // archive
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive",
  gz: "archive", tgz: "archive", bz2: "archive", xz: "archive", iso: "archive",
  // code
  js: "code", jsx: "code", ts: "code", tsx: "code", py: "code",
  java: "code", c: "code", cpp: "code", cs: "code", rb: "code",
  go: "code", rs: "code", php: "code", html: "code", css: "code",
  scss: "code", json: "code", xml: "code", yml: "code", yaml: "code",
  sh: "code", sql: "code", kt: "code", swift: "code",
};

export function getFileCategory(mimeType: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
    if (ext && EXTENSION_TO_CATEGORY[ext]) return EXTENSION_TO_CATEGORY[ext];
  }
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("word") || mimeType.includes("document")) return "document";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "spreadsheet";
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar") || mimeType.includes("gz")) return "archive";
  if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("html") || mimeType.includes("css")) return "code";
  return "default";
}
