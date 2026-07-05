import { describe, expect, it } from "vitest";
import { resolveRemoteToolCommand } from "./spawn";

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
