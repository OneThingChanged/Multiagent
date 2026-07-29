import { describe, expect, it } from "vitest";
import {
  gitHistoryTabTitle,
  isGitHistoryTabId,
  makeGitHistoryTabId,
  parseGitHistoryTabId,
} from "./gitHistoryTabs";

describe("git history tab ids", () => {
  it("keeps parsing legacy project-root history ids", () => {
    const id = makeGitHistoryTabId("project-1", "Source/main.ts");
    expect(parseGitHistoryTabId(id)).toEqual({
      projectId: "project-1",
      repositoryPath: null,
      path: "Source/main.ts",
    });
  });

  it("round-trips a submodule repository and repository-relative path", () => {
    const id = makeGitHistoryTabId(
      "project-1",
      "Source/main.ts",
      "Plugins/Shared UI"
    );
    expect(isGitHistoryTabId(id)).toBe(true);
    expect(parseGitHistoryTabId(id)).toEqual({
      projectId: "project-1",
      repositoryPath: "Plugins/Shared UI",
      path: "Source/main.ts",
    });
  });

  it("labels whole-submodule history with the repository name", () => {
    const id = makeGitHistoryTabId(
      "project-1",
      null,
      "Plugins/Shared UI"
    );
    expect(gitHistoryTabTitle(id)).toBe("History: Shared UI");
  });
});
