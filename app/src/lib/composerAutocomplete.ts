// Composer autocomplete: detect a "/slash" (line start) or "@file" (after
// whitespace) trigger at the caret, and splice a chosen value back in. Adapted
// from Orca's mobile-native-chat-autocomplete. Pure — no framework deps.

export type AutocompleteTrigger = {
  kind: "slash" | "file";
  query: string;
  start: number; // index of the trigger char (/ or @)
  end: number; // caret
};

export function detectAutocomplete(text: string, caret: number): AutocompleteTrigger | null {
  const upto = text.slice(0, caret);
  const slash = upto.match(/(?:^|\n)\/([^\s/]*)$/);
  if (slash) {
    return { kind: "slash", query: slash[1], start: caret - slash[1].length - 1, end: caret };
  }
  const file = upto.match(/(?:^|\s)@([^\s@]*)$/);
  if (file) {
    return { kind: "file", query: file[1], start: caret - file[1].length - 1, end: caret };
  }
  return null;
}

export function applyAutocomplete(
  text: string,
  trigger: AutocompleteTrigger,
  value: string
): { text: string; caret: number } {
  const prefix = trigger.kind === "slash" ? "/" : "@";
  const insert = `${prefix}${value} `;
  const next = text.slice(0, trigger.start) + insert + text.slice(trigger.end);
  return { text: next, caret: trigger.start + insert.length };
}

export type SlashCommand = { name: string; desc: string };

const CLAUDE_SLASH: SlashCommand[] = [
  { name: "clear", desc: "대화 컨텍스트 지우기" },
  { name: "compact", desc: "대화 요약·압축" },
  { name: "model", desc: "모델 변경" },
  { name: "review", desc: "코드 리뷰" },
  { name: "init", desc: "CLAUDE.md 생성" },
  { name: "agents", desc: "서브에이전트 관리" },
  { name: "cost", desc: "토큰 사용/비용" },
  { name: "config", desc: "설정" },
  { name: "memory", desc: "메모리 편집" },
  { name: "status", desc: "상태 보기" },
  { name: "resume", desc: "세션 재개" },
  { name: "export", desc: "대화 내보내기" },
  { name: "help", desc: "도움말" },
];

const CODEX_SLASH: SlashCommand[] = [
  { name: "clear", desc: "대화 지우기" },
  { name: "compact", desc: "대화 요약·압축" },
  { name: "model", desc: "모델 변경" },
  { name: "approvals", desc: "승인 정책" },
  { name: "new", desc: "새 대화" },
  { name: "diff", desc: "변경 diff 보기" },
  { name: "status", desc: "상태 보기" },
  { name: "init", desc: "AGENTS.md 생성" },
  { name: "quit", desc: "종료" },
  { name: "help", desc: "도움말" },
];

export function slashCommandsForTool(tool?: string | null): SlashCommand[] {
  return tool === "codex" ? CODEX_SLASH : CLAUDE_SLASH;
}

export function filterSlashCommands(list: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase();
  const starts = list.filter((c) => c.name.toLowerCase().startsWith(q));
  const rest = q ? list.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q)) : [];
  return [...starts, ...rest].slice(0, 10);
}
