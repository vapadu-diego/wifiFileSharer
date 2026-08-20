"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Socket } from "socket.io-client";

interface TextTabProps {
  socket: Socket;
  roomId: string;
  senderName: string;
}

export default function TextTab({ socket, roomId, senderName }: TextTabProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus input when chat tab is opened
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = () => {
    if (!text.trim()) return;
    socket.emit("send_text", { roomId, content: text.trim(), senderName });
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-end" style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius)" }}>
      <textarea
        ref={inputRef}
        className="input"
        style={{ marginBottom: 0, flex: 1, minHeight: "44px", maxHeight: "120px", resize: "none", padding: "10px", lineHeight: "1.4" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe un mensaje... (Shift+Enter para salto de línea)"
        rows={1}
      />
      <button type="submit" className="btn btn-primary" style={{ width: "auto", flexShrink: 0, height: "44px" }} disabled={!text.trim()}>
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </form>
  );
}
