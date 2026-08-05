import { describe, expect, it } from "vitest";
import {
  collectKindFilterPaths,
  fileKindOf,
  projectRelativeFromScope,
  shouldDiffGitChangeOnDoubleClick,
  shouldRefreshGitForHook,
} from "./FileTreePanel";

describe("fileKindOf", () => {
  it("classifies markdown files", () => {
    expect(fileKindOf("README.md")).toBe("md");
    expect(fileKindOf("notes.markdown")).toBe("md");
  });

  it("classifies html files", () => {
    expect(fileKindOf("index.html")).toBe("html");
    expect(fileKindOf("page.htm")).toBe("html");
  });

  it("classifies image files", () => {
    expect(fileKindOf("logo.png")).toBe("image");
    expect(fileKindOf("photo.JPG")).toBe("image");
    expect(fileKindOf("icon.svg")).toBe("image");
  });

  it("classifies code files", () => {
    expect(fileKindOf("main.cpp")).toBe("code");
    expect(fileKindOf("Player.cs")).toBe("code");
    expect(fileKindOf("header.h")).toBe("code");
    expect(fileKindOf("app.tsx")).toBe("code");
    expect(fileKindOf("script.py")).toBe("code");
  });

  it("returns null for uncategorized files", () => {
    expect(fileKindOf("notes.txt")).toBeNull();
    expect(fileKindOf("data.csv")).toBeNull();
    expect(fileKindOf("LICENSE")).toBeNull();
    expect(fileKindOf("archive.zip")).toBeNull();
  });
});

describe("collectKindFilterPaths", () => {
  const entries = new Map([
    [
      "",
      [
        { name: "Docs", relativePath: "Docs", isDir: true },
        { name: "Source", relativePath: "Source", isDir: true },
        { name: "Empty", relativePath: "Empty", isDir: true },
        { name: "logo.png", relativePath: "logo.png", isDir: false },
      ],
    ],
    [
      "Docs",
      [
        { name: "Guide", relativePath: "Docs/Guide", isDir: true },
        { name: "index.html", relativePath: "Docs/index.html", isDir: false },
      ],
    ],
    [
      "Docs/Guide",
      [
        {
          name: "README.md",
          relativePath: "Docs/Guide/README.md",
          isDir: false,
        },
      ],
    ],
    [
      "Source",
      [{ name: "main.ts", relativePath: "Source/main.ts", isDir: false }],
    ],
    ["Empty", []],
  ]);

  it("keeps matching files and only their ancestor folders", () => {
    const result = collectKindFilterPaths(entries, new Set(["md"]));

    expect([...result.matchingFiles]).toEqual(["Docs/Guide/README.md"]);
    expect([...result.visibleDirs].sort()).toEqual(["Docs", "Docs/Guide"]);
    expect(result.visibleDirs.has("Source")).toBe(false);
    expect(result.visibleDirs.has("Empty")).toBe(false);
  });

  it("combines multiple selected kinds", () => {
    const result = collectKindFilterPaths(
      entries,
      new Set(["image", "code"])
    );

    expect([...result.matchingFiles].sort()).toEqual([
      "Source/main.ts",
      "logo.png",
    ]);
    expect([...result.visibleDirs]).toEqual(["Source"]);
  });

  it("returns no paths when no type filter is selected", () => {
    const result = collectKindFilterPaths(entries, new Set());
    expect(result.matchingFiles.size).toBe(0);
    expect(result.visibleDirs.size).toBe(0);
  });
});

describe("shouldDiffGitChangeOnDoubleClick", () => {
  it("uses the external diff for source and text files", () => {
    expect(shouldDiffGitChangeOnDoubleClick("Source/main.cpp")).toBe(true);
    expect(shouldDiffGitChangeOnDoubleClick("Config/DefaultEditor.ini")).toBe(true);
    expect(shouldDiffGitChangeOnDoubleClick("README.md")).toBe(true);
    expect(shouldDiffGitChangeOnDoubleClick("UnrealTF.uproject")).toBe(true);
    expect(shouldDiffGitChangeOnDoubleClick("Dockerfile")).toBe(true);
  });

  it("keeps HTML and non-text assets on the normal open action", () => {
    expect(shouldDiffGitChangeOnDoubleClick("Docs/report.html")).toBe(false);
    expect(shouldDiffGitChangeOnDoubleClick("Docs/page.HTM")).toBe(false);
    expect(shouldDiffGitChangeOnDoubleClick("Content/Hero.uasset")).toBe(false);
    expect(shouldDiffGitChangeOnDoubleClick("Images/preview.png")).toBe(false);
    expect(shouldDiffGitChangeOnDoubleClick("Build/archive.zip")).toBe(false);
  });
});

describe("projectRelativeFromScope", () => {
  it("prefixes submodule paths while leaving the main project unchanged", () => {
    expect(projectRelativeFromScope("", "Source/main.ts")).toBe(
      "Source/main.ts"
    );
    expect(
      projectRelativeFromScope("Plugins/Shared", "Source/main.ts")
    ).toBe("Plugins/Shared/Source/main.ts");
  });
});

describe("shouldRefreshGitForHook", () => {
  it("refreshes only after a completed agent answer", () => {
    expect(shouldRefreshGitForHook("done")).toBe(true);
    expect(shouldRefreshGitForHook("tool-end")).toBe(false);
    expect(shouldRefreshGitForHook("working")).toBe(false);
    expect(shouldRefreshGitForHook(undefined)).toBe(false);
  });
});
