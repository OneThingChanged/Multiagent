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
  it("keeps built-in agent commands portable on local Windows", () => {
    expect(resolveLocalToolCommand("codex", "codex")).toBe("codex");
    expect(resolveLocalToolCommand("claude", "claude")).toBe("claude");
    expect(resolveLocalToolCommand("qwen", "qwen")).toBe("qwen");
    expect(resolveLocalToolCommand("cline", "cline")).toBe("cline");
  });

  it("keeps custom commands unchanged", () => {
    expect(
      resolveLocalToolCommand("codex", "C:\\Tools\\codex.exe")
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
      "codex resume session-from-hook-index --no-alt-screen"
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
      "codex resume stored-session --no-alt-screen"
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
      "codex resume pinned-session --no-alt-screen"
    );
  });

  it("scopes managed account resume lookup and forces file credentials", async () => {
    invokeMock.mockResolvedValueOnce("work-session");
    const result = await buildSpawnArgs({ ...agent, codexAccountId: "work" }, null, vi.fn());
    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", expect.objectContaining({ codexAccountId: "work" }));
    expect(result.initCommand).toContain("codex resume work-session");
    expect(result.initCommand).toContain("-c cli_auth_credentials_store=file");
  });

  it("applies worker settings when an existing Codex session is resumed", async () => {
    invokeMock.mockResolvedValueOnce("existing-session");

    const result = await buildSpawnArgs(
      {
        ...agent,
        lastSessionId: "existing-session",
        workerSettings: {
          documents: "codex-luna-max",
          html: "claude-opus",
        },
      },
      null,
      vi.fn()
    );

    expect(result.initCommand).toContain(
      "codex resume existing-session --no-alt-screen"
    );
    expect(result.initCommand).toContain(
      "agents.default_subagent_model=\"gpt-5.6-luna\""
    );
    expect(result.initCommand).toContain("claude -p --model opus");
  });
});
