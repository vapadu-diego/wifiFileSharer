"use client";

import { useEffect, useRef, type RefObject } from "react";

function copyToClipboard(text: string, selectionRange: Range | null): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus({ preventScroll: true });
  textArea.select();
  return new Promise((resolve, reject) => {
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    textArea.remove();
    if (selectionRange) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(selectionRange);
      }
    }
    if (copied) {
      resolve();
    } else {
      reject();
    }
  });
}

interface UseSelectionCopyOptions {
  enabled?: boolean;
  minLength?: number;
  onCopied: (text: string) => void;
}

/**
 * Copies the current text selection to the clipboard shortly after the user
 * selects it inside a `.message-bubble`. Listens to pointer releases for an
 * immediate copy and to `selectionchange` for keyboard, double click, release
 * outside the container and mobile selection handles. Ignores input fields and
 * short selections, and debounces repeated copies of the same text.
 */
export function useSelectionCopy(
  containerRef: RefObject<HTMLElement | null>,
  { enabled = true, minLength = 1, onCopied }: UseSelectionCopyOptions
) {
  const lastCopiedRef = useRef<{ text: string; at: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const onCopiedRef = useRef(onCopied);

  useEffect(() => {
    onCopiedRef.current = onCopied;
  }, [onCopied]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (text.length < minLength) return;

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorEl =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;
      const focusEl =
        focusNode instanceof Element ? focusNode : focusNode?.parentElement ?? null;
      if (!anchorEl || !focusEl) return;
      if (!container.contains(anchorEl) || !container.contains(focusEl)) return;
      if (!anchorEl.closest(".message-bubble") && !focusEl.closest(".message-bubble")) return;
      if (anchorEl.closest("textarea, input, [contenteditable='true']")) return;

      const now = Date.now();
      const last = lastCopiedRef.current;
      if (last && last.text === text && now - last.at < 1500) return;

      const selectionRange =
        selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

      copyToClipboard(text, selectionRange)
        .then(() => {
          lastCopiedRef.current = { text, at: Date.now() };
          onCopiedRef.current(text);
        })
        .catch(() => {});
    };

    const schedule = (delay: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(handleSelection, delay);
    };

    const scheduleFromPointer = () => schedule(200);
    const scheduleFromSelectionChange = () => schedule(350);

    container.addEventListener("mouseup", scheduleFromPointer);
    container.addEventListener("touchend", scheduleFromPointer);
    document.addEventListener("selectionchange", scheduleFromSelectionChange);
    return () => {
      container.removeEventListener("mouseup", scheduleFromPointer);
      container.removeEventListener("touchend", scheduleFromPointer);
      document.removeEventListener("selectionchange", scheduleFromSelectionChange);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [containerRef, enabled, minLength]);
}
