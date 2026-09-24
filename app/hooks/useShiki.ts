"use client";

import { useEffect, useState } from "react";
import type { HighlighterCore, ShikiTransformer } from "shiki/core";

export const SHIKI_THEME = "github-dark-default";
const MAX_CACHE_ENTRIES = 300;

/**
 * Curated language set. Each grammar is loaded lazily (separate chunk), so the
 * initial bundle stays small and only languages actually used are fetched.
 */
const LANGUAGE_LOADERS = [
  () => import("shiki/langs/javascript.mjs"),
  () => import("shiki/langs/typescript.mjs"),
  () => import("shiki/langs/jsx.mjs"),
  () => import("shiki/langs/tsx.mjs"),
  () => import("shiki/langs/json.mjs"),
  () => import("shiki/langs/html.mjs"),
  () => import("shiki/langs/css.mjs"),
  () => import("shiki/langs/python.mjs"),
  () => import("shiki/langs/java.mjs"),
  () => import("shiki/langs/c.mjs"),
  () => import("shiki/langs/cpp.mjs"),
  () => import("shiki/langs/csharp.mjs"),
  () => import("shiki/langs/go.mjs"),
  () => import("shiki/langs/rust.mjs"),
  () => import("shiki/langs/php.mjs"),
  () => import("shiki/langs/ruby.mjs"),
  () => import("shiki/langs/sql.mjs"),
  () => import("shiki/langs/bash.mjs"),
  () => import("shiki/langs/yaml.mjs"),
  () => import("shiki/langs/markdown.mjs"),
  () => import("shiki/langs/xml.mjs"),
  () => import("shiki/langs/diff.mjs"),
  () => import("shiki/langs/dockerfile.mjs"),
  () => import("shiki/langs/dotenv.mjs"),
  () => import("shiki/langs/ini.mjs"),
];

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  py: "python",
  rb: "ruby",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
  htm: "html",
  env: "dotenv",
  conf: "ini",
  cfg: "ini",
  toml: "ini",
  jsonc: "json",
  scss: "css",
  less: "css",
  patch: "diff",
  log: "text",
  txt: "text",
  text: "text",
  plaintext: "text",
};

export function normalizeLanguage(language?: string): string {
  const raw = (language || "").trim().toLowerCase();
  if (!raw || raw === "code") return "text";
  return LANGUAGE_ALIASES[raw] || raw;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const htmlCache = new Map<string, string>();

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighterCore } = await import("shiki/core");
      const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
      return createHighlighterCore({
        themes: [import("shiki/themes/github-dark-default.mjs")],
        langs: LANGUAGE_LOADERS.map((load) => load()),
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

function cacheHtml(key: string, html: string): void {
  if (htmlCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = htmlCache.keys().next().value;
    if (oldest !== undefined) htmlCache.delete(oldest);
  }
  htmlCache.set(key, html);
}

/** Tags each line so jump-to-line and CSS line numbers keep working. */
const lineTransformer: ShikiTransformer = {
  line(node, line) {
    node.properties["data-line"] = line;
    node.properties.class = "line code-line";
  },
};

interface HighlightState {
  key: string;
  html: string;
}

/**
 * Returns Shiki-highlighted HTML for `code`, or null while the highlighter
 * (and the language grammar) is still loading.
 */
export function useShikiHighlight(code: string, language?: string): string | null {
  const lang = normalizeLanguage(language);
  const key = `${lang}\u0000${code}`;
  const [state, setState] = useState<HighlightState | null>(() => {
    const cached = htmlCache.get(key);
    return cached ? { key, html: cached } : null;
  });

  useEffect(() => {
    let cancelled = false;

    getHighlighter()
      .then((highlighter) => {
        const cached = htmlCache.get(key);
        if (cached) {
          if (!cancelled) setState({ key, html: cached });
          return;
        }
        let html: string;
        try {
          html = highlighter.codeToHtml(code, {
            lang,
            theme: SHIKI_THEME,
            transformers: [lineTransformer],
          });
        } catch {
          html = highlighter.codeToHtml(code, {
            lang: "text",
            theme: SHIKI_THEME,
            transformers: [lineTransformer],
          });
        }
        cacheHtml(key, html);
        if (!cancelled) setState({ key, html });
      })
      .catch(() => {
        // Highlighting is best-effort: CodeBlock falls back to plain text
      });

    return () => {
      cancelled = true;
    };
  }, [key, code, lang]);

  return state && state.key === key ? state.html : null;
}
