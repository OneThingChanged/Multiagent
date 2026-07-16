import { describe, expect, it } from "vitest";
import {
  addTerminalCompatibilityArgs,
  resolveLocalToolCommand,
  resolveRemoteToolCommand,
} from "./spawn";

describe("resolveLocalToolCommand", () => {
  it("uses npm .cmd shims for built-in agents on local Windows", () => {
    expect(resolveLocalToolCommand("codex", "codex", "win32")).toBe(
      "codex.cmd"
    );
    expect(resolveLocalToolCommand("claude", "claude", "Windows 11")).toBe(
      "claude.cmd"
    );
  });

  it("keeps POSIX and custom commands unchanged", () => {
    expect(resolveLocalToolCommand("codex", "codex", "linux")).toBe("codex");
    expect(
      resolveLocalToolCommand("codex", "C:\\Tools\\codex.exe", "win32")
    ).toBe("C:\\Tools\\codex.exe");
  });
});

describe("resolveRemoteToolCommand", () => {
  it("uses .cmd shims for Codex on Windows SSH by default", () => {
    expect(
      resolveRemoteToolCommand("codex", "codex", { remoteOs: "windows" })
    ).toBe("codex.cmd");
  });

  it("uses .cmd shims for Claude on Windows SSH by default", () => {
    expect(
      resolveRemoteToolCommand("claude", "claude", { remoteOs: "windows" })
    ).toBe("claude.cmd");
  });

  it("keeps POSIX remote commands unchanged", () => {
    expect(
      resolveRemoteToolCommand("codex", "codex", { remoteOs: "posix" })
    ).toBe("codex");
  });

  it("allows Windows hosts to opt out", () => {
    expect(
      resolveRemoteToolCommand("codex", "codex", {
        remoteOs: "windows",
        preferCmdShim: false,
      })
    ).toBe("codex");
  });
});

describe("addTerminalCompatibilityArgs", () => {
  it("runs new Codex sessions in the normal terminal buffer", () => {
    expect(addTerminalCompatibilityArgs("codex", "codex.cmd")).toBe(
      "codex.cmd --no-alt-screen"
    );
  });

  it("runs resumed Codex sessions in the normal terminal buffer", () => {
    expect(
      addTerminalCompatibilityArgs("codex", "codex resume session-123")
    ).toBe("codex resume session-123 --no-alt-screen");
  });

  it("does not duplicate the flag or modify other tools", () => {
    expect(
      addTerminalCompatibilityArgs("codex", "codex --no-alt-screen")
    ).toBe("codex --no-alt-screen");
    expect(addTerminalCompatibilityArgs("claude", "claude")).toBe("claude");
  });
});
