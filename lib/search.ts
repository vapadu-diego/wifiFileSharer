export const SEARCH_HIGHLIGHT_START = "[[";
export const SEARCH_HIGHLIGHT_END = "]]";
export const SEARCH_MAX_TERMS = 8;

/**
 * Splits a raw query into FTS terms (>= 3 chars, required by the trigram
 * tokenizer) and short terms that must be filtered with LIKE. Quotes are
 * stripped so user input can never break the FTS5 query syntax.
 */
export function buildSearchTerms(raw: string): { fts: string | null; short: string[] } {
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.replace(/"/g, "").trim())
    .filter(Boolean)
    .slice(0, SEARCH_MAX_TERMS);

  const long = tokens.filter((token) => token.length >= 3);
  const short = tokens.filter((token) => token.length < 3);

  return {
    fts: long.length > 0 ? long.map((token) => `"${token}"`).join(" ") : null,
    short,
  };
}

/** Escapes LIKE wildcards for user-provided terms. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds a short context fragment around the first occurrence of `term`,
 * wrapped in `[[` `]]` markers so the client can highlight it.
 */
export function makeSnippet(content: string, term: string, radius = 70): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!term) return flat.slice(0, radius * 2);
  const index = flat.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return flat.slice(0, radius * 2);

  const start = Math.max(0, index - radius);
  const end = Math.min(flat.length, index + term.length + radius);
  const before = flat.slice(start, index);
  const match = flat.slice(index, index + term.length);
  const after = flat.slice(index + term.length, end);

  return `${start > 0 ? "…" : ""}${before}${SEARCH_HIGHLIGHT_START}${match}${SEARCH_HIGHLIGHT_END}${after}${end < flat.length ? "…" : ""}`;
}
