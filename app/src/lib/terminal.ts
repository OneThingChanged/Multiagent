import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Terminal } from "@xterm/xterm";
import type { ILink, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { DropZone, TerminalEntry } from "../types";
import { loadAppTheme, type AppThemeId } from "./appTheme";

const LS_TERMINAL_FONT_SIZE = "multiagent.terminalFontSize.v1";
const DEFAULT_TERMINAL_FONT_SIZE = 13;
const MIN_TERMINAL_FONT_SIZE = 9;
const MAX_TERMINAL_FONT_SIZE = 24;
const TERMINAL_THEMES: Record<AppThemeId, ITheme> = {
  soft: {
    background: "#0d1117",
    foreground: "#b8c2cc",
    cursor: "#c6d0dc",
    selectionBackground: "#2d3a4b",
    white: "#b8c2cc",
    brightWhite: "#d7dee8",
  },
  github: {
    background: "#0d1117",
    foreground: "#c9d1d9",
    cursor: "#f0f6fc",
    selectionBackground: "#264f78",
    white: "#c9d1d9",
    brightWhite: "#f0f6fc",
  },
  warm: {
    background: "#100d0b",
    foreground: "#c9c0b0",
    cursor: "#eadfca",
    selectionBackground: "#4a3824",
    white: "#c9c0b0",
    brightWhite: "#eadfca",
  },
  light: {
    background: "#ffffff",
    foreground: "#24292f",
    cursor: "#0969da",
    selectionBackground: "#bfdbfe",
    white: "#24292f",
    brightWhite: "#111827",
    black: "#ffffff",
    brightBlack: "#57606a",
  },
};

const TERMINAL_THEME = TERMINAL_THEMES.soft;

export function applyTerminalTheme(term: Terminal, theme: AppThemeId) {
  term.options.theme = TERMINAL_THEMES[theme] ?? TERMINAL_THEME;
}
const MARKDOWN_PATH_RE =
  /(?:[A-Za-z]:[\\/])?(?:\.{1,2}[\\/])?(?:[^\s"'<>|:*?()\[\]{},;]+[\\/])*[^\s"'<>|:*?()\[\]{},;]+\.(?:md|markdown|html|htm)(?::\d+(?::\d+)?)?/gi;

const IMAGE_PATH_RE =
  /(?:[A-Za-z]:[\\/])?(?:\.{1,2}[\\/])?(?:[^\s"'<>|:*?()\[\]{},;]+[\\/])*[^\s"'<>|:*?()\[\]{},;]+\.(?:png|jpe?g|gif|webp|bmp|svg|ico)/gi;

const ABSOLUTE_PATH_RE =
  /(?:[A-Za-z]:[\\/]|\\\\[^<>"|?*\r\n\\\/]+[\\/][^<>"|?*\r\n\\\/]+[\\/])[^<>"|?*\r\n]*/gi;

const PATH_PART = String.raw`[^\s"'<>|:*?()\[\]{},;\\\/]+`;
const GENERAL_FILE_PATH_RE = new RegExp(
  String.raw`(?:\.{1,2}[\\/])?(?:${PATH_PART}[\\/])+${PATH_PART}\.[A-Za-z0-9]{1,16}(?::\d+(?::\d+)?)?`,
  "gi"
);
const FOLDER_PATH_RE = new RegExp(
  String.raw`(?:[A-Za-z]:[\\/]|\\\\${PATH_PART}[\\/]${PATH_PART}[\\/]|\.{1,2}[\\/])?(?:${PATH_PART}[\\/])+(?:${PATH_PART})?`,
  "gi"
);

export type MarkdownPathHandler = (agentId: string, path: string) => void;
export type ImagePathHandler = (agentId: string, path: string) => void;
export type FolderPathHandler = (agentId: string, path: string) => void;
export type TerminalPathHandler = (agentId: string, path: string) => void;

type MarkdownPathMatch = {
  text: string;
  startIndex: number;
  endIndex: number;
  startColumn: number;
  endColumn: number;
};

export function clampTerminalFontSize(fontSize: number) {
  if (!Number.isFinite(fontSize)) return DEFAULT_TERMINAL_FONT_SIZE;
  return Math.min(
    MAX_TERMINAL_FONT_SIZE,
    Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(fontSize))
  );
}

export function loadTerminalFontSize() {
  try {
    const raw = localStorage.getItem(LS_TERMINAL_FONT_SIZE);
    if (!raw) return DEFAULT_TERMINAL_FONT_SIZE;
    return clampTerminalFontSize(Number(raw));
  } catch {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
}

export function saveTerminalFontSize(fontSize: number) {
  try {
    localStorage.setItem(
      LS_TERMINAL_FONT_SIZE,
      String(clampTerminalFontSize(fontSize))
    );
  } catch {}
}

export async function notifyDone({
  projectName,
  sessionName,
}: {
  projectName: string;
  sessionName: string;
}) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return;
    const notification = new window.Notification(
      `${projectName} / ${sessionName}`,
      {
        body: "작업이 끝났어요",
        tag: `multiagent:${projectName}:${sessionName}`,
      }
    );
    notification.onclick = () => {
      notification.close();
      invoke("show_main_window").catch(() => {});
    };
  } catch {}
}

function cleanMarkdownPathCandidate(candidate: string) {
  return candidate
    .trim()
    .replace(/^[`"'(<\[]+/, "")
    .replace(/[>`"')\].,;]+$/, "")
    .replace(/(\.(?:md|markdown|html|htm)):\d+(?::\d+)?$/i, "$1")
    .replace(/[>`"')\].,;]+$/, "");
}

function cleanImagePathCandidate(candidate: string) {
  return candidate
    .trim()
    .replace(/^[`"'(<\[]+/, "")
    .replace(/[>`"')\].,;]+$/, "");
}

function cleanFolderPathCandidate(candidate: string) {
  return candidate
    .trim()
    .replace(/^[`"'(<\[]+/, "")
    .replace(/[>`"')\].,;]+$/, "");
}

function cleanTerminalPathCandidate(candidate: string) {
  return candidate
    .trim()
    .replace(/^[`"'<]+/, "")
    .replace(/[>`"',;]+$/, "")
    .replace(/:\d+(?::\d+)?$/, "")
    .trimEnd();
}

function rangeOverlaps(a: MarkdownPathMatch, b: MarkdownPathMatch) {
  return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
}

function startsInsideUrl(text: string, start: number) {
  return text.slice(Math.max(0, start - 3), start) === "://";
}

function findImagePathMatches(text: string): MarkdownPathMatch[] {
  const matches: MarkdownPathMatch[] = [];
  IMAGE_PATH_RE.lastIndex = 0;
  for (const match of text.matchAll(IMAGE_PATH_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const cleaned = cleanImagePathCandidate(raw);
    if (!cleaned) continue;
    const startColumn = cellWidth(text.slice(0, start));
    matches.push({
      text: cleaned,
      startIndex: start,
      endIndex: start + raw.length,
      startColumn,
      endColumn: startColumn + cellWidth(raw),
    });
  }
  return matches;
}

function findAbsolutePathMatches(text: string): MarkdownPathMatch[] {
  const matches: MarkdownPathMatch[] = [];
  ABSOLUTE_PATH_RE.lastIndex = 0;
  for (const match of text.matchAll(ABSOLUTE_PATH_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (startsInsideUrl(text, start)) continue;
    const cleaned = cleanTerminalPathCandidate(raw);
    if (!cleaned) continue;
    const startColumn = cellWidth(text.slice(0, start));
    matches.push({
      text: cleaned,
      startIndex: start,
      endIndex: start + raw.length,
      startColumn,
      endColumn: startColumn + cellWidth(raw),
    });
  }
  return matches;
}

function charCellWidth(char: string) {
  const code = char.codePointAt(0);
  if (code === undefined) return 0;
  if (
    code === 0 ||
    code < 32 ||
    (code >= 0x7f && code < 0xa0) ||
    (code >= 0x300 && code <= 0x36f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  ) {
    return 0;
  }
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff))
  ) {
    return 2;
  }
  return 1;
}

function cellWidth(text: string) {
  let width = 0;
  for (const char of text) {
    width += charCellWidth(char);
  }
  return width;
}

function findMarkdownPathMatches(text: string): MarkdownPathMatch[] {
  const matches: MarkdownPathMatch[] = [];
  MARKDOWN_PATH_RE.lastIndex = 0;

  for (const match of text.matchAll(MARKDOWN_PATH_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const cleaned = cleanMarkdownPathCandidate(raw);
    if (!cleaned) continue;

    const startColumn = cellWidth(text.slice(0, start));
    matches.push({
      text: cleaned,
      startIndex: start,
      endIndex: start + raw.length,
      startColumn,
      endColumn: startColumn + cellWidth(raw),
    });
  }

  return matches;
}

function findFolderPathMatches(
  text: string,
  occupied: MarkdownPathMatch[]
): MarkdownPathMatch[] {
  const matches: MarkdownPathMatch[] = [];
  FOLDER_PATH_RE.lastIndex = 0;

  for (const match of text.matchAll(FOLDER_PATH_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (startsInsideUrl(text, start)) continue;
    const cleaned = cleanFolderPathCandidate(raw);
    if (!cleaned) continue;
    const candidate: MarkdownPathMatch = {
      text: cleaned,
      startIndex: start,
      endIndex: start + raw.length,
      startColumn: cellWidth(text.slice(0, start)),
      endColumn: cellWidth(text.slice(0, start)) + cellWidth(raw),
    };
    if (occupied.some((existing) => rangeOverlaps(existing, candidate))) {
      continue;
    }
    matches.push(candidate);
  }

  return matches;
}

function findGeneralFilePathMatches(
  text: string,
  occupied: MarkdownPathMatch[]
): MarkdownPathMatch[] {
  const matches: MarkdownPathMatch[] = [];
  GENERAL_FILE_PATH_RE.lastIndex = 0;

  for (const match of text.matchAll(GENERAL_FILE_PATH_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (startsInsideUrl(text, start)) continue;
    const cleaned = cleanTerminalPathCandidate(raw);
    if (!cleaned) continue;
    const candidate: MarkdownPathMatch = {
      text: cleaned,
      startIndex: start,
      endIndex: start + raw.length,
      startColumn: cellWidth(text.slice(0, start)),
      endColumn: cellWidth(text.slice(0, start)) + cellWidth(raw),
    };
    if (occupied.some((existing) => rangeOverlaps(existing, candidate))) {
      continue;
    }
    matches.push(candidate);
  }

  return matches;
}

export function findMarkdownPathAt(
  text: string,
  column: number,
  toleranceColumns = 0
) {
  if (!Number.isFinite(column) || column < 0) return null;

  for (const match of findMarkdownPathMatches(text)) {
    if (
      column < match.startColumn - toleranceColumns ||
      column >= match.endColumn + toleranceColumns
    ) {
      continue;
    }

    return match.text;
  }

  return null;
}

function registerMarkdownLinkProvider(
  term: Terminal,
  id: string,
  onMarkdownPath: MarkdownPathHandler,
  onImagePath?: ImagePathHandler,
  onFolderPath?: FolderPathHandler,
  onTerminalPath?: TerminalPathHandler
) {
  term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      const line = term.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      const links: ILink[] = [];
      const occupied: MarkdownPathMatch[] = [];

      if (onTerminalPath) {
        for (const match of findAbsolutePathMatches(text)) {
          occupied.push(match);
          links.push({
            range: {
              start: { x: match.startColumn + 1, y: bufferLineNumber },
              end: { x: match.endColumn, y: bufferLineNumber },
            },
            text: match.text,
            decorations: {
              pointerCursor: true,
              underline: true,
            },
            activate(event, path) {
              event.preventDefault();
              onTerminalPath(id, path);
            },
          });
        }
      }

      for (const match of findMarkdownPathMatches(text)) {
        if (occupied.some((existing) => rangeOverlaps(existing, match))) {
          continue;
        }
        occupied.push(match);
        links.push({
          range: {
            start: { x: match.startColumn + 1, y: bufferLineNumber },
            end: { x: match.endColumn, y: bufferLineNumber },
          },
          text: match.text,
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate(event, path) {
            event.preventDefault();
            onMarkdownPath(id, path);
          },
        });
      }

      if (onImagePath) {
        for (const match of findImagePathMatches(text)) {
          if (occupied.some((existing) => rangeOverlaps(existing, match))) {
            continue;
          }
          occupied.push(match);
          links.push({
            range: {
              start: { x: match.startColumn + 1, y: bufferLineNumber },
              end: { x: match.endColumn, y: bufferLineNumber },
            },
            text: match.text,
            decorations: {
              pointerCursor: true,
              underline: true,
            },
            activate(event, path) {
              event.preventDefault();
              onImagePath(id, path);
            },
          });
        }
      }

      if (onTerminalPath) {
        for (const match of findGeneralFilePathMatches(text, occupied)) {
          occupied.push(match);
          links.push({
            range: {
              start: { x: match.startColumn + 1, y: bufferLineNumber },
              end: { x: match.endColumn, y: bufferLineNumber },
            },
            text: match.text,
            decorations: {
              pointerCursor: true,
              underline: true,
            },
            activate(event, path) {
              event.preventDefault();
              onTerminalPath(id, path);
            },
          });
        }
      }

      if (onFolderPath) {
        for (const match of findFolderPathMatches(text, occupied)) {
          links.push({
            range: {
              start: { x: match.startColumn + 1, y: bufferLineNumber },
              end: { x: match.endColumn, y: bufferLineNumber },
            },
            text: match.text,
            decorations: {
              pointerCursor: true,
              underline: true,
            },
            activate(event, path) {
              event.preventDefault();
              onFolderPath(id, path);
            },
          });
        }
      }

      callback(links.length > 0 ? links : undefined);
    },
  });
}

export function createEntry(
  id: string,
  onMarkdownPath?: MarkdownPathHandler,
  onImagePath?: ImagePathHandler,
  onFolderPath?: FolderPathHandler,
  onTerminalPath?: TerminalPathHandler
): TerminalEntry {
  const isWindows = navigator.userAgent.includes("Windows");
  const term = new Terminal({
    fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
    fontSize: loadTerminalFontSize(),
    cursorBlink: true,
    theme: TERMINAL_THEMES[loadAppTheme()] ?? TERMINAL_THEME,
    allowProposedApi: true,
    scrollback: 5000,
    convertEol: false,
    windowsPty: isWindows
      ? { backend: "conpty", buildNumber: 22000 }
      : undefined,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const search = new SearchAddon();
  term.loadAddon(search);
  const serialize = new SerializeAddon();
  term.loadAddon(serialize);
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      openUrl(uri).catch((err) => {
        console.error("open url failed", err);
      });
    })
  );
  if (onMarkdownPath) {
    registerMarkdownLinkProvider(
      term,
      id,
      onMarkdownPath,
      onImagePath,
      onFolderPath,
      onTerminalPath
    );
  }

  const el = document.createElement("div");
  el.className = "term-host";

  term.onData((d) => {
    invoke("write_pty", { id, data: d }).catch(() => {});
  });

  term.attachCustomKeyEventHandler((event) => {
    const isPlainCtrlKey =
      event.type === "keydown" &&
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey;

    if (isPlainCtrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      const selectedText = term.hasSelection() ? term.getSelection() : "";
      if (selectedText) {
        navigator.clipboard
          .writeText(selectedText)
          .then(() => term.clearSelection())
          .catch(() => {});
      }
      return false;
    }

    if (isPlainCtrlKey && event.key === "Enter") {
      if (event.isComposing || event.keyCode === 229) {
        // Let IME finish committing the in-progress character first.
        // The newline will be sent on the next Ctrl+Enter press.
        return true;
      }
      event.preventDefault();
      invoke("write_pty", { id, data: "\x1b\r" }).catch(() => {});
      return false;
    }

    if (isPlainCtrlKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text && text.length > 0) {
            term.paste(text);
          } else {
            invoke("write_pty", { id, data: "\x16" }).catch(() => {});
          }
        })
        .catch(() => {
          invoke("write_pty", { id, data: "\x16" }).catch(() => {});
        });
      return false;
    }
    return true;
  });

  return { term, fit, search, serialize, el, opened: false, spawned: false };
}

export function computeDropZone(
  rect: DOMRect,
  clientX: number,
  clientY: number
): DropZone {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  const edge = 0.25;
  const distLeft = x;
  const distRight = 1 - x;
  const distTop = y;
  const distBottom = 1 - y;
  const minEdge = Math.min(distLeft, distRight, distTop, distBottom);
  if (minEdge >= edge) return "center";
  if (minEdge === distLeft) return "left";
  if (minEdge === distRight) return "right";
  if (minEdge === distTop) return "top";
  return "bottom";
}
