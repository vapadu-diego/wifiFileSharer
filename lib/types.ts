export interface User {
  id: string; // Socket ID
  nickname: string;
  roomId: string;
  ip: string;
  userAgent: string;
  os: string;
  browser: string;
  joinedAt: number;
  isGhost?: boolean; // Admin observing in ghost mode
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
}

export interface RoomSettings {
  maxFileSize: number;
}

export interface Room {
  id: string;
  password?: string;
  hostId: string;
  users: User[];
  ghosts: User[]; // Admins observing in ghost mode
  files: SharedFile[];
  texts: SharedText[];
  settings: RoomSettings;
  bannedIps: string[]; // Blocked IP addresses
  createdAt: number;
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

export interface PrivateMessage {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  content: string;
  createdAt: number;
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

export function getFileCategory(mimeType: string): string {
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
