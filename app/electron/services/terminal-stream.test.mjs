import { expect, it } from "vitest";
import { Terminal } from "@xterm/xterm/lib/xterm.mjs";
import {
  BoundedTerminalBuffer,
  CodexScrollbackFilter,
  PassThroughTerminalFilter,
  SequencedTerminalBuffer,
} from "./terminal-stream.mjs";

function createTerminal(cols = 20, rows = 4) {
  return new Terminal({ cols, rows, scrollback: 100, allowProposedApi: true });
}

function writeTerminal(terminal, data) {
  if (!data) return Promise.resolve();
  return new Promise((resolve) => terminal.write(data, resolve));
}

async function pushToTerminal(filter, terminal, chunk) {
  const output = filter.push(chunk);
  await writeTerminal(terminal, output);
  return output;
}

function bufferLines(terminal, start, count) {
  return Array.from(
    { length: count },
    (_, index) =>
      terminal.buffer.active
        .getLine(start + index)
        ?.translateToString(true) ?? "",
  );
}

it("Codex scrollback filter preserves the viewport before CSI 2 J", async () => {
  const filter = new CodexScrollbackFilter(4, 20);
  const terminal = createTerminal();
  await pushToTerminal(
    filter,
    terminal,
    "line1\r\nline2\r\nline3\r\nline4",
  );
  await pushToTerminal(filter, terminal, "\u001b[2J\u001b[Hreplacement");

  expect(terminal.buffer.active.baseY).toBe(4);
  expect(bufferLines(terminal, 0, 4)).toEqual([
    "line1",
    "line2",
    "line3",
    "line4",
  ]);
  expect(bufferLines(terminal, terminal.buffer.active.baseY, 4)).toEqual([
    "replacement",
    "",
    "",
    "",
  ]);
  filter.dispose();
  terminal.dispose();
});

it("Codex scrollback filter removes CSI 3 J without changing other control sequences", () => {
  const filter = new CodexScrollbackFilter(4, 20);
  expect(
    filter.push("before\u001b[31mred\u001b[3Jafter\u001b[H"),
  ).toBe("before\u001b[31mredafter\u001b[H");
  expect(filter.finish()).toBe("");
  filter.dispose();
});

it("Codex scrollback filter handles CSI 2 J and CSI 3 J split across chunks", async () => {
  const filter = new CodexScrollbackFilter(4, 20);
  const terminal = createTerminal();
  await pushToTerminal(filter, terminal, "하나\r\n둘\u001b");
  expect(await pushToTerminal(filter, terminal, "[3")).toBe("");
  expect(await pushToTerminal(filter, terminal, "J계속\u001b")).toBe("계속");
  expect(await pushToTerminal(filter, terminal, "[2")).toBe("");
  await pushToTerminal(filter, terminal, "J\u001b[H교체");

  expect(terminal.buffer.active.baseY).toBe(2);
  expect(bufferLines(terminal, 0, 2)).toEqual(["하나", "둘계속"]);
  expect(bufferLines(terminal, 2, 4)).toEqual(["교체", "", "", ""]);
  filter.dispose();
  terminal.dispose();
});

it("Codex scrollback filter preserves rows shifted by synchronized repaint frames", async () => {
  const filter = new CodexScrollbackFilter(4, 20);
  const terminal = createTerminal();
  await pushToTerminal(filter, terminal, "A\r\nB\r\nC");

  expect(filter.push("\u001b[?202")).toBe("");
  expect(filter.push("6h\u001b[HB\r\nC\r\nD\u001b[?2026")).toBe("");
  const firstFrame = filter.push("l");
  expect(firstFrame).toContain("\u001b[?2026h\u001b7\u001b[4;1H\r\n\u001b8");
  await writeTerminal(terminal, firstFrame);
  expect(terminal.buffer.active.baseY).toBe(1);
  expect(bufferLines(terminal, 0, 1)).toEqual(["A"]);
  expect(bufferLines(terminal, 1, 4)).toEqual(["B", "C", "D", ""]);

  await pushToTerminal(filter, terminal, "\r\nE");
  await pushToTerminal(
    filter,
    terminal,
    "\u001b[?2026h\u001b[HC\r\nD\r\nE\r\nF\u001b[?2026l",
  );
  expect(terminal.buffer.active.baseY).toBe(2);
  expect(bufferLines(terminal, 0, 2)).toEqual(["A", "B"]);
  expect(bufferLines(terminal, 2, 4)).toEqual(["C", "D", "E", "F"]);
  filter.dispose();
  terminal.dispose();
});

it("Codex scrollback filter does not duplicate scrollback created naturally in a synchronized frame", async () => {
  const filter = new CodexScrollbackFilter(3, 20);
  const terminal = createTerminal(20, 3);
  await pushToTerminal(filter, terminal, "A\r\nB\r\nC");
  await pushToTerminal(
    filter,
    terminal,
    "\u001b[?2026h\r\nD\u001b[?2026l",
  );

  expect(terminal.buffer.active.baseY).toBe(1);
  expect(bufferLines(terminal, 0, 4)).toEqual(["A", "B", "C", "D"]);
  filter.dispose();
  terminal.dispose();
});

it("Codex scrollback filter does not create scrollback for an unchanged synchronized repaint", async () => {
  const filter = new CodexScrollbackFilter(3, 20);
  const terminal = createTerminal(20, 3);
  await pushToTerminal(filter, terminal, "same\r\nsame\r\nsame");
  await pushToTerminal(
    filter,
    terminal,
    "\u001b[?2026h\u001b[Hsame\r\nsame\r\nsame\u001b[?2026l",
  );

  expect(terminal.buffer.active.baseY).toBe(0);
  expect(bufferLines(terminal, 0, 3)).toEqual(["same", "same", "same"]);
  filter.dispose();
  terminal.dispose();
});

it("pass-through terminal output keeps Codex-specific erase controls intact", () => {
  const filter = new PassThroughTerminalFilter();
  expect(filter.push(`shell\u001b[2J\u001b[3J`)).toBe(
    `shell\u001b[2J\u001b[3J`,
  );
});

it("Codex scrollback filter flushes an incomplete ANSI suffix", () => {
  const filter = new CodexScrollbackFilter(4, 20);
  expect(filter.push("text\u001b[")).toBe("text");
  expect(filter.finish()).toBe("\u001b[");
  filter.dispose();
});

it("Codex scrollback filter applies resized dimensions to viewport preservation", async () => {
  const filter = new CodexScrollbackFilter(3, 10);
  const terminal = createTerminal(10, 3);
  filter.resize(12, 4);
  terminal.resize(12, 4);
  await pushToTerminal(filter, terminal, "A\r\nB\r\nC\r\nD");
  await pushToTerminal(filter, terminal, "\u001b[2J");

  expect(terminal.cols).toBe(12);
  expect(terminal.rows).toBe(4);
  expect(terminal.buffer.active.baseY).toBe(4);
  expect(bufferLines(terminal, 0, 4)).toEqual(["A", "B", "C", "D"]);
  filter.dispose();
  terminal.dispose();
});

it("Codex scrollback filter holds an escape prefix until it is complete", () => {
  const filter = new CodexScrollbackFilter(4, 20);
  expect(filter.push("한국어\u001b")).toBe("한국어");
  expect(filter.push("[3")).toBe("");
  expect(filter.push("J계속\u001b[31m")).toBe("계속\u001b[31m");
  expect(filter.finish()).toBe("");
  filter.dispose();
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
