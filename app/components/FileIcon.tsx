"use client";

import React from "react";
import { getFileCategory } from "@/lib/types";

interface FileIconProps {
  mimeType: string;
  fileName?: string;
  size?: number;
  className?: string;
}

export default function FileIcon({ mimeType, fileName, size = 24, className = "" }: FileIconProps) {
  const category = getFileCategory(mimeType, fileName);

  const icons: Record<string, React.ReactNode> = {
    image: (
      <svg width={size} height={size} fill="none" stroke="var(--success)" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
    video: (
      <svg width={size} height={size} fill="none" stroke="var(--accent)" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M10 9l5 3-5 3V9z" />
      </svg>
    ),
    audio: (
      <svg width={size} height={size} fill="none" stroke="var(--secondary)" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
    pdf: (
      <svg width={size} height={size} fill="none" stroke="#ef4444" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
    document: (
      <svg width={size} height={size} fill="none" stroke="#3b82f6" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    spreadsheet: (
      <svg width={size} height={size} fill="none" stroke="#22c55e" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M8 13h2M14 13h2M8 17h2M14 17h2" />
      </svg>
    ),
    archive: (
      <svg width={size} height={size} fill="none" stroke="#f59e0b" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
      </svg>
    ),
    code: (
      <svg width={size} height={size} fill="none" stroke="var(--primary)" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    default: (
      <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  };

  return icons[category] || icons.default;
}
