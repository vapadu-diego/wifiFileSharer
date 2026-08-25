"use client";

import { useState, useEffect, useCallback, MutableRefObject } from "react";
import { Socket } from "socket.io-client";
import { OnlineUser, PrivateMessage, PrivateFile } from "@/lib/types";
import { showBrowserNotification } from "@/lib/notifications";
import { addLocalMessage, addLocalFile, editLocalMessage, deleteLocalMessage } from "@/lib/chatPersistence";

export function useContacts(
  socket: Socket | null,
  chatPartnerRef: MutableRefObject<OnlineUser | null>,
  myUserId: string,
  onNewMessage?: () => void,
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

    const handlePrivateMessage = (msg: PrivateMessage) => {
      // msg.fromId is now a persistentId
      addLocalMessage(myUserId, msg.fromId, msg);

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
      onNewMessage?.();
    };

    const handlePrivateFile = (f: PrivateFile) => {
      // f.fromId is now a persistentId
      addLocalFile(myUserId, f.fromId, f);

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
      onNewMessage?.();
    };

    const handlePrivateMessageEdited = ({ id, fromId, content }: { id: string; fromId: string; content: string }) => {
      editLocalMessage(myUserId, fromId, id, content);
      onNewMessage?.();
    };

    const handlePrivateMessageDeleted = ({ id, fromId }: { id: string; fromId: string }) => {
      deleteLocalMessage(myUserId, fromId, id);
      onNewMessage?.();
    };

    socket.on("admin_status", handleAdminStatus);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);
    socket.on("user_reconnected", handleUserReconnected);
    socket.on("private_message", handlePrivateMessage);
    socket.on("private_file", handlePrivateFile);
    socket.on("private_message_edited", handlePrivateMessageEdited);
    socket.on("private_message_deleted", handlePrivateMessageDeleted);

    return () => {
      socket.off("admin_status", handleAdminStatus);
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
      socket.off("user_reconnected", handleUserReconnected);
      socket.off("private_message", handlePrivateMessage);
      socket.off("private_file", handlePrivateFile);
      socket.off("private_message_edited", handlePrivateMessageEdited);
      socket.off("private_message_deleted", handlePrivateMessageDeleted);
    };
  }, [socket, chatPartnerRef, myUserId, onNewMessage, onToast]);

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
  };
}
