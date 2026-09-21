"use client";

import { useCallback, useState } from "react";
import { OnlineUser } from "@/lib/types";

export interface ToastItem {
  id: number;
  icon: string;
  title: string;
  body?: string;
  user?: OnlineUser;
  variant?: "dark" | "light";
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">, durationMs = 5000) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { ...toast, id }].slice(-4));
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss]
  );

  return { toasts, pushToast, dismiss };
}
