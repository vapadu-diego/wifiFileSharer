"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTENSION_TO_CATEGORY = exports.FILE_TYPE_ICONS = exports.FILE_SIZE_OPTIONS = exports.DEFAULT_ROOM_SETTINGS = exports.DEFAULT_USER_SETTINGS = void 0;
exports.sanitizeReplyRef = sanitizeReplyRef;
exports.getPreviewLanguage = getPreviewLanguage;
exports.isPreviewableFile = isPreviewableFile;
exports.getFileCategory = getFileCategory;
exports.DEFAULT_USER_SETTINGS = {
    discoverable: true,
};
const REPLY_SNIPPET_MAX = 200;
const REPLY_EXCERPT_MAX = 400;
function sanitizeReplyRef(reply) {
    if (!reply || typeof reply !== "object")
        return undefined;
    const r = reply;
    if (typeof r.id !== "string" || !r.id)
        return undefined;
    const snippet = typeof r.snippet === "string" ? r.snippet.slice(0, REPLY_SNIPPET_MAX) : "";
    const kind = r.kind === "code" ? "code" : "text";
    const ref = {
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
exports.DEFAULT_ROOM_SETTINGS = {
    maxFileSize: 100 * 1024 * 1024,
};
exports.FILE_SIZE_OPTIONS = [
    { label: "10 MB", value: 10 * 1024 * 1024 },
    { label: "50 MB", value: 50 * 1024 * 1024 },
    { label: "100 MB", value: 100 * 1024 * 1024 },
    { label: "250 MB", value: 250 * 1024 * 1024 },
    { label: "500 MB", value: 500 * 1024 * 1024 },
];
// File type categories for icons
exports.FILE_TYPE_ICONS = {
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
exports.EXTENSION_TO_CATEGORY = {
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
/**
 * Extension → Shiki language for text/code previews. `null` means the file is
 * not previewable (binary, office documents, etc.).
 */
const PREVIEW_EXTENSIONS = {
    js: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", mts: "typescript", cts: "typescript",
    jsx: "jsx", tsx: "tsx",
    json: "json", jsonc: "json",
    html: "html", htm: "html",
    css: "css", scss: "css", less: "css",
    py: "python", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
    cs: "csharp", go: "go", rs: "rust", php: "php", rb: "ruby",
    sql: "sql", sh: "bash", bash: "bash", zsh: "bash",
    yml: "yaml", yaml: "yaml",
    md: "markdown", markdown: "markdown",
    xml: "xml", svg: "xml",
    diff: "diff", patch: "diff",
    dockerfile: "dockerfile",
    env: "dotenv",
    ini: "ini", conf: "ini", cfg: "ini", toml: "ini", properties: "ini",
    csv: "csv", tsv: "csv",
    txt: "text", log: "text", text: "text",
};
const PREVIEW_MIME_LANGUAGES = [
    { match: (mime) => mime.startsWith("text/"), language: "text" },
    { match: (mime) => mime === "application/json", language: "json" },
    { match: (mime) => mime === "application/xml", language: "xml" },
    { match: (mime) => mime === "application/x-yaml" || mime === "text/yaml", language: "yaml" },
    { match: (mime) => mime === "application/x-sh", language: "bash" },
];
function getPreviewLanguage(fileName, mimeType) {
    const base = fileName.split(/[\\/]/).pop() || fileName;
    const lower = base.toLowerCase();
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
    if (ext && PREVIEW_EXTENSIONS[ext])
        return PREVIEW_EXTENSIONS[ext];
    if (lower === "dockerfile")
        return "dockerfile";
    if (mimeType) {
        for (const entry of PREVIEW_MIME_LANGUAGES) {
            if (entry.match(mimeType))
                return entry.language;
        }
    }
    return null;
}
function isPreviewableFile(fileName, mimeType) {
    return getPreviewLanguage(fileName, mimeType) !== null;
}
function getFileCategory(mimeType, fileName) {
    if (fileName) {
        const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
        if (ext && exports.EXTENSION_TO_CATEGORY[ext])
            return exports.EXTENSION_TO_CATEGORY[ext];
    }
    if (mimeType.startsWith("image/"))
        return "image";
    if (mimeType.startsWith("video/"))
        return "video";
    if (mimeType.startsWith("audio/"))
        return "audio";
    if (mimeType === "application/pdf")
        return "pdf";
    if (mimeType.includes("word") || mimeType.includes("document"))
        return "document";
    if (mimeType.includes("sheet") || mimeType.includes("excel"))
        return "spreadsheet";
    if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar") || mimeType.includes("gz"))
        return "archive";
    if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("html") || mimeType.includes("css"))
        return "code";
    return "default";
}
