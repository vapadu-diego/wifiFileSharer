"use client";

import React from "react";

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  showMain: boolean;
}

export default function ChatLayout({ sidebar, main, showMain }: ChatLayoutProps) {
  return (
    <div className="chat-layout">
      <div className={`chat-sidebar ${showMain ? "chat-sidebar-hidden-mobile" : ""}`}>
        {sidebar}
      </div>
      <div className={`chat-main ${showMain ? "chat-main-visible-mobile" : "chat-main-hidden-mobile"}`}>
        {main}
      </div>
    </div>
  );
}
