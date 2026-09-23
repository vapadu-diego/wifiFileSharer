"use client";

import { useState, useEffect, useCallback, MutableRefObject } from "react";
import { Socket } from "socket.io-client";
import { OnlineUser, PrivateMessage, PrivateFile } from "@/lib/types";
import { showBrowserNotification } from "@/lib/notifications";

export function useContacts(
  socket: Socket | null,
  chatPartnerRef: MutableRefObject<OnlineUser | null>,
  onNewMessage?: (info?: { sender?: string; body?: string }) => void,
  onToast?: (toast: { icon: string; title: string; body: string; user?: OnlineUser }) => void
) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [chatPartner, setChatPartner] = useState<OnlineUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!socket) return;

    const handleAdminStatus = ({ isAdmin: admin }: { isAdmin: boolean }) =>
      setIsAdmin(admin);

    const handleUserOnline = (user: OnlineUser) => {
      setOnlineUsers((prev) => {
        const idx = prev.findIndex((u) => u.persistentId === user.persistentId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = user;
          return updated;
        }
        return [...prev, user];
      });
      setChatPartner((prev) => {
        if (prev && prev.persistentId === user.persistentId) {
          return { ...user, isOnline: true };
        }
        return prev;
      });
    };

    // Only fired for users who hid themselves while offline; discoverable users
    // stay in the list through `user_updated` with isOnline: false
    const handleUserOffline = ({ persistentId }: { persistentId: string }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.persistentId !== persistentId));
      // DON'T close the chat — just mark the partner as offline
      setChatPartner((prev) => {
        if (prev && prev.persistentId === persistentId) {
          return { ...prev, isOnline: false };
        }
        return prev;
      });
    };

    const handleUserReconnected = (user: OnlineUser) => {
      // Update user in the online list (new socketId)
      setOnlineUsers((prev) => {
        const idx = prev.findIndex((u) => u.persistentId === user.persistentId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = user;
          return updated;
        }
        return [...prev, user];
      });
      // If this is the current chat partner, mark them as online again
      setChatPartner((prev) => {
        if (prev && prev.persistentId === user.persistentId) {
          return { ...user, isOnline: true };
        }
        return prev;
      });
    };

    const handleUserUpdated = (user: OnlineUser) => {
      setOnlineUsers((prev) => {
        const idx = prev.findIndex((u) => u.persistentId === user.persistentId);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...prev[idx], ...user };
        return updated;
      });
      setChatPartner((prev) => {
        if (prev && prev.persistentId === user.persistentId) {
          return { ...prev, ...user };
        }
        return prev;
      });
    };

    const handlePrivateMessage = (msg: PrivateMessage) => {
      // msg.fromId is now a persistentId
      const isCurrentPartner = chatPartnerRef.current?.persistentId === msg.fromId;
      if (!isCurrentPartner) {
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.fromId]: (prev[msg.fromId] || 0) + 1,
        }));
        onToast?.({
          icon: "💬",
          title: msg.fromName,
          body: msg.content.length > 100 ? msg.content.slice(0, 100) + "…" : msg.content,
          user: {
            id: msg.fromId,
            persistentId: msg.fromId,
            nickname: msg.fromName,
            os: "",
            browser: "",
            joinedAt: 0,
            isOnline: true,
          },
        });
      }
      showBrowserNotification(
        `💬 ${msg.fromName}`,
        msg.content.length > 100 ? msg.content.slice(0, 100) + "…" : msg.content
      );
      onNewMessage?.({ sender: msg.fromName, body: msg.content });
    };

    const handlePrivateFile = (f: PrivateFile) => {
      // f.fromId is now a persistentId
      const isCurrentPartner = chatPartnerRef.current?.persistentId !== f.fromId;
      if (isCurrentPartner) {
        setUnreadCounts((prev) => ({
          ...prev,
          [f.fromId]: (prev[f.fromId] || 0) + 1,
        }));
        onToast?.({
          icon: "📎",
          title: f.fromName,
          body: `Envió un archivo: ${f.name}`,
          user: {
            id: f.fromId,
            persistentId: f.fromId,
            nickname: f.fromName,
            os: "",
            browser: "",
            joinedAt: 0,
            isOnline: true,
          },
        });
      }
      showBrowserNotification(
        `📎 ${f.fromName}`,
        `Envió un archivo: ${f.name}`
      );
      onNewMessage?.({ sender: f.fromName, body: `📎 ${f.name}` });
    };

    socket.on("admin_status", handleAdminStatus);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);
    socket.on("user_reconnected", handleUserReconnected);
    socket.on("user_updated", handleUserUpdated);
    socket.on("private_message", handlePrivateMessage);
    socket.on("private_file", handlePrivateFile);

    return () => {
      socket.off("admin_status", handleAdminStatus);
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
      socket.off("user_reconnected", handleUserReconnected);
      socket.off("user_updated", handleUserUpdated);
      socket.off("private_message", handlePrivateMessage);
      socket.off("private_file", handlePrivateFile);
    };
  }, [socket, chatPartnerRef, onNewMessage, onToast]);

  const handleStartChat = useCallback((user: OnlineUser) => {
    setChatPartner(user);
    // Clear unread using persistentId
    setUnreadCounts((prev) => {
      const next = { ...prev };
      delete next[user.persistentId];
      return next;
    });
  }, []);

  return {
    onlineUsers,
    setOnlineUsers,
    chatPartner,
    setChatPartner,
    handleStartChat,
    isAdmin,
    unreadCounts,
    setUnreadCounts,
  };
}
