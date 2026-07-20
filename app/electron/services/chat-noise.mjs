// Detect harness-injected / system-wrapper user turns that shouldn't render as
// real chat messages. Ported/adapted from Orca's harness-injected-user-turns +
// native-chat-noise. Deliberately conservative: only KNOWN wrapper tags/prefixes
// are treated as noise, so a legitimate message that merely starts with "<" is
// kept (the previous heuristic dropped all of them).

// Known wrapper tags (kebab or snake): a user turn that is just <tag …>…</tag>.
const NOISE_TAGS = new Set([
  // Claude Code / harness
  "system-reminder",
  "task-notification",
  "command-name",
  "command-args",
  "command-message",
  "bash-input",
  "bash-stdout",
  "bash-stderr",
  "local-command-stdout",
  "local-command-stderr",
  "cross-session-message",
  "teammate-message",
  "user-prompt-submit-hook",
  "fork-boilerplate",
  "channel",
  "mcp-tool-use",
  "mcp-tool-result",
  // Codex wrappers injected as the first "user" turn
  "environment_context",
  "user_instructions",
  "user_query",
  "user_info",
  "git_status",
]);

const NOISE_PREFIXES = [
  "[request interrupted",
  "caveat: the messages below",
  "this session is being continued",
  "a message arrived from",
  "<system-reminder",
];

export function isNoiseUserText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  for (const prefix of NOISE_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  // Wrapped in a known tag, e.g. "<system-reminder>…" or "<environment_context>".
  const match = trimmed.match(/^<\/?([a-z][a-z0-9_-]*)/i);
  if (match && NOISE_TAGS.has(match[1].toLowerCase())) return true;
  return false;
}
