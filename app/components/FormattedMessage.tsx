"use client";

import React, { useState } from "react";

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
    textArea.focus();
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

/** Detect if text is valid JSON (object or array) */
function isJsonString(str: string): boolean {
  const trimmed = str.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Detect env-like content: multiple lines of KEY=VALUE */
function isEnvBlock(str: string): boolean {
  const lines = str.trim().split("\n");
  if (lines.length < 2) return false;
  const envLineRegex = /^[A-Z_][A-Z0-9_]*=.*/;
  const matchingLines = lines.filter((l) => envLineRegex.test(l.trim()));
  return matchingLines.length >= lines.length * 0.7;
}

/** Render a code block with header and copy button */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || "code"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="code-block-content">
        <code>{code}</code>
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
    try {
      const formatted = JSON.stringify(JSON.parse(content.trim()), null, 2);
      return <CodeBlock code={formatted} language="json" />;
    } catch {
      // fallthrough
    }
  }

  // Case 2: Entire message is env variables
  if (isEnvBlock(content)) {
    return <CodeBlock code={content.trim()} language="env" />;
  }

  // Case 3: Message contains fenced code blocks (```lang ... ```)
  const fencedRegex = /```(\w*)\n([\s\S]*?)```/g;
  if (fencedRegex.test(content)) {
    // Reset regex
    fencedRegex.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = fencedRegex.exec(content)) !== null) {
      // Text before the code block
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(
          <span key={`text-${lastIndex}`}>
            {renderInlineCode(textBefore)}
          </span>
        );
      }

      const lang = match[1] || "code";
      const code = match[2];
      parts.push(
        <CodeBlock key={`code-${match.index}`} code={code.trimEnd()} language={lang} />
      );

      lastIndex = match.index + match[0].length;
    }

    // Remaining text after last code block
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {renderInlineCode(content.slice(lastIndex))}
        </span>
      );
    }

    return <div className="formatted-message">{parts}</div>;
  }

  // Case 4: Message with inline code only (`code`)
  if (content.includes("`")) {
    return <div className="formatted-message">{renderInlineCode(content)}</div>;
  }

  // Case 5: Plain text
  return <span>{content}</span>;
}

/** Render inline code segments wrapped in backticks */
function renderInlineCode(text: string): React.ReactNode[] {
  const inlineRegex = /`([^`]+)`/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <code key={match.index} className="inline-code">
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
