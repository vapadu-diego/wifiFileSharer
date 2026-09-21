"use client";

import { useEffect, useState } from "react";

/**
 * Returns the height (px) of the on-screen keyboard when it overlaps the
 * layout viewport (iOS). On Android with `interactive-widget: resizes-content`
 * the layout already shrinks, so this returns ~0 and does not interfere.
 *
 * Also sets `--kb-inset` on <html> so other fixed elements (toasts, etc.)
 * can lift themselves above the keyboard.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const bottom = window.innerHeight - vv.height - vv.offsetTop;
      const next = Math.max(0, bottom);
      setInset(next);
      document.documentElement.style.setProperty("--kb-inset", `${next}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.setProperty("--kb-inset", "0px");
    };
  }, []);

  return inset;
}
