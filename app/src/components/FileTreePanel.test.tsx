import { describe, expect, it } from "vitest";
import { fileKindOf } from "./FileTreePanel";

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
