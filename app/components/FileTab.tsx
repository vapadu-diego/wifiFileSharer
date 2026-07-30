"use client";

import { useState, useRef, DragEvent } from "react";

interface FileTabProps {
  roomId: string;
  senderId: string;
  senderName: string;
  maxFileSize: number;
}

export default function FileTab({ roomId, senderId, senderName, maxFileSize }: FileTabProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const maxMB = Math.round(maxFileSize / 1024 / 1024);

  const handleUpload = async (file: File) => {
    setError("");

    // Client-side validation
    if (file.size > maxFileSize) {
      setError(`Archivo muy grande. Máximo: ${maxMB}MB`);
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("roomId", roomId);
    formData.append("senderId", senderId);
    formData.append("senderName", senderName);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al subir archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Dropzone */}
      <div
        className={`dropzone ${dragActive ? "active" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileChange}
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-pulse" width="48" height="48" fill="none" stroke="var(--primary)" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
            <span className="text-primary">Subiendo archivo...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ opacity: 0.5 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <div>
              <span className="text-primary" style={{ fontWeight: 600 }}>Haz clic</span>
              <span className="text-muted"> o arrastra un archivo</span>
            </div>
            <span className="badge badge-secondary">Máx. {maxMB}MB</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="animate-fadeIn" style={{
          background: "rgba(255, 51, 102, 0.1)",
          border: "1px solid var(--accent)",
          borderRadius: "var(--radius)",
          padding: "12px",
          color: "var(--accent)",
          fontSize: "0.9rem"
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
