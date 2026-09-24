import { ReplyRef } from "./types";

export const REPLY_SNIPPET_MAX = 200;
export const REPLY_EXCERPT_MAX = 400;
export const REPLY_EXCERPT_LINES = 4;

const ENV_LINE_REGEX = /^[A-Z_][A-Z0-9_]*=.*/;
const FENCED_BLOCK_REGEX = /^```([\w-]*)\n([\s\S]*?)\n```$/;

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function makeSnippet(text: string): string {
  const plain = collapseWhitespace(text);
  return plain.length > REPLY_SNIPPET_MAX ? `${plain.slice(0, REPLY_SNIPPET_MAX)}…` : plain;
}

export function makeExcerpt(text: string): string {
  const clean = text.replace(/\s+$/, "");
  return clean.length > REPLY_EXCERPT_MAX ? clean.slice(0, REPLY_EXCERPT_MAX) : clean;
}

/**
 * Mirrors the block detection of FormattedMessage so reply line numbers
 * match the lines actually rendered inside each CodeBlock.
 */
export function detectCodeBlock(content: string): { language: string; lines: string[] } | null {
  const trimmed = content.trim();

  const looksJson =
    (trimmed.startsWith("{") && /\}\s*,?\s*$/.test(trimmed)) ||
    (trimmed.startsWith("[") && /\]\s*,?\s*$/.test(trimmed));
  if (looksJson) {
    const withoutTrailingComma = trimmed.replace(/,\s*$/, "");
    if (withoutTrailingComma.split("\n").length > 1) {
      try {
        const formatted = JSON.stringify(JSON.parse(withoutTrailingComma), null, 2);
        return { language: "json", lines: formatted.split("\n") };
      } catch {
        // fallthrough
      }
    }
  }

  const envLines = trimmed.split("\n");
  if (envLines.length >= 2) {
    const matching = envLines.filter((l) => ENV_LINE_REGEX.test(l.trim()));
    if (matching.length >= envLines.length * 0.7) {
      return { language: "env", lines: envLines };
    }
  }

  const fenced = trimmed.match(FENCED_BLOCK_REGEX);
  if (fenced) {
    return { language: fenced[1] || "code", lines: fenced[2].trimEnd().split("\n") };
  }

  return null;
}

export function buildMessageReply(id: string, senderName: string, content: string): ReplyRef {
  const code = detectCodeBlock(content);
  if (code) {
    return {
      id,
      senderName,
      snippet: makeSnippet(code.lines.join(" ")),
      kind: "code",
      language: code.language,
      startLine: 1,
      endLine: code.lines.length,
      excerpt: makeExcerpt(code.lines.slice(0, REPLY_EXCERPT_LINES).join("\n")),
    };
  }
  return {
    id,
    senderName,
    snippet: makeSnippet(content),
    kind: "text",
  };
}

export function getSelectionNodes(selection: Selection): {
  anchorEl: Element | null;
  focusEl: Element | null;
} {
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  return {
    anchorEl: anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null,
    focusEl: focusNode instanceof Element ? focusNode : focusNode?.parentElement ?? null,
  };
}

/**
 * Builds a reply reference from a live DOM selection. When the selection
 * lives inside a code block, resolves exact 1-based line numbers.
 */
export function buildSelectionReply(
  message: { id: string; senderName: string },
  selection: Selection
): ReplyRef | null {
  const raw = selection.toString();
  if (!raw.trim()) return null;

  const { anchorEl, focusEl } = getSelectionNodes(selection);

  const anchorLine = anchorEl?.closest?.(".code-line") as HTMLElement | null;
  const focusLine = focusEl?.closest?.(".code-line") as HTMLElement | null;

  if (anchorLine && focusLine) {
    const anchorNum = Number(anchorLine.dataset.line);
    const focusNum = Number(focusLine.dataset.line);
    const startLine = Math.min(anchorNum, focusNum);
    const endLine = Math.max(anchorNum, focusNum);

    if (Number.isFinite(startLine) && Number.isFinite(endLine) && startLine > 0) {
      const block = anchorLine.closest(".code-block");
      const language =
        block?.querySelector(".code-block-lang")?.textContent?.trim() || "code";
      const lines = Array.from(block?.querySelectorAll(".code-line") ?? [])
        .filter((el) => {
          const num = Number((el as HTMLElement).dataset.line);
          return num >= startLine && num <= endLine;
        })
        .map((el) => {
          // Plain fallback renders the number in `.code-ln`; Shiki renders it
          // via CSS `::before`, so `textContent` holds only the code.
          const textEl = el.querySelector(".code-line-text");
          return textEl?.textContent ?? el.textContent ?? "";
        });

      return {
        id: message.id,
        senderName: message.senderName,
        snippet: makeSnippet(lines.join(" ")),
        kind: "code",
        language,
        startLine,
        endLine,
        excerpt: makeExcerpt(lines.slice(0, REPLY_EXCERPT_LINES).join("\n")),
      };
    }
  }

  return {
    id: message.id,
    senderName: message.senderName,
    snippet: makeSnippet(raw),
    kind: "text",
    excerpt: makeExcerpt(raw),
  };
}
