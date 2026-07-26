import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_WINDOW_ID,
  normalizeWorkspaceWindowId,
  workspaceGroupsKey,
  workspaceViewKey,
  workspaceWindowContext,
} from "./workspaceWindow";

describe("workspace window storage", () => {
  it("derives isolated layout keys from a validated window id", () => {
    expect(normalizeWorkspaceWindowId("window-a_1")).toBe("window-a_1");
    expect(workspaceGroupsKey("window-a_1")).toBe(
      "multiagent.workspace.window-a_1.groups.v1"
    );
    expect(workspaceViewKey("window-a_1")).toBe(
      "multiagent.workspace.window-a_1.view.v1"
    );
  });

  it("falls back safely for missing or malformed ids", () => {
    expect(normalizeWorkspaceWindowId("../escape")).toBe(
      DEFAULT_WORKSPACE_WINDOW_ID
    );
    expect(workspaceWindowContext("").restore).toBe(true);
    expect(workspaceWindowContext("?workspaceWindowId=fresh")).toMatchObject({
      id: "fresh",
      restore: false,
    });
    expect(
      workspaceWindowContext(
        "?workspaceWindowId=saved&restoreWorkspace=1&resumeWorkspace=1"
      )
    ).toMatchObject({ id: "saved", restore: true, resumeLive: true });
  });
});
