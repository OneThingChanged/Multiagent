import { invoke, listen } from "../platform/runtime";
import { isElectronRuntime } from "../platform/electronBridge";
import {
  isPermissionGranted,
  requestPermission,
} from "../platform/plugins";
import { Terminal } from "@xterm/xterm";
import type { ILink, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
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

// WebLinksAddon 0.12 ships a URL regex whose character classes exclude only a
// handful of ASCII punctuation, so CJK text written flush against a URL (e.g.
// `http://127.0.0.1:4421이야`) gets swallowed into the link. Reuse the addon's
// pattern but also treat Hangul/CJK/Kana/fullwidth blocks as URL terminators so
// the link stops at the last real URL character.
const CJK_URL_STOP =
  "\\u1100-\\u11FF\\u2E80-\\uA4CF\\uAC00-\\uD7A3\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFFEF\\u3000-\\u303F\\u3040-\\u30FF";
const URL_LINK_RE = new RegExp(
  `(https?|HTTPS?):[/]{2}[^\\s"'!*(){}|\\\\^<>\`${CJK_URL_STOP}]*[^\\s"':,.!?{}|\\\\^~\\[\\]\`()<>${CJK_URL_STOP}]`
);

export type MarkdownPathHandler = (agentId: string, path: string) => void;
export type ImagePathHandler = (agentId: string, path: string) => void;
export type FolderPathHandler = (agentId: string, path: string) => void;
export type TerminalPathHandler = (agentId: string, path: string) => void;
type UrlHandler = (url: string) => void;

type MarkdownPathMatch = {
  text: string;
  startIndex: number;
  endIndex: number;
  startColumn: number;
  endColumn: number;
};

export type TerminalMouseLink =
  | { kind: "url"; text: string }
  | { kind: "terminal"; text: string }
  | { kind: "markdown"; text: string }
  | { kind: "image"; text: string }
  | { kind: "folder"; text: string };

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
  onActivate,
}: {
  projectName: string;
  sessionName: string;
  onActivate?: () => void;
}) {
  try {
    const notificationKey = `multiagent:${projectName}:${sessionName}`;
    if (isElectronRuntime()) {
      let removeClickListener: (() => void) | null = null;
      if (onActivate) {
        removeClickListener = await listen<{ notificationKey?: string }>(
          "native-notification:clicked",
          (event) => {
            if (event.payload?.notificationKey !== notificationKey) return;
            removeClickListener?.();
            removeClickListener = null;
            onActivate();
          }
        );
        window.setTimeout(() => {
          removeClickListener?.();
          removeClickListener = null;
        }, 60 * 60 * 1000);
      }
      await invoke("show_native_notification", {
        title: `${projectName} / ${sessionName}`,
        body: "작업이 끝났어요",
        notificationKey,
      });
      return;
    }
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return;
    const notification = new window.Notification(
      `${projectName} / ${sessionName}`,
      {
        body: "작업이 끝났어요",
        tag: notificationKey,
      }
    );
    notification.onclick = () => {
      notification.close();
      // Bring the app forward AND jump to the session that fired the
      // notification (onActivate navigates to its group).
      invoke("show_main_window").catch(() => {});
      onActivate?.();
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

function isImeCompositionKey(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229 || event.key === "Process";
}

type CreateEntryOptions = {
  normalizeSshCursorKeys?: boolean;
};

function normalizedCursorKeyData(event: KeyboardEvent) {
  if (
    event.type !== "keydown" ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return null;
  }

  switch (event.key) {
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    default:
      return null;
  }
}

const terminalsWithImePreview = new WeakSet<Terminal>();

export function installImeCompositionPreview(entry: TerminalEntry) {
  const { term, el } = entry;
  if (terminalsWithImePreview.has(term)) return;

  const textarea = term.textarea;
  if (!textarea) return;

  terminalsWithImePreview.add(term);

  const preview = document.createElement("div");
  preview.className = "term-ime-preview";
  preview.setAttribute("aria-hidden", "true");
  el.appendChild(preview);

  let isComposing = false;
  let composingText = "";

  const hidePreview = () => {
    composingText = "";
    preview.textContent = "";
    preview.classList.remove("term-ime-preview-active");
  };

  const positionPreview = () => {
    if (!isComposing || !composingText) return;

    const screen = el.querySelector<HTMLElement>(".xterm-screen");
    if (!screen || term.cols < 1 || term.rows < 1) return;

    const hostRect = el.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();
    const screenWidth = screenRect.width || screen.clientWidth;
    const screenHeight = screenRect.height || screen.clientHeight;
    if (screenWidth <= 0 || screenHeight <= 0) return;

    const cellWidth = screenWidth / term.cols;
    const cellHeight = screenHeight / term.rows;
    const cursorX = Math.min(term.buffer.active.cursorX, term.cols - 1);
    const cursorY = Math.min(term.buffer.active.cursorY, term.rows - 1);
    const left = screenRect.left - hostRect.left + cursorX * cellWidth;
    const top = screenRect.top - hostRect.top + cursorY * cellHeight;

    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    preview.style.height = `${cellHeight}px`;
    preview.style.lineHeight = `${cellHeight}px`;
    preview.style.maxWidth = `${Math.max(16, hostRect.width - left - 4)}px`;
    preview.style.fontFamily =
      term.options.fontFamily ??
      '"Cascadia Mono", Consolas, "Courier New", monospace';
    preview.style.fontSize = `${term.options.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE}px`;
  };

  const showPreview = (text: string) => {
    composingText = text;
    if (!text) {
      hidePreview();
      return;
    }
    preview.textContent = text;
    preview.classList.add("term-ime-preview-active");
    positionPreview();
  };

  const onCompositionStart = (event: CompositionEvent) => {
    isComposing = true;
    showPreview(event.data ?? "");
  };
  const onCompositionUpdate = (event: CompositionEvent) => {
    isComposing = true;
    showPreview(event.data ?? "");
  };
  const onCompositionEnd = () => {
    isComposing = false;
    hidePreview();
  };
  const onBlur = () => {
    isComposing = false;
    hidePreview();
  };

  textarea.addEventListener("compositionstart", onCompositionStart);
  textarea.addEventListener("compositionupdate", onCompositionUpdate);
  textarea.addEventListener("compositionend", onCompositionEnd);
  textarea.addEventListener("blur", onBlur);

  term.onRender(positionPreview);
  term.onResize(positionPreview);
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

function findUrlMatches(text: string): MarkdownPathMatch[] {
  const matches: MarkdownPathMatch[] = [];
  const regex = new RegExp(URL_LINK_RE.source, "g");

  for (const match of text.matchAll(regex)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const startColumn = cellWidth(text.slice(0, start));
    matches.push({
      text: raw,
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

type CellRef = { row: number; col: number; width: number };

function cellLinearIndex(termCols: number, row: number, col: number) {
  return row * termCols + col;
}

function findMatchAtCell(
  logical: { text: string; cellMap: CellRef[] },
  termCols: number,
  row: number,
  col: number,
  matches: MarkdownPathMatch[]
) {
  const cursor = cellLinearIndex(termCols, row, col);
  for (const match of matches) {
    const startCell = logical.cellMap[match.startIndex];
    const lastCell = logical.cellMap[match.endIndex - 1];
    if (!startCell || !lastCell) continue;
    const start = cellLinearIndex(termCols, startCell.row, startCell.col);
    const end = cellLinearIndex(
      termCols,
      lastCell.row,
      lastCell.col + Math.max(1, lastCell.width) - 1
    );
    if (cursor >= start && cursor <= end) return match.text;
  }
  return null;
}

function findTerminalLinkInLogicalLineAtCell(
  logical: { text: string; cellMap: CellRef[] },
  termCols: number,
  row: number,
  col: number
): TerminalMouseLink | null {
  const occupied: MarkdownPathMatch[] = [];

  const url = findMatchAtCell(
    logical,
    termCols,
    row,
    col,
    findUrlMatches(logical.text)
  );
  if (url) return { kind: "url", text: url };
  occupied.push(...findUrlMatches(logical.text));

  const absoluteMatches = findAbsolutePathMatches(logical.text);
  const absolute = findMatchAtCell(logical, termCols, row, col, absoluteMatches);
  if (absolute) return { kind: "terminal", text: absolute };
  occupied.push(...absoluteMatches);

  const markdownMatches = findMarkdownPathMatches(logical.text).filter(
    (match) => !occupied.some((existing) => rangeOverlaps(existing, match))
  );
  const markdown = findMatchAtCell(
    logical,
    termCols,
    row,
    col,
    markdownMatches
  );
  if (markdown) return { kind: "markdown", text: markdown };
  occupied.push(...markdownMatches);

  const imageMatches = findImagePathMatches(logical.text).filter(
    (match) => !occupied.some((existing) => rangeOverlaps(existing, match))
  );
  const image = findMatchAtCell(logical, termCols, row, col, imageMatches);
  if (image) return { kind: "image", text: image };
  occupied.push(...imageMatches);

  const fileMatches = findGeneralFilePathMatches(logical.text, occupied);
  const file = findMatchAtCell(logical, termCols, row, col, fileMatches);
  if (file) return { kind: "terminal", text: file };
  occupied.push(...fileMatches);

  const folder = findMatchAtCell(
    logical,
    termCols,
    row,
    col,
    findFolderPathMatches(logical.text, occupied)
  );
  if (folder) return { kind: "folder", text: folder };

  return null;
}

// Reconstruct the full logical line that `rowIndex` belongs to, joining any
// soft-wrapped continuation rows (xterm flags these with `isWrapped`). Returns
// the joined text plus a per-character map back to absolute buffer row/column,
// so a link range can span wrapped rows. Without this, a path that wraps at the
// pane edge is split across two rows and matches on neither row alone — which is
// why long paths from full-screen TUIs (e.g. Codex) weren't clickable, while the
// built-in URL detector, which already joins wrapped rows, was.
const MAX_WRAP_ROWS = 512;

function buildLogicalLine(
  term: Terminal,
  rowIndex: number
): { text: string; cellMap: CellRef[] } | null {
  const buffer = term.buffer.active;
  if (!buffer.getLine(rowIndex)) return null;

  // Walk up to the first row of this logical line.
  let start = rowIndex;
  let guard = 0;
  while (start > 0 && guard < MAX_WRAP_ROWS) {
    const line = buffer.getLine(start);
    if (line?.isWrapped) {
      start -= 1;
      guard += 1;
    } else {
      break;
    }
  }

  // Walk down, concatenating rows while they remain continuations.
  const cols = term.cols;
  let text = "";
  const cellMap: CellRef[] = [];
  guard = 0;
  for (
    let r = start;
    r < buffer.length && guard < MAX_WRAP_ROWS;
    r += 1, guard += 1
  ) {
    const line = buffer.getLine(r);
    if (!line) break;
    if (r !== start && !line.isWrapped) break;
    for (let c = 0; c < cols; c += 1) {
      const cell = line.getCell(c);
      if (!cell) continue;
      const width = cell.getWidth();
      if (width === 0) continue; // trailing placeholder cell of a wide glyph
      const chars = cell.getChars() || " ";
      const base = text.length;
      for (let i = 0; i < chars.length; i += 1) {
        cellMap[base + i] = { row: r, col: c, width };
      }
      text += chars;
    }
  }

  // Trim trailing whitespace (matches translateToString(true)); cellMap keeps
  // its extra entries but we only index within the trimmed length.
  return { text: text.replace(/\s+$/, ""), cellMap };
}

// Read the OSC 8 hyperlink at a buffer cell. Codex/others emit links whose
// visible text is a label (not the URL), so the regex scan misses them; xterm
// parses OSC 8 natively and stores the real URL on the cell's extended attrs.
function oscUrlAtCell(term: Terminal, row: number, col: number): string | null {
  try {
    const line = term.buffer.active.getLine(row);
    // getCell returns a CellData instance at runtime; extended.urlId is private.
    const cell = line?.getCell(col) as unknown as {
      hasExtendedAttrs?: () => boolean;
      extended?: { urlId?: number };
    } | undefined;
    if (cell?.hasExtendedAttrs?.() && cell.extended?.urlId) {
      const service = (term as TerminalWithPrivateCore)._core?._oscLinkService;
      const uri = service?.getLinkData?.(cell.extended.urlId)?.uri;
      if (typeof uri === "string" && uri.trim()) return uri.trim();
    }
  } catch {
    // Private xterm shape drifted — fall back to the visible-text regex scan.
  }
  return null;
}

export function findTerminalLinkAtMouseEvent(
  term: Terminal,
  event: MouseEvent
): TerminalMouseLink | null {
  const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
  if (!screen || term.cols < 1 || term.rows < 1) return null;

  const rect = screen.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const style = window.getComputedStyle(screen);
  const paddingLeft = Number.parseInt(style.paddingLeft, 10) || 0;
  const paddingTop = Number.parseInt(style.paddingTop, 10) || 0;
  const contentWidth =
    rect.width -
    paddingLeft -
    (Number.parseInt(style.paddingRight, 10) || 0);
  const contentHeight =
    rect.height -
    paddingTop -
    (Number.parseInt(style.paddingBottom, 10) || 0);
  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const x = event.clientX - rect.left - paddingLeft;
  const y = event.clientY - rect.top - paddingTop;
  if (x < 0 || y < 0 || x > contentWidth || y > contentHeight) return null;

  const col = Math.min(
    term.cols - 1,
    Math.max(0, Math.ceil(x / (contentWidth / term.cols)) - 1)
  );
  const viewportRow = Math.min(
    term.rows - 1,
    Math.max(0, Math.ceil(y / (contentHeight / term.rows)) - 1)
  );
  const row = term.buffer.active.viewportY + viewportRow;

  // OSC 8 first — the authoritative URL even when the visible text is a label.
  const osc = oscUrlAtCell(term, row, col);
  if (osc) return { kind: "url", text: osc };

  const logical = buildLogicalLine(term, row);
  if (!logical) return null;

  return findTerminalLinkInLogicalLineAtCell(logical, term.cols, row, col);
}

export function findTerminalUrlAtMouseEvent(term: Terminal, event: MouseEvent) {
  const link = findTerminalLinkAtMouseEvent(term, event);
  return link?.kind === "url" ? link.text : null;
}

function registerUrlLinkProvider(term: Terminal, onUrl: UrlHandler) {
  term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      const logical = buildLogicalLine(term, bufferLineNumber - 1);
      if (!logical) {
        callback(undefined);
        return;
      }

      const { text, cellMap } = logical;
      const links: ILink[] = [];

      for (const match of findUrlMatches(text)) {
        const startCell = cellMap[match.startIndex];
        const lastCell = cellMap[match.endIndex - 1];
        if (!startCell || !lastCell) continue;
        links.push({
          range: {
            start: { x: startCell.col + 1, y: startCell.row + 1 },
            end: { x: lastCell.col + lastCell.width, y: lastCell.row + 1 },
          },
          text: match.text,
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate(event, url) {
            event.preventDefault();
            onUrl(url);
          },
        });
      }

      callback(links.length > 0 ? links : undefined);
    },
  });
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
      const logical = buildLogicalLine(term, bufferLineNumber - 1);
      if (!logical) {
        callback(undefined);
        return;
      }

      const { text, cellMap } = logical;
      const links: ILink[] = [];
      const occupied: MarkdownPathMatch[] = findUrlMatches(text);

      const pushLink = (
        match: MarkdownPathMatch,
        onActivate: (path: string) => void
      ) => {
        const startCell = cellMap[match.startIndex];
        const lastCell = cellMap[match.endIndex - 1];
        if (!startCell || !lastCell) return;
        links.push({
          range: {
            start: { x: startCell.col + 1, y: startCell.row + 1 },
            end: { x: lastCell.col + lastCell.width, y: lastCell.row + 1 },
          },
          text: match.text,
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate(event, path) {
            event.preventDefault();
            onActivate(path);
          },
        });
      };

      if (onTerminalPath) {
        for (const match of findAbsolutePathMatches(text)) {
          occupied.push(match);
          pushLink(match, (path) => onTerminalPath(id, path));
        }
      }

      for (const match of findMarkdownPathMatches(text)) {
        if (occupied.some((existing) => rangeOverlaps(existing, match))) {
          continue;
        }
        occupied.push(match);
        pushLink(match, (path) => onMarkdownPath(id, path));
      }

      if (onImagePath) {
        for (const match of findImagePathMatches(text)) {
          if (occupied.some((existing) => rangeOverlaps(existing, match))) {
            continue;
          }
          occupied.push(match);
          pushLink(match, (path) => onImagePath(id, path));
        }
      }

      if (onTerminalPath) {
        for (const match of findGeneralFilePathMatches(text, occupied)) {
          occupied.push(match);
          pushLink(match, (path) => onTerminalPath(id, path));
        }
      }

      if (onFolderPath) {
        for (const match of findFolderPathMatches(text, occupied)) {
          pushLink(match, (path) => onFolderPath(id, path));
        }
      }

      callback(links.length > 0 ? links : undefined);
    },
  });
}

export function openTerminalUrl(url: string) {
  const target = url.trim();
  if (!target) return;
  invoke("open_external_url", { url: target }).catch((err) => {
    console.error("open url failed", err);
  });
}

export function createEntry(
  id: string,
  onMarkdownPath?: MarkdownPathHandler,
  onImagePath?: ImagePathHandler,
  onFolderPath?: FolderPathHandler,
  onTerminalPath?: TerminalPathHandler,
  options: CreateEntryOptions = {}
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
    // Open xterm's natively-parsed OSC 8 hyperlinks in the browser (the
    // capture-phase handler in PaneSlot covers the mouse-tracking case).
    linkHandler: {
      activate: (_event, uri) => openTerminalUrl(uri),
      allowNonHttpProtocols: false,
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const search = new SearchAddon();
  term.loadAddon(search);
  const serialize = new SerializeAddon();
  term.loadAddon(serialize);
  // Align xterm's character-width table with modern wcwidth (Unicode 11+).
  // Without this, xterm defaults to the Unicode 6 tables where emoji and some
  // symbols count as 1 cell, while CLI TUIs (e.g. Cline, which renders with
  // Node's wcwidth) treat them as 2 — the mismatch drifts the cursor and makes
  // output look shifted. Activating v11 keeps both sides in agreement.
  const unicode11 = new Unicode11Addon();
  term.loadAddon(unicode11);
  term.unicode.activeVersion = "11";
  registerUrlLinkProvider(term, openTerminalUrl);
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
    if (event.type === "keydown" && isImeCompositionKey(event)) {
      // During Korean/Japanese/Chinese IME composition, WebView2 can emit
      // transient keydown data before the IME commits the final text. Let the
      // browser IME complete and only forward the committed text via onData.
      return false;
    }

    if (options.normalizeSshCursorKeys) {
      const cursorData = normalizedCursorKeyData(event);
      if (cursorData) {
        event.preventDefault();
        invoke("write_pty", { id, data: cursorData }).catch(() => {});
        return false;
      }
    }

    const isPlainCtrlKey =
      event.type === "keydown" &&
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey;

    const isCtrlShiftKey =
      event.type === "keydown" &&
      event.ctrlKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.metaKey;

    if (
      (isPlainCtrlKey || isCtrlShiftKey) &&
      event.key.toLowerCase() === "c"
    ) {
      event.preventDefault();
      const selectedText = term.hasSelection() ? term.getSelection() : "";
      if (selectedText) {
        const write = isElectronRuntime()
          ? invoke("clipboard_write_text", { text: selectedText })
          : navigator.clipboard.writeText(selectedText);
        write
          .then(() => term.clearSelection())
          .catch(() => {});
      } else if (isPlainCtrlKey) {
        // No selection means the conventional terminal interrupt, including
        // Claude Code. Copying a selection still takes precedence.
        invoke("write_pty", { id, data: "\x03" }).catch(() => {});
      }
      return false;
    }

    if (isPlainCtrlKey && event.key === "Enter") {
      if (isImeCompositionKey(event)) {
        // Let IME finish committing the in-progress character first.
        // The newline will be sent on the next Ctrl+Enter press.
        return false;
      }
      event.preventDefault();
      invoke("write_pty", { id, data: "\x1b\r" }).catch(() => {});
      return false;
    }

    if (
      (isPlainCtrlKey || isCtrlShiftKey) &&
      event.key.toLowerCase() === "v"
    ) {
      event.preventDefault();
      const read = isElectronRuntime()
        ? invoke<string>("clipboard_read_text")
        : navigator.clipboard.readText();
      read
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

  return {
    term,
    fit,
    search,
    serialize,
    el,
    opened: false,
    spawned: false,
    spawnPromise: null,
    attached: false,
    lastSequence: 0,
    syncing: false,
    pendingOutput: [],
    restoreScrollbackOnAttach: false,
    restoredScrollback: false,
  };
}

type TerminalPrivateCore = {
  _bufferService?: {
    buffer?: {
      ydisp: number;
    };
    scrollLines: (disp: number, suppressScrollEvent?: boolean) => void;
  };
  _oscLinkService?: {
    getLinkData?: (linkId: number) => { uri?: string } | undefined;
  };
  refresh?: (start: number, end: number) => void;
};

type TerminalWithPrivateCore = Terminal & {
  _core?: TerminalPrivateCore;
};

export function scrollTerminalLinesImmediately(term: Terminal, lines: number) {
  if (lines === 0) return;

  const core = (term as TerminalWithPrivateCore)._core;
  const bufferService = core?._bufferService;
  if (!bufferService || !core.refresh) {
    term.scrollLines(lines);
    return;
  }

  // Public scrollLines goes through xterm's async viewport; during heavy output
  // that can lose the "user is scrolling" state before the next write lands.
  const previousY = bufferService.buffer?.ydisp;
  bufferService.scrollLines(lines);
  if (previousY === bufferService.buffer?.ydisp) {
    return;
  }
  core.refresh(0, term.rows - 1);
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
