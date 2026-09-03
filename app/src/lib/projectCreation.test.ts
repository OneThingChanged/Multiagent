import { describe, expect, it } from "vitest";
import {
  buildNewProjectWithFirstAgent,
  defaultAiToolId,
} from "./projectCreation";

describe("defaultAiToolId", () => {
  it("uses the first enabled agent tool and always falls back to shell", () => {
    expect(defaultAiToolId([])).toBe("claude");
    expect(defaultAiToolId(["claude", "codex"])).toBe("qwen");
    expect(
      defaultAiToolId(["claude", "codex", "qwen", "cline", "none"])
    ).toBe("none");
  });
});

describe("buildNewProjectWithFirstAgent", () => {
  it("creates a local project with the explicitly selected first session", () => {
    const ids = ["project-1", "agent-1"];
    const result = buildNewProjectWithFirstAgent(
      {
        name: "  Project A  ",
        folder: "  K:\\AI\\ProjectA  ",
        aiToolId: "codex",
        dangerous: true,
        projectFolderId: "folder-work",
      },
      {
        createId: () => ids.shift()!,
        now: 1234,
      }
    );

    expect(result.project).toEqual({
      id: "project-1",
      name: "Project A",
      folder: "K:\\AI\\ProjectA",
      createdAt: 1234,
      lastOpenedAt: 1234,
      sshHostId: undefined,
      remoteFolder: undefined,
      projectFolderId: "folder-work",
    });
    expect(result.agent).toMatchObject({
      id: "agent-1",
      projectId: "project-1",
      name: "Session 1",
      folder: "K:\\AI\\ProjectA",
      aiToolId: "codex",
      aiLabel: "Codex",
      dangerous: true,
      workerSettings: {
        documents: "codex-luna-max",
        html: "codex-luna-max",
      },
      status: "starting",
      runtimeStatus: "starting",
      createdAt: 1234,
    });
  });

  it("copies SSH project routing into the first session", () => {
    const ids = ["remote-project", "remote-agent"];
    const { project, agent } = buildNewProjectWithFirstAgent(
      {
        name: "Remote",
        folder: "",
        aiToolId: "claude",
        dangerous: false,
        sshHostId: "  host-1  ",
        remoteFolder: "  /srv/project  ",
      },
      { createId: () => ids.shift()!, now: 5678 }
    );

    expect(project.sshHostId).toBe("host-1");
    expect(project.remoteFolder).toBe("/srv/project");
    expect(agent.sshHostId).toBe("host-1");
    expect(agent.remoteFolder).toBe("/srv/project");
    expect(agent.workerSettings).toBeUndefined();
  });

  it("discards dangerous mode for a tool without a dangerous flag", () => {
    const ids = ["shell-project", "shell-agent"];
    const { agent } = buildNewProjectWithFirstAgent(
      {
        name: "Shell Project",
        folder: "K:\\AI\\ShellProject",
        aiToolId: "none",
        dangerous: true,
      },
      { createId: () => ids.shift()!, now: 9999 }
    );

    expect(agent.aiToolId).toBe("none");
    expect(agent.dangerous).toBe(false);
  });
});
