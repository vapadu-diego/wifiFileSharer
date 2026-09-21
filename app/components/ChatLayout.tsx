"use client";

import React from "react";
import { useKeyboardInset } from "../hooks/useVisualViewportInset";

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  showMain: boolean;
}

export default function ChatLayout({ sidebar, main, showMain }: ChatLayoutProps) {
  useKeyboardInset();

  return (
    <div
      className="chat-layout"
      style={{
        paddingBottom: "calc(var(--kb-inset, 0px) + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className={`chat-sidebar ${showMain ? "chat-sidebar-hidden-mobile" : ""}`}>
        {sidebar}
      </div>
      <div className={`chat-main ${showMain ? "chat-main-visible-mobile" : "chat-main-hidden-mobile"}`}>
        {main}
      </div>
    </div>
  );
}
