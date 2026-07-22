import { describe, expect, it } from "vitest";
import { LS_AGENTS, LS_GROUPS, LS_PROJECTS, LS_SSH_HOSTS } from "../types";
import {
  mergeSharedWorkspaceValues,
  sanitizeSharedWorkspaceValues,
} from "./sharedWorkspace";

describe("shared workspace migration", () => {
  it("preserves local-only projects and sessions when the legacy snapshot is empty", () => {
    const merged = mergeSharedWorkspaceValues(
      {
        [LS_PROJECTS]: JSON.stringify([{ id: "project-live", name: "Live" }]),
        [LS_AGENTS]: JSON.stringify([
          { id: "session-live", projectId: "project-live", lastSessionId: "resume-1" },
        ]),
      },
      { [LS_PROJECTS]: "[]", [LS_AGENTS]: "[]" }
    );

    expect(JSON.parse(merged[LS_PROJECTS])).toEqual([
      { id: "project-live", name: "Live" },
    ]);
    expect(JSON.parse(merged[LS_AGENTS])[0].lastSessionId).toBe("resume-1");
  });

  it("unions different ids and lets shared data win matching ids", () => {
    const merged = mergeSharedWorkspaceValues(
      {
        [LS_PROJECTS]: JSON.stringify([
          { id: "same", name: "old" },
          { id: "local", name: "local" },
        ]),
      },
      {
        [LS_PROJECTS]: JSON.stringify([
          { id: "same", name: "new" },
          { id: "shared", name: "shared" },
        ]),
      }
    );

    expect(JSON.parse(merged[LS_PROJECTS])).toEqual([
      { id: "same", name: "new" },
      { id: "local", name: "local" },
      { id: "shared", name: "shared" },
    ]);
  });

  it("keeps only workspace data keys and supplies empty registries", () => {
    expect(
      sanitizeSharedWorkspaceValues({
        [LS_PROJECTS]: "[]",
        "multiagent.desktopPetEnabled.v1": "true",
      })
    ).toEqual({
      [LS_PROJECTS]: "[]",
      [LS_AGENTS]: "[]",
      [LS_GROUPS]: "[]",
      [LS_SSH_HOSTS]: "[]",
    });
  });
});
