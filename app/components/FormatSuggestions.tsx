"use client";

import React, { useEffect, useRef } from "react";

export interface FormatOption {
  label: string;
  description: string;
  insertText: string;
  cursorOffset: number;
  searchKeys: string[];
}

export const FORMAT_OPTIONS: FormatOption[] = [
  {
    label: "Negrita",
    description: "**texto**",
    insertText: "****",
    cursorOffset: 2,
    searchKeys: ["negrita", "bold", "n", "b"],
  },
  {
    label: "Itálica",
    description: "*texto*",
    insertText: "**",
    cursorOffset: 1,
    searchKeys: ["italica", "italic", "i"],
  },
  {
    label: "Código en línea",
    description: "`código`",
    insertText: "``",
    cursorOffset: 1,
    searchKeys: ["codigo", "code", "c"],
  },
  {
    label: "Bloque de código",
    description: "```código```",
    insertText: "```\n\n```",
    cursorOffset: 4,
    searchKeys: ["bloque", "block", "codeblock", "b"],
  },
  {
    label: "Lista de tareas",
    description: "- [ ] tarea",
    insertText: "- [ ] ",
    cursorOffset: 6,
    searchKeys: ["tarea", "task", "todo", "t"],
  },
  {
    label: "Lista simple",
    description: "- elemento",
    insertText: "- ",
    cursorOffset: 2,
    searchKeys: ["lista", "list", "l"],
  },
  {
    label: "Título",
    description: "# Título",
    insertText: "# ",
    cursorOffset: 2,
    searchKeys: ["titulo", "header", "h", "1"],
  },
  {
    label: "Tabla",
    description: "Tabla de Markdown",
    insertText: "| Columna 1 | Columna 2 |\n| :--- | :--- |\n| Fila 1 | Fila 2 |\n",
    cursorOffset: 73,
    searchKeys: ["tabla", "table"],
  },
];

export const getCommandQuery = (val: string, selectionEnd: number) => {
  const textBeforeCursor = val.slice(0, selectionEnd);
  const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
  if (lastSlashIndex === -1) return null;

  const query = textBeforeCursor.slice(lastSlashIndex + 1);
  if (/\s/.test(query)) return null;

  // Slash must be at start of line or preceded by whitespace
  if (lastSlashIndex > 0 && !/\s/.test(textBeforeCursor[lastSlashIndex - 1])) {
    return null;
  }

  return {
    query: query.toLowerCase(),
    slashIndex: lastSlashIndex,
  };
};

interface FormatSuggestionsDropdownProps {
  query: string;
  selectedIndex: number;
  onSelect: (option: FormatOption) => void;
  onClose: () => void;
}

export function FormatSuggestionsDropdown({
  query,
  selectedIndex,
  onSelect,
  onClose,
}: FormatSuggestionsDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const filteredOptions = FORMAT_OPTIONS.filter((opt) =>
    opt.label.toLowerCase().includes(query) ||
    opt.searchKeys.some((key) => key.includes(query))
  );

  useEffect(() => {
    const handleOuterClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOuterClick);
    return () => document.removeEventListener("mousedown", handleOuterClick);
  }, [onClose]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filteredOptions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "10px",
        width: "280px",
        maxWidth: "calc(100vw - 24px)",
        background: "rgba(18, 18, 26, 0.95)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 1px 0 rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        zIndex: 100,
        overflow: "hidden",
        maxHeight: "220px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "8px 12px 6px 12px",
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "var(--muted)",
          borderBottom: "1px solid var(--card-border)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Formatos de texto
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "4px" }}>
        {filteredOptions.map((option, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={option.label}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              onClick={() => onSelect(option)}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                background: isSelected ? "rgba(0, 240, 255, 0.08)" : "transparent",
                border: isSelected ? "1px solid rgba(0, 240, 255, 0.15)" : "1px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    color: isSelected ? "var(--primary)" : "var(--foreground)",
                  }}
                >
                  {option.label}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    background: "rgba(255, 255, 255, 0.05)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    color: isSelected ? "var(--primary)" : "var(--muted)",
                  }}
                >
                  {option.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const handleSuggestionsKeyDown = (
  e: React.KeyboardEvent,
  showSuggestions: boolean,
  filteredOptionsCount: number,
  selectedIndex: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  onSelectOption: (idx: number) => void,
  onClose: () => void
): boolean => {
  if (!showSuggestions) return false;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setSelectedIndex((prev) => (prev + 1) % filteredOptionsCount);
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    setSelectedIndex((prev) => (prev - 1 + filteredOptionsCount) % filteredOptionsCount);
    return true;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    onSelectOption(selectedIndex);
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onClose();
    return true;
  }
  return false;
};
