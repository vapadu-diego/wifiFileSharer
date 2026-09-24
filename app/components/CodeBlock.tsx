"use client";

import { useState } from "react";
import { useShikiHighlight } from "@/app/hooks/useShiki";

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
      if (document.execCommand("copy")) resolve();
      else reject();
      textArea.remove();
    });
  }
}

export function CopyButton({ text, title = "Copiar" }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button onClick={handleCopy} className="code-copy-btn" title={title}>
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

interface CodeBlockProps {
  code: string;
  language?: string;
  maxHeight?: number | string;
}

export default function CodeBlock({ code, language, maxHeight }: CodeBlockProps) {
  const highlighted = useShikiHighlight(code, language);
  const lines = code.split("\n");

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || "code"}</span>
        <CopyButton text={code} />
      </div>
      {highlighted ? (
        <div
          className="code-block-content shiki-content"
          style={maxHeight !== undefined ? { maxHeight, overflow: "auto" } : undefined}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre className="code-block-content">
          <code>
            {lines.map((line, i) => (
              <span key={i} className="code-line" data-line={i + 1}>
                <span className="code-ln" aria-hidden="true">{i + 1}</span>
                <span className="code-line-text">{line || "\u00a0"}</span>
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
}
