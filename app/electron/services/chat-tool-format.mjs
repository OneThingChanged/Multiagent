// Tool-call formatting for the chat view: a short human summary + a colored
// diff derived from edit-tool inputs or diff-like tool output. Ported/adapted
// from Orca's native-chat-tool-summary + native-chat-diff. Pure, plain-JSON
// (crosses IPC): diff is { type: "add"|"del"|"context"|"meta", text }[].

const MAX_ARG = 120;
const MAX_DIFF_LINES = 160;
const MAX_DIFF_CHARS = 32000;

function baseName(value) {
  const s = String(value ?? "");
  return s.split(/[\\/]/).pop() || s;
}

function clipArg(value) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > MAX_ARG ? `${s.slice(0, MAX_ARG)}…` : s;
}

// A short label for a tool call (command, file name, pattern, query, url…).
export function toolSummary(name, input) {
  if (typeof input === "string") return clipArg(input);
  const o = input && typeof input === "object" ? input : null;
  if (!o) return "";
  const cmd = o.command ?? o.cmd;
  if (cmd != null) return clipArg(Array.isArray(cmd) ? cmd.join(" ") : cmd);
  const fp = o.file_path ?? o.path ?? o.filePath ?? o.notebook_path;
  if (fp) return clipArg(baseName(fp));
  if (o.pattern != null) {
    const where = o.path ? ` (${baseName(o.path)})` : "";
    return clipArg(`${o.pattern}${where}`);
  }
  if (o.query != null) return clipArg(o.query);
  if (o.url != null) return clipArg(o.url);
  try {
    return clipArg(JSON.stringify(o));
  } catch {
    return "";
  }
}

function bound(lines) {
  if (!lines.length) return null;
  let out = lines;
  let truncated = false;
  if (out.length > MAX_DIFF_LINES) {
    out = out.slice(0, MAX_DIFF_LINES);
    truncated = true;
  }
  let chars = 0;
  for (let i = 0; i < out.length; i += 1) {
    chars += out[i].text.length + 1;
    if (chars > MAX_DIFF_CHARS) {
      out = out.slice(0, i);
      truncated = true;
      break;
    }
  }
  if (truncated) out = [...out, { type: "meta", text: "… (diff truncated)" }];
  return out;
}

function pushBlock(lines, type, value) {
  for (const line of String(value ?? "").split(/\r?\n/)) lines.push({ type, text: line });
}

// Parse a Codex-style apply_patch body ("*** Begin Patch" … +/- lines).
function diffFromApplyPatch(patch) {
  const lines = [];
  for (const row of String(patch).split(/\r?\n/)) {
    if (row.startsWith("***") || row.startsWith("@@")) lines.push({ type: "meta", text: row });
    else if (row.startsWith("+")) lines.push({ type: "add", text: row.slice(1) });
    else if (row.startsWith("-")) lines.push({ type: "del", text: row.slice(1) });
    else lines.push({ type: "context", text: row.startsWith(" ") ? row.slice(1) : row });
  }
  return bound(lines);
}

// Build a diff from an edit tool's input (Edit / MultiEdit / Write /
// str_replace / apply_patch / create_file). Returns null when not an edit.
export function diffFromToolCall(name, input) {
  const o = input && typeof input === "object" ? input : null;
  if (!o) {
    if (typeof input === "string" && input.includes("*** ") && input.includes("Patch")) {
      return diffFromApplyPatch(input);
    }
    return null;
  }
  const fp = o.file_path ?? o.path ?? o.filePath;

  // MultiEdit — an array of {old_string,new_string} edits.
  if (Array.isArray(o.edits) && o.edits.length) {
    const lines = [];
    if (fp) lines.push({ type: "meta", text: baseName(fp) });
    for (const edit of o.edits) {
      const oldS = edit.old_string ?? edit.oldString ?? edit.old;
      const newS = edit.new_string ?? edit.newString ?? edit.new;
      if (oldS != null && oldS !== "") pushBlock(lines, "del", oldS);
      if (newS != null && newS !== "") pushBlock(lines, "add", newS);
    }
    return bound(lines);
  }

  // Edit / str_replace — a single old→new replacement.
  const oldS = o.old_string ?? o.oldString ?? o.old;
  const newS = o.new_string ?? o.newString ?? o.new;
  if (oldS != null || newS != null) {
    const lines = [];
    if (fp) lines.push({ type: "meta", text: baseName(fp) });
    if (oldS != null && oldS !== "") pushBlock(lines, "del", oldS);
    if (newS != null && newS !== "") pushBlock(lines, "add", newS);
    return bound(lines);
  }

  // Write / create — whole-file content (all additions).
  const content = o.content ?? o.file_text ?? o.text;
  if (content != null && content !== "" && fp) {
    const lines = [{ type: "meta", text: baseName(fp) }];
    pushBlock(lines, "add", content);
    return bound(lines);
  }

  // apply_patch nested as a string field.
  const patch = typeof o.input === "string" ? o.input : o.patch ?? o.diff;
  if (typeof patch === "string" && patch.includes("*** ")) return diffFromApplyPatch(patch);

  return null;
}

// Parse tool OUTPUT that is itself a unified diff (git diff, apply_patch echo).
// Requires ≥2 changed lines to avoid treating prose "+"/"-" as a diff.
export function diffFromText(text) {
  const src = String(text ?? "");
  if (!src.trim()) return null;
  const rows = src.split(/\r?\n/);
  const lines = [];
  let changed = 0;
  for (const row of rows) {
    if (
      row.startsWith("@@") ||
      row.startsWith("diff ") ||
      row.startsWith("index ") ||
      row.startsWith("--- ") ||
      row.startsWith("+++ ") ||
      row.startsWith("*** ")
    ) {
      lines.push({ type: "meta", text: row });
    } else if (row.startsWith("+")) {
      lines.push({ type: "add", text: row.slice(1) });
      changed += 1;
    } else if (row.startsWith("-")) {
      lines.push({ type: "del", text: row.slice(1) });
      changed += 1;
    } else {
      lines.push({ type: "context", text: row.startsWith(" ") ? row.slice(1) : row });
    }
  }
  if (changed < 2) return null;
  return bound(lines);
}
