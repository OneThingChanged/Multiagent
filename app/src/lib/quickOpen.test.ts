import { describe, expect, it } from "vitest";
import { rankQuickOpenItems, type QuickOpenItem } from "./quickOpen";

const items: QuickOpenItem[] = [
  { id: "p", kind: "project", title: "ProjectA", subtitle: "D:/A", searchText: "" },
  { id: "s", kind: "session", title: "KawaiiPhysics", subtitle: "ProjectA", searchText: "codex" },
  { id: "d", kind: "document", title: "빌드 문서", subtitle: "docs/BUILD.md", searchText: "ProjectA" },
  { id: "c", kind: "command", title: "설정 열기", subtitle: "Ctrl+Comma", searchText: "preferences" },
];

describe("quick open ranking", () => {
  it("searches titles, metadata and Korean text", () => {
    expect(rankQuickOpenItems(items, "kawaii")[0].id).toBe("s");
    expect(rankQuickOpenItems(items, "빌드")[0].id).toBe("d");
  });

  it("supports command and document prefixes", () => {
    expect(rankQuickOpenItems(items, "> 설정").map((item) => item.id)).toEqual(["c"]);
    expect(rankQuickOpenItems(items, "/ build").map((item) => item.id)).toEqual(["d"]);
  });
});
