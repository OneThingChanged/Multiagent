import type { AgentStatus } from "../types";

// Heuristic detection of an inline prompt (a question with options, or a
// permission Allow/Deny) from the agent's waiting status text. Adapted from
// Orca's mobile-native-chat-question / -permission. We only have the prompt as
// a string (interactiveQuestion / lastAssistantMessage), so this parses option
// lines and yes/no language rather than a structured protocol payload.

export type ChatPromptOption = { label: string; send: string };
export type ChatPrompt = {
  kind: "question" | "permission";
  // "arrow": Claude's structured selector — pick option i by ↓×i then Enter.
  // "digit": a numeric/letter menu or y/n — send the key then Enter.
  answerStyle: "arrow" | "digit";
  text: string;
  options: ChatPromptOption[];
};

const PERMISSION_HINTS = [
  "allow",
  "permission",
  "approve",
  "grant",
  "proceed?",
  "do you want",
  "y/n",
  "yes/no",
  "(y/n)",
  "허용",
  "권한",
  "승인",
  "진행할까요",
  "계속할까요",
];

function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  return line
    .replace(/^[\s>❯•*\-]+/, "")
    .trim()
    .slice(0, 200);
}

// Numbered ("1. …" / "1) …") or lettered ("[a] …" / "a) …") option lines.
function parseOptionLines(text: string): ChatPromptOption[] {
  const options: ChatPromptOption[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s>❯•]+/, "").trim();
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    const lettered = line.match(/^\[?([a-zA-Z])\]?[.)]\s+(.+)$/);
    const m = numbered ?? lettered;
    if (!m) continue;
    const label = m[2].replace(/\s+/g, " ").slice(0, 80);
    if (label) options.push({ label, send: m[1] });
    if (options.length >= 12) break;
  }
  return options;
}

// Structured AskUserQuestion payload: {questions:[{question|header, options:[{label}|string]}]}.
function parseStructured(raw: string): ChatPrompt | null {
  try {
    const parsed = JSON.parse(raw) as {
      questions?: Array<{ question?: string; header?: string; options?: Array<{ label?: string } | string> }>;
    };
    const q = parsed?.questions?.[0];
    if (!q) return null;
    const choices = (q.options ?? [])
      .map((o) => (typeof o === "string" ? o : String(o.label ?? "")))
      .filter(Boolean);
    if (!choices.length) return null;
    return {
      kind: "question",
      answerStyle: "arrow",
      text: String(q.question || q.header || "질문").slice(0, 200),
      options: choices.map((label, i) => ({ label: label.slice(0, 80), send: String(i + 1) })),
    };
  } catch {
    return null;
  }
}

export function parseChatPrompt(
  status: AgentStatus,
  question?: string | null,
  assistantMessage?: string | null
): ChatPrompt | null {
  // Only while the agent is actually paused for input — otherwise a stale
  // interactive_question would keep the card up after it was answered.
  const waiting = status === "waiting" || status === "blocked";
  if (!waiting) return null;
  // Structured AskUserQuestion JSON (Claude) → option buttons by index.
  if (question && question.trim().startsWith("{")) {
    const structured = parseStructured(question);
    if (structured) return structured;
  }
  const src = (question?.trim() || assistantMessage?.trim() || "").trim();
  if (!src) return null;

  const lower = src.toLowerCase();
  const isPermission = PERMISSION_HINTS.some((hint) => lower.includes(hint));
  const numbered = parseOptionLines(src);

  if (numbered.length >= 2) {
    return {
      kind: isPermission ? "permission" : "question",
      answerStyle: "digit",
      text: firstLine(src),
      options: numbered,
    };
  }
  if (isPermission) {
    const options: ChatPromptOption[] = [
      { label: "예 (Yes)", send: "y" },
      { label: "아니오 (No)", send: "n" },
    ];
    if (lower.includes("always") || lower.includes("항상")) {
      options.push({ label: "항상 허용", send: "a" });
    }
    return { kind: "permission", answerStyle: "digit", text: firstLine(src), options };
  }
  return null;
}
