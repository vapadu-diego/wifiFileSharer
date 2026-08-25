"use client";

import { useEffect } from "react";

const DEFAULT_ICON = "/icon.png";
const SIZE = 32;
const FRAME_COUNT = 3;

function getIconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

function drawBreathingFrame(ease: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return DEFAULT_ICON;

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = 5 + ease * 10;
  const alpha = 0.55 + ease * 0.45;

  const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, SIZE * 0.55);
  halo.addColorStop(0, `rgba(255, 51, 102, ${0.25 + ease * 0.5})`);
  halo.addColorStop(1, "rgba(255, 51, 102, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 51, 102, ${alpha})`;
  ctx.fill();

  return canvas.toDataURL("image/png");
}

let breathingFramesPromise: Promise<string[]> | null = null;

function getBreathingFrames(): Promise<string[]> {
  if (!breathingFramesPromise) {
    breathingFramesPromise = Promise.resolve(
      Array.from({ length: FRAME_COUNT }, (_, i) => {
        const progress = i / FRAME_COUNT;
        const ease = 0.5 - 0.5 * Math.cos(2 * Math.PI * progress);
        return drawBreathingFrame(ease);
      })
    );
  }
  return breathingFramesPromise;
}

export function useFaviconBadge(count: number) {
  useEffect(() => {
    if (count <= 0) {
      getIconLink().href = DEFAULT_ICON;
      return;
    }

    let stopped = false;
    let frameIndex = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    getBreathingFrames().then((frames) => {
      if (stopped) return;
      const link = getIconLink();
      link.href = frames[0];
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        link.href = frames[frameIndex];
      }, 200);
    });

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      getIconLink().href = DEFAULT_ICON;
    };
  }, [count]);
}
