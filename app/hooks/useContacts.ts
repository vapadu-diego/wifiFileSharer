"use client";

import { useState, useEffect, useCallback, useRef, MutableRefObject } from "react";
import { Socket } from "socket.io-client";
import { OnlineUser, PrivateMessage, PrivateFile } from "@/lib/types";

export function useContacts(socket: Socket | null, chatPartnerRef: MutableRefObject<OnlineUser | null>) {
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
        if (prev.find((u) => u.id === user.id)) return prev;
        return [...prev, user];
      });
    };

    const handleUserOffline = ({ id }: { id: string }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.id !== id));
      setChatPartner((prev) => (prev && prev.id === id ? null : prev));
    };

    const handlePrivateMessage = (msg: PrivateMessage) => {
      if (chatPartnerRef.current?.id !== msg.fromId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.fromId]: (prev[msg.fromId] || 0) + 1,
        }));
      }
    };

    const handlePrivateFile = (f: PrivateFile) => {
      if (chatPartnerRef.current?.id !== f.fromId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [f.fromId]: (prev[f.fromId] || 0) + 1,
        }));
      }
    };

    socket.on("admin_status", handleAdminStatus);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);
    socket.on("private_message", handlePrivateMessage);
    socket.on("private_file", handlePrivateFile);

    return () => {
      socket.off("admin_status", handleAdminStatus);
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
      socket.off("private_message", handlePrivateMessage);
      socket.off("private_file", handlePrivateFile);
    };
  }, [socket, chatPartnerRef]);

  const handleStartChat = useCallback((user: OnlineUser) => {
    setChatPartner(user);
    setUnreadCounts((prev) => {
      const next = { ...prev };
      delete next[user.id];
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
  };
}
