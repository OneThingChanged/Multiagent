import { expect, it } from "vitest";
import {
  BoundedTerminalBuffer,
  CodexScrollbackFilter,
  SequencedTerminalBuffer,
} from "./terminal-stream.mjs";

it("Codex scrollback filter removes CSI 3 J without changing other control sequences", () => {
  const filter = new CodexScrollbackFilter();
  expect(
    filter.push("before\u001b[2Jmiddle\u001b[3Jafter\u001b[H"),
  ).toBe("before\u001b[2Jmiddleafter\u001b[H");
  expect(filter.finish()).toBe("");
});

it("Codex scrollback filter handles escape sequence split across chunks", () => {
  const filter = new CodexScrollbackFilter();
  expect(filter.push("한국어\u001b")).toBe("한국어");
  expect(filter.push("[3")).toBe("");
  expect(filter.push("J계속\u001b[31m")).toBe("계속\u001b[31m");
  expect(filter.finish()).toBe("");
});

it("Codex scrollback filter flushes an incomplete non-command suffix", () => {
  const filter = new CodexScrollbackFilter();
  expect(filter.push("text\u001b[")).toBe("text");
  expect(filter.finish()).toBe("\u001b[");
});

it("bounded terminal buffer retains only its newest characters", () => {
  const buffer = new BoundedTerminalBuffer(1024);
  buffer.append("a".repeat(700));
  buffer.append("나".repeat(700));
  const snapshot = buffer.snapshot();
  expect(snapshot.length).toBe(1024);
  expect(snapshot).toBe("a".repeat(324) + "나".repeat(700));
});

it("sequenced terminal buffer replays only output after the requested cursor", () => {
  const buffer = new SequencedTerminalBuffer();
  expect(buffer.append("hello")).toEqual({
    sequenceStart: 0,
    sequenceEnd: 5,
    data: "hello",
  });
  buffer.append(" world");

  expect(buffer.readSince(5)).toEqual({
    sequenceStart: 5,
    sequenceEnd: 11,
    data: " world",
    resetRequired: false,
    truncated: false,
  });
});

it("sequenced terminal buffer requests a reset when the cursor was truncated", () => {
  const buffer = new SequencedTerminalBuffer(1024);
  buffer.append("a".repeat(900));
  buffer.append("b".repeat(300));

  expect(buffer.baseSequence).toBe(176);
  expect(buffer.readSince(100)).toEqual({
    sequenceStart: 176,
    sequenceEnd: 1200,
    data: "a".repeat(724) + "b".repeat(300),
    resetRequired: true,
    truncated: true,
  });
});

it("sequenced terminal buffer resets a cursor from an older process generation", () => {
  const buffer = new SequencedTerminalBuffer();
  buffer.append("new process");
  expect(buffer.readSince(500)).toMatchObject({
    sequenceStart: 0,
    sequenceEnd: 11,
    data: "new process",
    resetRequired: true,
  });
});
