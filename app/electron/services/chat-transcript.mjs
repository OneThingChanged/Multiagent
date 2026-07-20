// Decode an agent's own JSONL session transcript (Codex / Claude) into a flat
// list of chat blocks the mobile/site chat view renders as a conversation —
// instead of scaling a raw terminal down to phone width. Each block carries a
// role and a kind; the renderer groups consecutive assistant/tool blocks into a
// turn and folds tool calls. Kept dependency-free and plain-JSON (crosses IPC).
//
// Block shape: { role, kind, text?, name?, input?, output?, isError? }
//   role: "user" | "assistant" | "tool"
//   kind: "text" | "reasoning" | "tool-call" | "tool-result" | "image"

const MAX_TOOL_OUTPUT = 4000;
const MAX_TEXT = 20000;

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Flatten Claude/Anthropic content (string | array of typed parts) to text.
function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

function decodeClaudeLine(obj, out) {
  const message = obj.message;
  if (obj.type === "user" && message) {
    const content = message.content;
    if (typeof content === "string") {
      const text = content.trim();
      // Skip system-injected wrappers (command output, caveats, reminders).
      if (text && !text.startsWith("<") && !text.startsWith("Caveat:")) {
        out.push({ role: "user", kind: "text", text: clip(text, MAX_TEXT) });
      }
      return;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text" && part.text?.trim()) {
          out.push({ role: "user", kind: "text", text: clip(part.text, MAX_TEXT) });
        } else if (part.type === "tool_result") {
          out.push({
            role: "tool",
            kind: "tool-result",
            output: clip(contentToText(part.content), MAX_TOOL_OUTPUT),
            isError: Boolean(part.is_error),
          });
        } else if (part.type === "image") {
          out.push({ role: "user", kind: "image" });
        }
      }
    }
    return;
  }
  if (obj.type === "assistant" && Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part.type === "text" && part.text?.trim()) {
        out.push({ role: "assistant", kind: "text", text: clip(part.text, MAX_TEXT) });
      } else if (part.type === "thinking" && part.thinking?.trim()) {
        out.push({ role: "assistant", kind: "reasoning", text: clip(part.thinking, MAX_TEXT) });
      } else if (part.type === "tool_use") {
        out.push({ role: "assistant", kind: "tool-call", name: part.name || "tool", input: part.input });
      }
    }
  }
}

function decodeCodexLine(obj, out) {
  if (obj.type !== "response_item" || !obj.payload) return;
  const p = obj.payload;
  if (p.type === "message") {
    const role = p.role === "assistant" ? "assistant" : p.role === "user" ? "user" : null;
    if (!role) return; // developer/system prompts are noise in a chat view
    const text = contentToText(p.content).trim();
    // Codex injects an <environment_context>/<user_instructions> wrapper as the
    // first "user" turn — skip those the way we skip Claude's reminders.
    if (!text || (role === "user" && text.startsWith("<"))) return;
    out.push({ role, kind: "text", text: clip(text, MAX_TEXT) });
    return;
  }
  if (p.type === "function_call" || p.type === "local_shell_call" || p.type === "custom_tool_call") {
    out.push({
      role: "assistant",
      kind: "tool-call",
      name: p.name || p.tool_name || (p.type === "local_shell_call" ? "shell" : "tool"),
      input: p.arguments ?? p.action ?? p.input ?? null,
    });
    return;
  }
  if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
    const raw = p.output;
    const text = typeof raw === "string" ? raw : contentToText(raw?.content) || JSON.stringify(raw ?? "");
    out.push({ role: "tool", kind: "tool-result", output: clip(text, MAX_TOOL_OUTPUT) });
    return;
  }
  if (p.type === "reasoning") {
    const text = contentToText(p.summary).trim() || contentToText(p.content).trim();
    if (text) out.push({ role: "assistant", kind: "reasoning", text: clip(text, MAX_TEXT) });
  }
}

// Parse a full transcript body into chat blocks. `tool` is "codex" | "claude".
export function parseChatTranscript(text, tool) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (tool === "claude") decodeClaudeLine(obj, out);
    else if (tool === "codex") decodeCodexLine(obj, out);
  }
  return out;
}
