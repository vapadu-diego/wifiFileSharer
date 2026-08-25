"use client";

import { useCallback, useState } from "react";
import { OnlineUser } from "@/lib/types";

export interface ToastItem {
  id: number;
  icon: string;
  title: string;
  body: string;
  user?: OnlineUser;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...toast, id }].slice(-4));
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return { toasts, pushToast, dismiss };
}
