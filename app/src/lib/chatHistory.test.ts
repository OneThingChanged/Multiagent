import { describe, expect, it } from "vitest";
import type { ChatBlock } from "../platform/ipcContract";
import { mergeChatHistory } from "./chatHistory";

const textBlock = (text: string): ChatBlock => ({ role: "assistant", kind: "text", text });

describe("mergeChatHistory", () => {
  it("appends a growing full transcript without duplicating its prefix", () => {
    const previous = [textBlock("a"), textBlock("b")];
    const incoming = [textBlock("a"), textBlock("b"), textBlock("c")];

    expect(mergeChatHistory(previous, incoming).map((block) => block.text))
      .toEqual(["a", "b", "c"]);
  });

  it("preserves blocks that slid out of the bounded transcript tail", () => {
    const previous = [textBlock("a"), textBlock("b"), textBlock("c"), textBlock("d")];
    const incoming = [textBlock("c"), textBlock("d"), textBlock("e")];

    expect(mergeChatHistory(previous, incoming).map((block) => block.text))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps the last conversation when a transient lookup returns no blocks", () => {
    const previous = [textBlock("a"), textBlock("b")];

    expect(mergeChatHistory(previous, [])).toBe(previous);
  });

  it("appends a non-overlapping new tail instead of discarding known history", () => {
    const previous = [textBlock("a"), textBlock("b")];
    const incoming = [textBlock("x"), textBlock("y")];

    expect(mergeChatHistory(previous, incoming).map((block) => block.text))
      .toEqual(["a", "b", "x", "y"]);
  });
});
