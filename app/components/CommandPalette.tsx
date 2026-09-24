"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { OnlineUser } from "@/lib/types";
import { RecentRoom } from "@/app/hooks/useRecentRooms";

interface SearchResultItem {
  message: { id: string; content: string; createdAt: number; fromName: string };
  partnerId: string;
  partnerName: string;
  partnerOnline: boolean;
  snippet: string;
}

interface SearchResponse {
  results: SearchResultItem[];
  hasMore: boolean;
  error?: string;
}

interface SearchState {
  query: string;
  loading: boolean;
  results: SearchResultItem[];
}

type PaletteItem =
  | { kind: "message"; key: string; result: SearchResultItem }
  | { kind: "contact"; key: string; user: OnlineUser }
  | { kind: "room"; key: string; room: RecentRoom }
  | { kind: "action"; key: string; icon: string; label: string; run: () => void };

interface CommandPaletteProps {
  socket: Socket;
  contacts: OnlineUser[];
  myPersistentId: string;
  recentRooms: RecentRoom[];
  onOpenConversation: (partner: OnlineUser, messageId?: string) => void;
  onJoinRecentRoom: (room: RecentRoom) => void;
  onOpenSettings: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onClose: () => void;
}

const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

function formatTime(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("es", { day: "2-digit", month: "short" });
}

function Snippet({ text }: { text: string }) {
  const parts = text.split(/\[\[|\]\]/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="palette-mark">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function CommandPalette({
  socket,
  contacts,
  myPersistentId,
  recentRooms,
  onOpenConversation,
  onJoinRecentRoom,
  onOpenSettings,
  onCreateRoom,
  onJoinRoom,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ query: "", loading: false, results: [] });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  // Debounced full-text search over private conversations
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !socket.connected) return;
    const timer = window.setTimeout(() => {
      setSearchState({ query: trimmed, loading: true, results: [] });
      socket.emit(
        "search_private_messages",
        { query: trimmed, limit: 20 },
        (res: SearchResponse) => {
          setSearchState({ query: trimmed, loading: false, results: res?.results || [] });
        }
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, socket]);

  const trimmedRaw = query.trim();
  const trimmedQuery = trimmedRaw.toLowerCase();
  const searching = trimmedQuery.length >= 2 && (searchState.query !== trimmedRaw || searchState.loading);
  const results = useMemo(
    () => (searchState.query === trimmedRaw ? searchState.results : []),
    [searchState, trimmedRaw]
  );

  const matchingContacts = useMemo(() => {
    const list = contacts.filter((user) => user.persistentId !== myPersistentId);
    const filtered = trimmedQuery
      ? list.filter((user) => user.nickname.toLowerCase().includes(trimmedQuery))
      : list;
    return filtered.slice(0, 6);
  }, [contacts, myPersistentId, trimmedQuery]);

  const matchingRooms = useMemo(() => {
    const list = trimmedQuery
      ? recentRooms.filter((room) => room.id.toLowerCase().includes(trimmedQuery))
      : recentRooms;
    return list.slice(0, 4);
  }, [recentRooms, trimmedQuery]);

  const actions = useMemo(
    () => [
      { key: "settings", icon: "⚙️", label: "Configuración", run: onOpenSettings },
      { key: "create-room", icon: "＋", label: "Crear sala", run: onCreateRoom },
      { key: "join-room", icon: "🔗", label: "Unirse a una sala", run: onJoinRoom },
    ],
    [onOpenSettings, onCreateRoom, onJoinRoom]
  );

  const matchingActions = useMemo(
    () => (trimmedQuery ? actions.filter((a) => a.label.toLowerCase().includes(trimmedQuery)) : actions),
    [actions, trimmedQuery]
  );

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    if (trimmedQuery.length >= 2) {
      for (const result of results) {
        list.push({ kind: "message", key: `m-${result.message.id}`, result });
      }
    }
    for (const user of matchingContacts) {
      list.push({ kind: "contact", key: `c-${user.persistentId}`, user });
    }
    for (const room of matchingRooms) {
      list.push({ kind: "room", key: `r-${room.id}`, room });
    }
    for (const action of matchingActions) {
      list.push({ kind: "action", key: `a-${action.key}`, icon: action.icon, label: action.label, run: action.run });
    }
    return list;
  }, [trimmedQuery, results, matchingContacts, matchingRooms, matchingActions]);

  const activeIndex = selectedIndex < items.length ? selectedIndex : 0;

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-palette-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const openResult = useCallback(
    (result: SearchResultItem) => {
      const existing = contacts.find((user) => user.persistentId === result.partnerId);
      const partner: OnlineUser = existing ?? {
        id: result.partnerId,
        persistentId: result.partnerId,
        nickname: result.partnerName,
        os: "",
        browser: "",
        joinedAt: 0,
        isOnline: result.partnerOnline,
      };
      onOpenConversation(partner, result.message.id);
    },
    [contacts, onOpenConversation]
  );

  const runItem = useCallback(
    (item: PaletteItem) => {
      if (item.kind === "message") openResult(item.result);
      else if (item.kind === "contact") onOpenConversation(item.user);
      else if (item.kind === "room") onJoinRecentRoom(item.room);
      else item.run();
      onClose();
    },
    [openResult, onOpenConversation, onJoinRecentRoom, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(items.length === 0 ? 0 : (activeIndex + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(items.length === 0 ? 0 : (activeIndex - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const itemIndex = new Map(items.map((item, i) => [item.key, i]));

  const renderSection = (title: string, children: ReactNode, show: boolean) =>
    show ? (
      <div className="palette-section">
        <div className="palette-section-title">{title}</div>
        {children}
      </div>
    ) : null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <svg width="18" height="18" fill="none" stroke="var(--muted)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Buscar mensajes, contactos, salas o acciones..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>

        <div className="palette-results">
          {renderSection(
            searching ? "Buscando..." : "Mensajes",
            results.map((result) => {
              const itemKey = `m-${result.message.id}`;
              const i = itemIndex.get(itemKey) ?? 0;
              return (
                <button
                  key={itemKey}
                  data-palette-index={i}
                  className={`palette-item ${i === activeIndex ? "selected" : ""}`}
                  onClick={() => runItem({ kind: "message", key: itemKey, result })}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="palette-avatar">{getInitials(result.partnerName)}</span>
                  <span className="palette-item-body">
                    <span className="palette-item-title">
                      {result.partnerName}
                      <span className="palette-item-time">{formatTime(result.message.createdAt)}</span>
                    </span>
                    <span className="palette-item-subtitle palette-snippet">
                      <Snippet text={result.snippet} />
                    </span>
                  </span>
                </button>
              );
            }),
            trimmedQuery.length >= 2
          )}

          {renderSection(
            "Contactos",
            matchingContacts.map((user) => {
              const itemKey = `c-${user.persistentId}`;
              const i = itemIndex.get(itemKey) ?? 0;
              const isOnline = user.isOnline !== false;
              return (
                <button
                  key={itemKey}
                  data-palette-index={i}
                  className={`palette-item ${i === activeIndex ? "selected" : ""}`}
                  onClick={() => runItem({ kind: "contact", key: itemKey, user })}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="palette-avatar">{getInitials(user.nickname)}</span>
                  <span className="palette-item-body">
                    <span className="palette-item-title">{user.nickname}</span>
                    <span className="palette-item-subtitle">
                      <span style={{ color: isOnline ? "var(--success)" : "var(--muted)" }}>●</span>{" "}
                      {isOnline ? "En línea" : "Desconectado"}
                    </span>
                  </span>
                </button>
              );
            }),
            matchingContacts.length > 0
          )}

          {renderSection(
            "Salas recientes",
            matchingRooms.map((room) => {
              const itemKey = `r-${room.id}`;
              const i = itemIndex.get(itemKey) ?? 0;
              return (
                <button
                  key={itemKey}
                  data-palette-index={i}
                  className={`palette-item ${i === activeIndex ? "selected" : ""}`}
                  onClick={() => runItem({ kind: "room", key: itemKey, room })}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="palette-avatar palette-avatar-room">#</span>
                  <span className="palette-item-body">
                    <span className="palette-item-title">{room.id}</span>
                    <span className="palette-item-subtitle">Unirse a la sala</span>
                  </span>
                </button>
              );
            }),
            matchingRooms.length > 0
          )}

          {renderSection(
            "Acciones",
            matchingActions.map((action) => {
              const itemKey = `a-${action.key}`;
              const i = itemIndex.get(itemKey) ?? 0;
              return (
                <button
                  key={itemKey}
                  data-palette-index={i}
                  className={`palette-item ${i === activeIndex ? "selected" : ""}`}
                  onClick={() => runItem({ kind: "action", key: itemKey, icon: action.icon, label: action.label, run: action.run })}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="palette-avatar palette-avatar-action">{action.icon}</span>
                  <span className="palette-item-body">
                    <span className="palette-item-title">{action.label}</span>
                  </span>
                </button>
              );
            }),
            matchingActions.length > 0
          )}

          {items.length === 0 && !searching && (
            <div className="palette-empty">Sin resultados para “{query.trim()}”</div>
          )}
        </div>

        <div className="palette-footer">
          <span><kbd className="palette-kbd">↑</kbd><kbd className="palette-kbd">↓</kbd> navegar</span>
          <span><kbd className="palette-kbd">Enter</kbd> abrir</span>
          <span><kbd className="palette-kbd">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
