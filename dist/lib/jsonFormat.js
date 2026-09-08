"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatJsonContent = formatJsonContent;
// Detects content that looks like a JSON object/array (starts with "{" / "[" and
// ends with "}" / "]" possibly followed by a trailing comma, e.g. "}," from a
// pasted snippet). Strips the trailing comma, validates with JSON.parse and wraps
// it in markdown code formatting. Returns the original content if it is not valid JSON.
function formatJsonContent(raw) {
    const content = raw.trim();
    const startsWithObject = content.startsWith("{");
    const startsWithArray = content.startsWith("[");
    const endsWithObject = /\}\s*,?\s*$/.test(content);
    const endsWithArray = /\]\s*,?\s*$/.test(content);
    if ((!startsWithObject && !startsWithArray) ||
        (!endsWithObject && !endsWithArray)) {
        return raw;
    }
    const stripped = content.replace(/,\s*$/, "");
    try {
        JSON.parse(stripped);
    }
    catch {
        return raw;
    }
    const lines = stripped.split("\n");
    if (lines.length > 1) {
        return `\`\`\`json\n${stripped}\n\`\`\``;
    }
    return `\`${stripped}\``;
}
