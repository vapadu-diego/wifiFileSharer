"use client";

import { useEffect, useState } from "react";
import CodeBlock from "./CodeBlock";
import FileIcon from "./FileIcon";

interface FilePreviewModalProps {
  fileName: string;
  url: string;
  downloadUrl: string;
  onClose: () => void;
}

type PreviewData = {
  name: string;
  size: number;
  language: string;
  content: string;
  truncated: boolean;
};

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; data: PreviewData }
  | { status: "error"; reason: string };

const ERROR_MESSAGES: Record<string, string> = {
  "too-large": "El archivo supera el límite de 512 KB para la vista previa.",
  binary: "El archivo parece ser binario y no se puede mostrar como texto.",
  "not-previewable": "Este tipo de archivo no se puede previsualizar.",
  missing: "El archivo ya no está disponible.",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilePreviewModal({
  fileName,
  url,
  downloadUrl,
  onClose,
}: FilePreviewModalProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(url)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.ok) {
          setState({ status: "ready", data });
        } else {
          setState({ status: "error", reason: data?.reason || "missing" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", reason: "missing" });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="file-preview-overlay" onClick={onClose}>
      <div className="file-preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="file-preview-header">
          <FileIcon mimeType="" fileName={fileName} size={22} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {fileName}
            </div>
            <div className="text-muted" style={{ fontSize: "0.7rem" }}>
              {state.status === "ready"
                ? `${formatSize(state.data.size)} · ${state.data.language}`
                : "Vista previa"}
            </div>
          </div>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
            title="Descargar"
            style={{ flexShrink: 0 }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </a>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ width: "32px", height: "32px", padding: 0, flexShrink: 0 }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="file-preview-body">
          {state.status === "loading" && (
            <div className="text-muted" style={{ padding: "3rem", textAlign: "center" }}>
              Cargando vista previa...
            </div>
          )}
          {state.status === "error" && (
            <div className="text-muted" style={{ padding: "3rem", textAlign: "center" }}>
              {ERROR_MESSAGES[state.reason] || ERROR_MESSAGES.missing}
            </div>
          )}
          {state.status === "ready" && (
            <CodeBlock
              code={state.data.content}
              language={state.data.language}
              maxHeight="62vh"
            />
          )}
        </div>
      </div>
    </div>
  );
}
