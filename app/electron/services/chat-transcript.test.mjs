import { describe, expect, it } from "vitest";
import { parseChatTranscript } from "./chat-transcript.mjs";

describe("parseChatTranscript — claude", () => {
  it("decodes user text, assistant text, thinking, and tool use/result", () => {
    const lines = [
      { type: "mode", mode: "normal" }, // ignored
      { type: "user", message: { role: "user", content: "안녕?" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "let me think" },
            { type: "text", text: "안녕하세요!" },
            { type: "tool_use", name: "Bash", input: { command: "ls" } },
          ],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "file.txt", is_error: false }],
        },
      },
      { type: "user", message: { role: "user", content: "<system-reminder>ignore me</system-reminder>" } },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");

    const blocks = parseChatTranscript(lines, "claude");
    expect(blocks).toEqual([
      { role: "user", kind: "text", text: "안녕?" },
      { role: "assistant", kind: "reasoning", text: "let me think" },
      { role: "assistant", kind: "text", text: "안녕하세요!" },
      { role: "assistant", kind: "tool-call", name: "Bash", input: { command: "ls" } },
      { role: "tool", kind: "tool-result", output: "file.txt", isError: false },
    ]);
  });
});

describe("parseChatTranscript — codex", () => {
  it("decodes messages and tool calls, skipping developer/meta", () => {
    const lines = [
      { type: "session_meta", payload: { id: "x" } }, // ignored
      {
        type: "response_item",
        payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "<permissions>" }] },
      },
      {
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "최신화 해줘" }] },
      },
      {
        type: "response_item",
        payload: { type: "function_call", name: "shell", arguments: '{"cmd":"git status"}' },
      },
      {
        type: "response_item",
        payload: { type: "function_call_output", output: "clean" },
      },
      {
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "완료했습니다." }] },
      },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");

    const blocks = parseChatTranscript(lines, "codex");
    expect(blocks).toEqual([
      { role: "user", kind: "text", text: "최신화 해줘" },
      { role: "assistant", kind: "tool-call", name: "shell", input: '{"cmd":"git status"}' },
      { role: "tool", kind: "tool-result", output: "clean" },
      { role: "assistant", kind: "text", text: "완료했습니다." },
    ]);
  });

  it("ignores blank lines and malformed JSON", () => {
    const text = '\n{bad json}\n{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}}\n';
    expect(parseChatTranscript(text, "codex")).toEqual([
      { role: "user", kind: "text", text: "hi" },
    ]);
  });
});
