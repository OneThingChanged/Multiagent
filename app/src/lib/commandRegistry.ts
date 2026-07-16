export const LS_COMMAND_SHORTCUTS = "multiagent.commandShortcuts.v1";

export const COMMAND_DEFINITIONS = [
  {
    id: "quick-open",
    title: "Quick Open",
    description: "프로젝트·세션·Screen·문서·명령 통합 검색",
    keywords: "search palette navigate 찾기 열기",
    defaultShortcut: "Ctrl+K",
  },
  {
    id: "attention-center",
    title: "Attention Center",
    description: "완료·질문·권한대기·상태확인 항목 보기",
    keywords: "notification unread waiting blocked 완료 알림",
    defaultShortcut: "Ctrl+Shift+A",
  },
  {
    id: "terminal-search",
    title: "현재 터미널에서 찾기",
    description: "현재 xterm scrollback 검색",
    keywords: "terminal find text",
    defaultShortcut: "Ctrl+F",
  },
  {
    id: "new-session",
    title: "새 세션",
    description: "현재 프로젝트에 새 AI 세션 만들기",
    keywords: "agent add create",
    defaultShortcut: "Ctrl+T",
  },
  {
    id: "new-project",
    title: "새 프로젝트",
    description: "새 작업 폴더 등록",
    keywords: "folder add create",
    defaultShortcut: "Ctrl+Shift+T",
  },
  {
    id: "close-pane",
    title: "현재 패널 닫기",
    description: "세션 PTY는 유지하고 현재 Screen에서 분리",
    keywords: "detach hide tab pane",
    defaultShortcut: "Ctrl+W",
  },
  {
    id: "toggle-docs",
    title: "Docs 열기/닫기",
    description: "현재 프로젝트 문서 패널 전환",
    keywords: "markdown html documentation",
    defaultShortcut: "Ctrl+Shift+D",
  },
  {
    id: "toggle-pet",
    title: "Desktop Pet 켜기/끄기",
    description: "작업 상태 펫 표시 전환",
    keywords: "bot robot notification",
    defaultShortcut: "",
  },
  {
    id: "toggle-always-on-top",
    title: "창 상시 최상단 전환",
    description: "MultiAgent 창 고정 상태 전환",
    keywords: "pin window topmost",
    defaultShortcut: "",
  },
  {
    id: "open-new-window",
    title: "새 MultiAgent 창",
    description: "보조 Electron 창 열기",
    keywords: "window secondary",
    defaultShortcut: "Ctrl+Shift+N",
  },
  {
    id: "settings",
    title: "설정 열기",
    description: "MultiAgent 설정 열기",
    keywords: "preferences options",
    defaultShortcut: "Ctrl+Comma",
  },
] as const;

export type CommandId = (typeof COMMAND_DEFINITIONS)[number]["id"];
export type CommandShortcuts = Record<CommandId, string>;

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"];

export function defaultCommandShortcuts(): CommandShortcuts {
  return Object.fromEntries(
    COMMAND_DEFINITIONS.map((command) => [command.id, command.defaultShortcut])
  ) as CommandShortcuts;
}

function normalizedKey(rawKey: string) {
  const key = rawKey.trim();
  if (!key) return "";
  const lower = key.toLowerCase();
  if (lower === ",") return "Comma";
  if (lower === " ") return "Space";
  if (lower === "escape") return "Escape";
  if (lower === "arrowup") return "ArrowUp";
  if (lower === "arrowdown") return "ArrowDown";
  if (lower === "backspace") return "Backspace";
  if (lower === "delete") return "Delete";
  if (lower.length === 1) return lower.toUpperCase();
  return key[0].toUpperCase() + key.slice(1);
}

export function normalizeShortcut(shortcut: string) {
  const parts = shortcut.split("+").map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set<string>();
  let key = "";
  for (const part of parts) {
    const canonical = MODIFIER_ORDER.find(
      (modifier) => modifier.toLowerCase() === part.toLowerCase()
    );
    if (canonical) modifiers.add(canonical);
    else key = normalizedKey(part);
  }
  if (!key) return "";
  return [
    ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    key,
  ].join("+");
}

export function shortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "key">
) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return "";
  const key = normalizedKey(event.key);
  if (!key) return "";
  return [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Meta" : "",
    key,
  ].filter(Boolean).join("+");
}

export function commandForKeyboardEvent(
  event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "key">,
  shortcuts: CommandShortcuts
): CommandId | null {
  const pressed = shortcutFromKeyboardEvent(event);
  if (!pressed) return null;
  return COMMAND_DEFINITIONS.find(
    (command) => shortcuts[command.id] && shortcuts[command.id] === pressed
  )?.id ?? null;
}

export function loadCommandShortcuts(): CommandShortcuts {
  const defaults = defaultCommandShortcuts();
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_COMMAND_SHORTCUTS) || "{}") as
      Record<string, unknown>;
    for (const command of COMMAND_DEFINITIONS) {
      const stored = parsed[command.id];
      if (typeof stored === "string") {
        defaults[command.id] = normalizeShortcut(stored);
      }
    }
  } catch {}
  return defaults;
}

export function saveCommandShortcuts(shortcuts: CommandShortcuts) {
  try {
    localStorage.setItem(LS_COMMAND_SHORTCUTS, JSON.stringify(shortcuts));
  } catch {}
}

export function conflictingShortcutIds(shortcuts: CommandShortcuts) {
  const byShortcut = new Map<string, CommandId[]>();
  for (const command of COMMAND_DEFINITIONS) {
    const shortcut = shortcuts[command.id];
    if (!shortcut) continue;
    byShortcut.set(shortcut, [...(byShortcut.get(shortcut) ?? []), command.id]);
  }
  return new Set(
    [...byShortcut.values()].filter((ids) => ids.length > 1).flat()
  );
}
