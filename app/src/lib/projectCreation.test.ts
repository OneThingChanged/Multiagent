import { describe, expect, it } from "vitest";
import {
  buildNewProjectWithDefaultAgent,
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

describe("buildNewProjectWithDefaultAgent", () => {
  it("creates a local project with an active first session", () => {
    const ids = ["project-1", "agent-1"];
    const result = buildNewProjectWithDefaultAgent(
      { name: "  Project A  ", folder: "  K:\\AI\\ProjectA  " },
      "codex",
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
    });
    expect(result.agent).toMatchObject({
      id: "agent-1",
      projectId: "project-1",
      name: "Session 1",
      folder: "K:\\AI\\ProjectA",
      aiToolId: "codex",
      aiLabel: "Codex",
      dangerous: false,
      status: "starting",
      runtimeStatus: "starting",
      createdAt: 1234,
    });
  });

  it("copies SSH project routing into the first session", () => {
    const ids = ["remote-project", "remote-agent"];
    const { project, agent } = buildNewProjectWithDefaultAgent(
      {
        name: "Remote",
        folder: "",
        sshHostId: "  host-1  ",
        remoteFolder: "  /srv/project  ",
      },
      "claude",
      { createId: () => ids.shift()!, now: 5678 }
    );

    expect(project.sshHostId).toBe("host-1");
    expect(project.remoteFolder).toBe("/srv/project");
    expect(agent.sshHostId).toBe("host-1");
    expect(agent.remoteFolder).toBe("/srv/project");
  });
});
