"use client";

import { useState, useCallback } from "react";

interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: "info" | "warning" | "error";
}

export function useModal() {
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  const showModal = useCallback(
    (title: string, message: string, type: "info" | "warning" | "error" = "info") => {
      setModalConfig({ isOpen: true, title, message, type });
    },
    []
  );

  const hideModal = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return { modalConfig, showModal, hideModal };
}
