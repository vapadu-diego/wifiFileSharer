"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Socket } from "socket.io-client";
import {
  FormatSuggestionsDropdown,
  getCommandQuery,
  handleSuggestionsKeyDown,
  FORMAT_OPTIONS,
} from "./FormatSuggestions";
import EmojiPicker, { insertAtCursor } from "./EmojiPicker";
import { formatJsonContent } from "@/lib/jsonFormat";

interface TextTabProps {
  socket: Socket;
  roomId: string;
  senderName: string;
}

export default function TextTab({ socket, roomId, senderName }: TextTabProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingEmitRef = useRef(0);

  // Suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [slashInfo, setSlashInfo] = useState<{ query: string; slashIndex: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Autofocus input when chat tab is opened
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const sendMessage = () => {
    if (!text.trim()) return;
    
    let content = text.trim();
    content = formatJsonContent(content);

    socket.emit("send_text", { roomId, content, senderName });
    setText("");
    setShowSuggestions(false);
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleSelectOption = (option: typeof FORMAT_OPTIONS[0]) => {
    if (!slashInfo || !inputRef.current) return;
    const textarea = inputRef.current;
    const val = textarea.value;
    const before = val.slice(0, slashInfo.slashIndex);
    const after = val.slice(textarea.selectionEnd || 0);
    const newText = before + option.insertText + after;
    setText(newText);
    setShowSuggestions(false);

    const newCursorPos = slashInfo.slashIndex + option.cursorOffset;
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleEmojiSelect = (emoji: string) => {
    if (inputRef.current) {
      insertAtCursor(inputRef.current, text, setText, emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (showEmojiPicker) setShowEmojiPicker(false);
    const now = Date.now();
    if (val.trim() && socket.connected && now - lastTypingEmitRef.current > 1500) {
      lastTypingEmitRef.current = now;
      socket.emit("room_typing", { roomId });
    }
    const cmd = getCommandQuery(val, e.target.selectionEnd || 0);
    if (cmd) {
      setSlashInfo(cmd);
      setShowSuggestions(true);
      setSelectedIndex((prev) => (slashInfo?.query === cmd.query ? prev : 0));
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const cmd = getCommandQuery(target.value, target.selectionEnd || 0);
    if (cmd && e.key !== "Escape") {
      setSlashInfo(cmd);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && slashInfo) {
      const filtered = FORMAT_OPTIONS.filter((opt) =>
        opt.label.toLowerCase().includes(slashInfo.query) ||
        opt.searchKeys.some((key) => key.includes(slashInfo.query))
      );

      const handled = handleSuggestionsKeyDown(
        e,
        showSuggestions,
        filtered.length,
        selectedIndex,
        setSelectedIndex,
        (idx) => {
          const option = filtered[idx];
          if (option) {
            handleSelectOption(option);
          }
        },
        () => setShowSuggestions(false)
      );

      if (handled) return;
    }

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
    <form
      onSubmit={handleSubmit}
      className="flex gap-3 items-end"
      style={{
        position: "relative",
        padding: "1rem",
        background: "rgba(0,0,0,0.2)",
        borderRadius: "var(--radius)",
      }}
    >
      {showSuggestions && slashInfo && (
        <FormatSuggestionsDropdown
          query={slashInfo.query}
          selectedIndex={selectedIndex}
          onSelect={handleSelectOption}
          onClose={() => setShowSuggestions(false)}
        />
      )}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setShowEmojiPicker((prev) => !prev);
          setShowSuggestions(false);
        }}
        title="Emojis"
        style={{
          width: "40px",
          height: "40px",
          padding: 0,
          flexShrink: 0,
          marginBottom: "2px",
        }}
      >
        <svg
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
      <textarea
        ref={inputRef}
        className="input no-scrollbar"
        style={{
          marginBottom: 0,
          flex: 1,
          minHeight: "44px",
          maxHeight: "120px",
          resize: "none",
          padding: "10px",
          lineHeight: "1.4",
        }}
        value={text}
        onChange={handleTextChange}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        placeholder="Escribe un mensaje... (Shift+Enter para salto de línea, o '/' para formatos)"
        rows={1}
      />
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: "auto", flexShrink: 0, height: "44px", cursor: !text.trim() ? "default" : undefined }}
        disabled={!text.trim()}
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </form>
  );
}
