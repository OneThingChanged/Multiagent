import { describe, expect, it } from "vitest";
import type { ChatBlock } from "../platform/ipcContract";
import { groupAssistantBlocks } from "./ChatView";

describe("groupAssistantBlocks", () => {
  it("keeps tool work between the assistant text blocks where it occurred", () => {
    const blocks: ChatBlock[] = [
      { role: "assistant", kind: "text", text: "먼저 확인하겠습니다." },
      { role: "assistant", kind: "tool-call", name: "read", summary: "src/app.ts" },
      { role: "tool", kind: "tool-result", output: "file contents" },
      { role: "assistant", kind: "text", text: "확인했습니다." },
    ];

    const segments = groupAssistantBlocks(blocks);

    expect(segments.map((segment) => segment.kind)).toEqual(["block", "tools", "block"]);
    expect(segments[1]).toMatchObject({
      kind: "tools",
      tools: [{ name: "read", output: "file contents" }],
    });
  });

  it("pairs batched tool results with their calls in order", () => {
    const blocks: ChatBlock[] = [
      { role: "assistant", kind: "tool-call", name: "read", summary: "a.ts" },
      { role: "assistant", kind: "tool-call", name: "read", summary: "b.ts" },
      { role: "tool", kind: "tool-result", output: "A" },
      { role: "tool", kind: "tool-result", output: "B", isError: true },
    ];

    const segments = groupAssistantBlocks(blocks);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "tools",
      tools: [
        { summary: "a.ts", output: "A" },
        { summary: "b.ts", output: "B", isError: true },
      ],
    });
  });

  it("does not move a detached result across intervening narrative", () => {
    const blocks: ChatBlock[] = [
      { role: "assistant", kind: "tool-call", name: "run" },
      { role: "assistant", kind: "text", text: "중간 설명" },
      { role: "tool", kind: "tool-result", output: "late result" },
    ];

    const segments = groupAssistantBlocks(blocks);

    expect(segments.map((segment) => segment.kind)).toEqual(["tools", "block", "tools"]);
    expect(segments[2]).toMatchObject({
      kind: "tools",
      tools: [{ name: "result", output: "late result" }],
    });
  });
});
