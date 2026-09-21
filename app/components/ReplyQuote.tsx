"use client";

import { ReplyRef } from "@/lib/types";

interface ReplyQuoteProps {
  reply: ReplyRef;
  onJump?: (reply: ReplyRef) => void;
}

export function ReplyQuote({ reply, onJump }: ReplyQuoteProps) {
  const isCode = reply.kind === "code";
  const body = isCode ? reply.excerpt || reply.snippet : reply.snippet;

  return (
    <button
      type="button"
      className="reply-quote"
      onClick={(e) => {
        e.stopPropagation();
        onJump?.(reply);
      }}
      title="Ir al mensaje original"
      style={{ cursor: onJump ? "pointer" : "default" }}
    >
      <span className="reply-quote-header">
        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
        <span className="truncate">{reply.senderName}</span>
        {isCode && (
          <span className="reply-quote-meta">
            {reply.language || "code"}
            {reply.startLine ? ` · L${reply.startLine}${reply.endLine && reply.endLine !== reply.startLine ? `–L${reply.endLine}` : ""}` : ""}
          </span>
        )}
      </span>
      <span className={`reply-quote-body ${isCode ? "reply-quote-code" : ""}`}>
        {body || "Mensaje no disponible"}
      </span>
    </button>
  );
}

interface ReplyPreviewProps {
  reply: ReplyRef;
  onCancel: () => void;
}

export function ReplyPreview({ reply, onCancel }: ReplyPreviewProps) {
  const isCode = reply.kind === "code";
  const body = isCode ? reply.excerpt || reply.snippet : reply.snippet;

  return (
    <div className="reply-preview">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="reply-preview-header">
          Respondiendo a <strong>{reply.senderName}</strong>
          {isCode && (
            <span className="reply-quote-meta">
              {reply.language || "code"}
              {reply.startLine ? ` · L${reply.startLine}${reply.endLine && reply.endLine !== reply.startLine ? `–L${reply.endLine}` : ""}` : ""}
            </span>
          )}
        </div>
        <div className={`reply-preview-body ${isCode ? "reply-quote-code" : ""}`}>
          {body}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onCancel}
        title="Cancelar respuesta"
        style={{ width: "28px", height: "28px", padding: 0, flexShrink: 0 }}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
