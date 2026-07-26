import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../types";
import {
  addTerminalCompatibilityArgs,
  buildSpawnArgs,
  resolveLocalToolCommand,
  resolveRemoteToolCommand,
} from "./spawn";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("../platform/runtime", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
});

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

  it("skips the flag when the session opts into alt-screen", () => {
    expect(addTerminalCompatibilityArgs("codex", "codex.cmd", true)).toBe(
      "codex.cmd"
    );
    expect(
      addTerminalCompatibilityArgs("codex", "codex resume session-123", true)
    ).toBe("codex resume session-123");
  });
});

describe("buildSpawnArgs resume recovery", () => {
  const agent = {
    id: "agent-a",
    projectId: "project-a",
    name: "A",
    folder: "C:\\workspace",
    aiToolId: "codex",
    aiLabel: "Codex",
    dangerous: false,
    status: "idle",
    createdAt: 1,
  } as Agent;

  it("recovers a missing localStorage id from the per-agent backend index", async () => {
    invokeMock.mockResolvedValueOnce("session-from-hook-index");
    const setAgentSessionId = vi.fn();

    const result = await buildSpawnArgs(agent, null, setAgentSessionId);

    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", {
      aiToolId: "codex",
      folder: "C:\\workspace",
      agentId: "agent-a",
      agentName: "A",
      preferredSessionId: null,
    });
    expect(result.initCommand).toBe(
      "codex.cmd resume session-from-hook-index --no-alt-screen"
    );
    expect(setAgentSessionId).toHaveBeenCalledWith(
      "agent-a",
      "session-from-hook-index"
    );
  });

  it("keeps a stored resume id when validation is temporarily unavailable", async () => {
    invokeMock.mockRejectedValueOnce(new Error("temporary scan failure"));
    const setAgentSessionId = vi.fn();

    const result = await buildSpawnArgs(
      { ...agent, lastSessionId: "stored-session" },
      null,
      setAgentSessionId
    );

    expect(result.initCommand).toBe(
      "codex.cmd resume stored-session --no-alt-screen"
    );
    expect(setAgentSessionId).not.toHaveBeenCalled();
  });

  it("does not silently discard an invalid pinned resume target", async () => {
    invokeMock.mockResolvedValueOnce(null);

    const result = await buildSpawnArgs(
      { ...agent, lastSessionId: "newer-session" },
      { "agent-a": "pinned-session" },
      vi.fn()
    );

    expect(result.initCommand).toBe(
      "codex.cmd resume pinned-session --no-alt-screen"
    );
  });
});
