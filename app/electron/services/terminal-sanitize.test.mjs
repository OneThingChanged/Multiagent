import { describe, expect, it } from "vitest";
import { sanitizeTerminalOutput } from "./terminal-sanitize.mjs";

const ESC = "\x1b";

describe("sanitizeTerminalOutput", () => {
  it("collapses an in-place spinner to its final frame", () => {
    const raw =
      ESC + "[33m• Working" + ESC + "[K" +
      "\r• orking" + ESC + "[K" +
      "\r• rking" + ESC + "[K" + ESC + "[0m";
    expect(sanitizeTerminalOutput(raw)).toBe("• rking");
  });

  it("overwrites a status box redrawn via cursor-up instead of stacking copies", () => {
    const frame = (pct) =>
      "─────\r\nProjectA git:branch\r\n" + `Context ${pct}%\r\nbypass permissions on\r\n`;
    const up4 = ESC + "[4A";
    const raw =
      "work line 1\r\nwork line 2\r\n" +
      frame(1) + up4 + frame(3) + up4 + frame(6);
    const out = sanitizeTerminalOutput(raw);
    // The status box must appear exactly once, showing the final frame.
    expect(out.match(/bypass permissions on/g)).toHaveLength(1);
    expect(out).toContain("Context 6%");
    expect(out).not.toContain("Context 1%");
    expect(out).toContain("work line 1");
  });

  it("preserves literal brackets and OSC titles are stripped", () => {
    const raw = ESC + "]0;window title\x07hello [world]";
    expect(sanitizeTerminalOutput(raw)).toBe("hello [world]");
  });

  it("honors erase-display so a full clear starts a fresh region", () => {
    const raw = "old content\r\n" + ESC + "[2J" + "fresh screen";
    const out = sanitizeTerminalOutput(raw);
    expect(out).toContain("fresh screen");
  });
});
