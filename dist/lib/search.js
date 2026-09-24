"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_MAX_TERMS = exports.SEARCH_HIGHLIGHT_END = exports.SEARCH_HIGHLIGHT_START = void 0;
exports.buildSearchTerms = buildSearchTerms;
exports.escapeLike = escapeLike;
exports.makeSnippet = makeSnippet;
exports.SEARCH_HIGHLIGHT_START = "[[";
exports.SEARCH_HIGHLIGHT_END = "]]";
exports.SEARCH_MAX_TERMS = 8;
/**
 * Splits a raw query into FTS terms (>= 3 chars, required by the trigram
 * tokenizer) and short terms that must be filtered with LIKE. Quotes are
 * stripped so user input can never break the FTS5 query syntax.
 */
function buildSearchTerms(raw) {
    const tokens = raw
        .split(/\s+/)
        .map((token) => token.replace(/"/g, "").trim())
        .filter(Boolean)
        .slice(0, exports.SEARCH_MAX_TERMS);
    const long = tokens.filter((token) => token.length >= 3);
    const short = tokens.filter((token) => token.length < 3);
    return {
        fts: long.length > 0 ? long.map((token) => `"${token}"`).join(" ") : null,
        short,
    };
}
/** Escapes LIKE wildcards for user-provided terms. */
function escapeLike(term) {
    return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
/**
 * Builds a short context fragment around the first occurrence of `term`,
 * wrapped in `[[` `]]` markers so the client can highlight it.
 */
function makeSnippet(content, term, radius = 70) {
    const flat = content.replace(/\s+/g, " ").trim();
    if (!term)
        return flat.slice(0, radius * 2);
    const index = flat.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1)
        return flat.slice(0, radius * 2);
    const start = Math.max(0, index - radius);
    const end = Math.min(flat.length, index + term.length + radius);
    const before = flat.slice(start, index);
    const match = flat.slice(index, index + term.length);
    const after = flat.slice(index + term.length, end);
    return `${start > 0 ? "…" : ""}${before}${exports.SEARCH_HIGHLIGHT_START}${match}${exports.SEARCH_HIGHLIGHT_END}${after}${end < flat.length ? "…" : ""}`;
}
