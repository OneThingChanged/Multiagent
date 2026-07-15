import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveTerminalPath } from "./terminal-path-service.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("terminal path resolver", () => {
  it("resolves project-relative markdown paths and line suffixes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "docs", "guide.md"), "# guide");
    const result = resolveTerminalPath(root, "docs/guide.md:42");
    expect(result.kind).toBe("markdown");
    expect(result.path).toBe(fs.realpathSync(path.join(root, "docs", "guide.md")));
  });

  it("rejects traversal outside the project", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    expect(() => resolveTerminalPath(root, "../secret.md")).toThrow(/상대경로/);
  });
});
