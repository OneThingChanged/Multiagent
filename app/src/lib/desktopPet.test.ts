import { describe, expect, it } from "vitest";
import { buildDesktopPetUpdate } from "./desktopPet";

describe("buildDesktopPetUpdate", () => {
  it("prefers unread completions over working sessions", () => {
    const result = buildDesktopPetUpdate(
      [{ status: "working" }, { status: "running" }],
      [
        {
          key: "done-1",
          agentId: "agent-1",
          title: "Project / Session",
          body: "작업이 끝났어요",
        },
      ]
    );

    expect(result).toMatchObject({
      status: "done",
      workingCount: 1,
      completedCount: 1,
      agentId: "agent-1",
      notificationKey: "done-1",
    });
  });

  it("shows working, running, and idle aggregate states", () => {
    expect(buildDesktopPetUpdate([{ status: "working" }], []).status).toBe(
      "working"
    );
    expect(buildDesktopPetUpdate([{ status: "starting" }], []).status).toBe(
      "running"
    );
    expect(buildDesktopPetUpdate([{ status: "exited" }], []).status).toBe(
      "idle"
    );
  });
});
