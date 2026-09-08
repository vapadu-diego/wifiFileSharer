"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

const MermaidDiagram = dynamic(() => import("./MermaidDiagram"), {
  ssr: false,
});


// Clipboard fallback for HTTP
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus({ preventScroll: true });
    textArea.select();
    return new Promise((resolve, reject) => {
      document.execCommand("copy") ? resolve() : reject();
      textArea.remove();
    });
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="code-copy-btn"
      title="Copiar"
    >
      {copied ? (
        <svg width="14" height="14" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightSyntax(code: string): string {
  const commentPattern = "//.*|/\\*[\\s\\S]*?\\*/";
  const stringPattern = '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|\\`(?:\\\\.|[^\\\\`])*\\`';
  const numberPattern = "\\b\\d+\\b|\\b(?:true|false|null)\\b";
  const keywordPattern = "\\b(?:const|let|var|function|return|import|export|class|if|else|for|while|try|catch|new|await|async|default|from|switch|case|break|typeof|instanceof|yield|throws|extends|implements)\\b";

  const regex = new RegExp(
    `(${commentPattern})|(${stringPattern})|(${numberPattern})|(${keywordPattern})`,
    "g"
  );

  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(code.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Comment
      result += `<span style="color: #8b949e; font-style: italic;">${escapeHtml(match[1])}</span>`;
    } else if (match[2]) {
      // String
      result += `<span style="color: #7ee787;">${escapeHtml(match[2])}</span>`;
    } else if (match[3]) {
      // Number/Boolean
      result += `<span style="color: #ff9b50;">${escapeHtml(match[3])}</span>`;
    } else if (match[4]) {
      // Keyword
      result += `<span style="color: #ff7b72; font-weight: bold;">${escapeHtml(match[4])}</span>`;
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.slice(lastIndex));
  }

  return result;
}

const EMOJI_MAP: Record<string, string> = {
  ":bug:": "🐛",
  ":rocket:": "🚀",
  ":fire:": "🔥",
  ":check:": "✔",
  ":warning:": "⚠️",
  ":lock:": "🔒",
  ":zap:": "⚡",
  ":idea:": "💡",
  ":party:": "🎉",
  ":skull:": "💀",
  ":tada:": "🎉",
  ":lol:": "😂",
  ":joy:": "😂",
  ":laugh:": "😆",
  ":cry:": "😢",
  ":sad:": "😢",
  ":sobs:": "😭",
  ":cool:": "😎",
  ":smile:": "😊",
  ":wow:": "😲",
  ":scream:": "😱",
  ":thinking:": "🤔",
  ":ok:": "👌",
  ":ok_hand:": "✋",
  ":thumbsup:": "👍",
  ":thumbsdown:": "👎",
  ":clap:": "👏",
  ":eyes:": "👀",
  ":wave:": "👋",
  ":pray:": "🙏",
  ":heart:": "❤️",
  ":broken_heart:": "💔",
  ":kiss:": "😘",
  ":hug:": "🤗",
  ":star:": "⭐",
  ":fireworks:": "🎆",
  ":hundred:": "💯",
  ":paint:": "🎨",
  ":x:": "❌",
  ":)": "🙂",
  ":D": "😀",
  ":(": "🙁",
  "<3": "❤️",
};

function replaceEmojis(text: string): string {
  let result = text;
  // Longest codes first so ":heart:" doesn't break ":broken_heart:"
  const entries = Object.entries(EMOJI_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [code, unicode] of entries) {
    const escapedCode = code.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(escapedCode, "g");
    result = result.replace(regex, unicode);
  }
  return result;
}

function parseTextElements(text: string, prefix: string): React.ReactNode[] {
  const textWithEmojis = replaceEmojis(text);
  
  // Group 1: Inline code (`code`), Group 2: Link, Group 3: Mention (@username), Group 4: Bold (**text** or __text__), Group 5: Italic (*text* or _text_), Group 6: Hashtag (#tag)
  const tokenRegex = /(`[^`\n]+`)|(https?:\/\/[^\s]+|www\.[^\s]+)|(@\w+)|(\*\*[^*]+\*\*|__[^*]+__)|(\*[^*]+\*|_[^*]+_)|(#\w+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(textWithEmojis)) !== null) {
    if (match.index > lastIndex) {
      parts.push(textWithEmojis.slice(lastIndex, match.index));
    }

    if (match[1]) {
      const codeText = match[1].slice(1, -1);
      parts.push(
        <code key={`${prefix}-inline-${match.index}`} className="inline-code">
          {codeText}
        </code>
      );
    } else if (match[2]) {
      const url = match[2];
      const href = url.startsWith("www.") ? `http://${url}` : url;
      parts.push(
        <a
          key={`${prefix}-lnk-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
          style={{
            color: "#3b82f6",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {url}
        </a>
      );
    } else if (match[3]) {
      const mention = match[3];
      parts.push(
        <span
          key={`${prefix}-men-${match.index}`}
          className="chat-mention"
          style={{
            background: "rgba(168, 85, 247, 0.15)",
            color: "#a855f7",
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: "4px",
            display: "inline-block",
          }}
        >
          {mention}
        </span>
      );
    } else if (match[4]) {
      const boldText = match[4].slice(2, -2);
      parts.push(<strong key={`${prefix}-bld-${match.index}`}>{boldText}</strong>);
    } else if (match[5]) {
      const italicText = match[5].slice(1, -1);
      parts.push(<em key={`${prefix}-it-${match.index}`}>{italicText}</em>);
    } else if (match[6]) {
      const hashtag = match[6];
      parts.push(
        <span
          key={`${prefix}-tag-${match.index}`}
          className="chat-hashtag"
          style={{
            color: "#a855f7",
            background: "rgba(168, 85, 247, 0.08)",
            padding: "1px 4px",
            borderRadius: "3px",
            fontSize: "0.85em",
            fontWeight: 500,
          }}
        >
          {hashtag}
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < textWithEmojis.length) {
    parts.push(textWithEmojis.slice(lastIndex));
  }

  return parts;
}

function renderLines(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Check if line starts and ends with '|' (potential table)
    if (line.startsWith("|") && line.endsWith("|")) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|") && lines[j].trim().endsWith("|")) {
        tableLines.push(lines[j].trim());
        j++;
      }

      if (tableLines.length >= 2) {
        const headerRaw = tableLines[0];
        const separatorRaw = tableLines[1];
        
        // Parse header columns
        const headers = headerRaw.split("|").slice(1, -1).map(h => h.trim());
        
        // Parse separator alignments
        const separators = separatorRaw.split("|").slice(1, -1).map(s => s.trim());
        const alignments: Array<"left" | "center" | "right"> = separators.map(s => {
          if (s.startsWith(":") && s.endsWith(":")) return "center";
          if (s.endsWith(":")) return "right";
          return "left";
        });

        // Parse data rows
        const rowsRaw = tableLines.slice(2);
        const rows = rowsRaw.map(rowLine => 
          rowLine.split("|").slice(1, -1).map(c => c.trim())
        );

        elements.push(
          <div key={`table-${i}`} style={{ overflowX: "auto", margin: "12px 0" }}>
            <table
              className="chat-table"
              style={{
                borderCollapse: "collapse",
                width: "100%",
                fontSize: "0.85rem",
                border: "1px solid var(--card-border)",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--card-border)", background: "rgba(255,255,255,0.03)" }}>
                  {headers.map((h, idx) => (
                    <th
                      key={idx}
                      style={{
                        padding: "8px 10px",
                        textAlign: alignments[idx] || "left",
                        fontWeight: 600,
                        borderRight: "1px solid var(--card-border)",
                      }}
                    >
                      {parseTextElements(h, `table-h-${i}-${idx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: "1px solid var(--card-border)",
                      background: rIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                    }}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        style={{
                          padding: "8px 10px",
                          textAlign: alignments[cIdx] || "left",
                          borderRight: "1px solid var(--card-border)",
                        }}
                      >
                        {parseTextElements(cell || "", `table-c-${i}-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        i = j; // Advance index past the table
        continue;
      }
    }

    // Task list check
    const taskMatch = line.match(/^-\s\[([ xX])\]\s(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === "x";
      elements.push(
        <div
          key={i}
          className="chat-task-item"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: "4px 0",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "16px",
              height: "16px",
              border: isChecked ? "1px solid #22c55e" : "1px solid var(--card-border)",
              borderRadius: "4px",
              background: isChecked ? "rgba(34, 197, 94, 0.15)" : "transparent",
              color: isChecked ? "#22c55e" : "transparent",
              fontSize: "10px",
              fontWeight: "bold",
              cursor: "default",
              flexShrink: 0,
            }}
          >
            {isChecked ? "✓" : ""}
          </span>
          <span style={{ textDecoration: isChecked ? "line-through" : "none", opacity: isChecked ? 0.6 : 1 }}>
            {parseTextElements(taskMatch[2], `task-${i}`)}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // Bullet list check: starts with "- ", "* ", "+ " or "• " (and not a task item)
    const bulletMatch = line.match(/^([*\-+•])\s(.*)$/);
    if (bulletMatch && !line.startsWith("- [")) {
      elements.push(
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            paddingLeft: "16px",
            margin: "4px 0",
          }}
        >
          <span style={{ color: "var(--primary)", flexShrink: 0 }}>•</span>
          <span>{parseTextElements(bulletMatch[2], `bullet-${i}`)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Horizontal Rule check: "---", "***", "___" or horizontal box drawings
    if (line === "---" || line === "***" || line === "___" || /^─{3,}$/.test(line)) {
      elements.push(
        <hr
          key={i}
          style={{
            border: "none",
            borderTop: "1px solid var(--card-border)",
            margin: "16px 0",
            opacity: 0.5,
          }}
        />
      );
      i++;
      continue;
    }

    // Header check: starts with "# ", "## ", "### ", "#### "
    const headerMatch = line.match(/^(#{1,6})\s(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const textVal = headerMatch[2];
      const headingStyles = {
        fontWeight: 700,
        margin: "14px 0 8px 0",
        color: "var(--foreground)",
        lineHeight: 1.3,
      };

      if (level === 1) {
        elements.push(
          <h3
            key={i}
            style={{
              ...headingStyles,
              fontSize: "1.25rem",
              borderBottom: "1px solid var(--card-border)",
              paddingBottom: "4px",
            }}
          >
            {parseTextElements(textVal, `h1-${i}`)}
          </h3>
        );
      } else if (level === 2) {
        elements.push(
          <h4
            key={i}
            style={{
              ...headingStyles,
              fontSize: "1.15rem",
              borderBottom: "1px solid var(--card-border)",
              paddingBottom: "2px",
            }}
          >
            {parseTextElements(textVal, `h2-${i}`)}
          </h4>
        );
      } else if (level === 3) {
        elements.push(<h5 key={i} style={{ ...headingStyles, fontSize: "1rem" }}>{parseTextElements(textVal, `h3-${i}`)}</h5>);
      } else {
        elements.push(<h6 key={i} style={{ ...headingStyles, fontSize: "0.9rem" }}>{parseTextElements(textVal, `h4-${i}`)}</h6>);
      }
      i++;
      continue;
    }

    // Regular line
    elements.push(
      <div key={i} style={{ minHeight: "1.2em", margin: "2px 0" }}>
        {parseTextElements(line, `line-${i}`)}
      </div>
    );
    i++;
  }

  return <div className="formatted-lines">{elements}</div>;
}

function isJsonString(str: string): boolean {
  const trimmed = str.trim();
  if (
    (trimmed.startsWith("{") && /\}\s*,?\s*$/.test(trimmed)) ||
    (trimmed.startsWith("[") && /\]\s*,?\s*$/.test(trimmed))
  ) {
    try {
      JSON.parse(trimmed.replace(/,\s*$/, ""));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function isEnvBlock(str: string): boolean {
  const lines = str.trim().split("\n");
  if (lines.length < 2) return false;
  const envLineRegex = /^[A-Z_][A-Z0-9_]*=.*/;
  const matchingLines = lines.filter((l) => envLineRegex.test(l.trim()));
  return matchingLines.length >= lines.length * 0.7;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const highlightedHtml = highlightSyntax(code);
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || "code"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="code-block-content">
        <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </div>
  );
}

interface FormattedMessageProps {
  content: string;
}

export default function FormattedMessage({ content }: FormattedMessageProps) {
  // Case 1: Entire message is valid JSON
  if (isJsonString(content)) {
    let formatted: string | null = null;
    let isMultiline = false;
    try {
      const trimmed = content.trim().replace(/,\s*$/, "");
      isMultiline = trimmed.split("\n").length > 1;
      formatted = isMultiline
        ? JSON.stringify(JSON.parse(trimmed), null, 2)
        : trimmed;
    } catch {
      // fallthrough
    }

    if (formatted !== null) {
      return isMultiline ? (
        <CodeBlock code={formatted} language="json" />
      ) : (
        <div className="formatted-message">
          <code className="inline-code">{formatted}</code>
        </div>
      );
    }
  }

  // Case 2: Entire message is env variables
  if (isEnvBlock(content)) {
    return <CodeBlock code={content.trim()} language="env" />;
  }

  // Case 3: Message contains fenced code blocks (```lang ... ```)
  const fencedRegex = /```(\w*)\n([\s\S]*?)\n```/g;
  if (fencedRegex.test(content)) {
    fencedRegex.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = fencedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(
          <React.Fragment key={`text-${lastIndex}`}>
            {renderLines(textBefore)}
          </React.Fragment>
        );
      }

      const lang = match[1] || "code";
      const code = match[2];
      if (lang.toLowerCase() === "mermaid") {
        parts.push(
          <MermaidDiagram key={`mermaid-${match.index}`} chart={code.trim()} />
        );
      } else {
        parts.push(
          <CodeBlock key={`code-${match.index}`} code={code.trimEnd()} language={lang} />
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(
        <React.Fragment key={`text-${lastIndex}`}>
          {renderLines(content.slice(lastIndex))}
        </React.Fragment>
      );
    }

    return <div className="formatted-message">{parts}</div>;
  }

  // Case 5: Plain text (handles line breaks, task lists, headers, tables, etc. and inline code)
  return renderLines(content);
}
