"use client";

import { useEffect, useState, useRef } from "react";
import io, { Socket } from "socket.io-client";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    const socketInstance = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Publish the socket asynchronously so the first render stays stable
    // (avoids setState synchronously inside the effect)
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSocket(socketInstance);
    });

    socketInstance.on("connect", () => {
      reconnectAttemptRef.current = 0;
      setIsReconnecting(false);
    });

    socketInstance.on("disconnect", (reason) => {
      setIsReconnecting(true);
      if (reason === "io server disconnect") {
        socketInstance.connect();
      }
    });

    socketInstance.on("reconnect_attempt", (attempt) => {
      reconnectAttemptRef.current = attempt;
    });

    return () => {
      cancelled = true;
      socketInstance.disconnect();
    };
  }, []);

  return { socket, isReconnecting };
}
