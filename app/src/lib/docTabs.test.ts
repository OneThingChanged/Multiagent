import { describe, it, expect } from "vitest";
import type { LayoutNode } from "../types";
import { makeLeaf, validateLayout } from "./layout";
import {
  docFileExtension,
  docKindForPath,
  docTabBasename,
  isBrowserTabId,
  isDocTabId,
  layoutTabIdsForClosedBrowser,
  makeBrowserTabId,
  makeDocTabId,
  parseBrowserTabId,
  parseDocTabId,
  stripDocTabs,
} from "./docTabs";

describe("doc tab ids", () => {
  it("round-trips project id + relative path", () => {
    const id = makeDocTabId("project-1", "docs/README.md");
    expect(isDocTabId(id)).toBe(true);
    expect(parseDocTabId(id)).toEqual({
      projectId: "project-1",
      relativePath: "docs/README.md",
    });
  });

  it("normalizes backslashes and leading slashes", () => {
    const id = makeDocTabId("p", "docs\\sub\\file.md");
    expect(parseDocTabId(id)?.relativePath).toBe("docs/sub/file.md");
    expect(parseDocTabId(makeDocTabId("p", "/rooted.md"))?.relativePath).toBe(
      "rooted.md"
    );
  });

  it("keeps colons inside the path payload (Windows absolute fallback)", () => {
    const id = makeDocTabId("p", "C:/tmp/notes.md");
    expect(parseDocTabId(id)).toEqual({
      projectId: "p",
      relativePath: "C:/tmp/notes.md",
    });
  });

  it("rejects non-doc and malformed ids", () => {
    expect(isDocTabId("agent-uuid")).toBe(false);
    expect(parseDocTabId("agent-uuid")).toBeNull();
    expect(parseDocTabId("doc:only-project")).toBeNull();
    expect(parseDocTabId("doc::path.md")).toBeNull();
    expect(parseDocTabId("doc:p:")).toBeNull();
  });

  it("extracts basename and extension", () => {
    const id = makeDocTabId("p", "docs/guide/Setup.MD");
    expect(docTabBasename(id)).toBe("Setup.MD");
    expect(docFileExtension(id)).toBe("md");
    expect(docTabBasename("not-a-doc")).toBe("not-a-doc");
  });

  it("encodes ephemeral embedded-browser tabs inside the virtual tab namespace", () => {
    const id = makeBrowserTabId("browser-123");
    expect(isDocTabId(id)).toBe(true);
    expect(isBrowserTabId(id)).toBe(true);
    expect(parseBrowserTabId(id)).toBe("browser-123");
    expect(isBrowserTabId(makeDocTabId("p", "docs/page.html"))).toBe(false);
  });

  it("returns both the web tab and its source document tab when a browser closes", () => {
    const sourceTabId = makeDocTabId("project-1", "reports/result.html");

    expect(layoutTabIdsForClosedBrowser("browser-123", sourceTabId)).toEqual([
      makeBrowserTabId("browser-123"),
      sourceTabId,
    ]);
    expect(layoutTabIdsForClosedBrowser("browser-123", "session-agent")).toEqual([
      makeBrowserTabId("browser-123"),
    ]);
  });

  it("drops live browser ids when a persisted layout is restored", () => {
    const layout: LayoutNode = {
      type: "leaf",
      id: "l1",
      tabs: ["agent-1", makeBrowserTabId("browser-123")],
      activeIndex: 1,
    };
    expect(validateLayout(layout, new Set(["agent-1"]))).toEqual({
      type: "leaf",
      id: "l1",
      tabs: ["agent-1"],
      activeIndex: 0,
    });
  });
});

describe("docKindForPath", () => {
  it("classifies by extension", () => {
    expect(docKindForPath("a/b/readme.md")).toBe("markdown");
    expect(docKindForPath("plan.markdown")).toBe("markdown");
    expect(docKindForPath("report.html")).toBe("html");
    expect(docKindForPath("page.HTM")).toBe("html");
    expect(docKindForPath("shot.png")).toBe("image");
    expect(docKindForPath("icon.SVG")).toBe("image");
    expect(docKindForPath("main.ts")).toBe("text");
    expect(docKindForPath("Makefile")).toBe("text");
  });
});

describe("stripDocTabs", () => {
  const doc = (p: string) => makeDocTabId("proj", p);

  it("returns the same node when no doc tabs present", () => {
    const leaf = makeLeaf("a");
    expect(stripDocTabs(leaf)).toBe(leaf);
  });

  it("removes doc tabs from a leaf and keeps the active agent tab", () => {
    const leaf: LayoutNode = {
      type: "leaf",
      id: "l1",
      tabs: [doc("x.md"), "a", doc("y.md")],
      activeIndex: 1,
    };
    const next = stripDocTabs(leaf);
    expect(next).toEqual({ type: "leaf", id: "l1", tabs: ["a"], activeIndex: 0 });
  });

  it("collapses a doc-only leaf to null", () => {
    const leaf: LayoutNode = {
      type: "leaf",
      id: "l1",
      tabs: [doc("x.md")],
      activeIndex: 0,
    };
    expect(stripDocTabs(leaf)).toBeNull();
  });

  it("collapses splits whose children become empty and renormalizes sizes", () => {
    const split: LayoutNode = {
      type: "split",
      id: "s1",
      direction: "h",
      children: [
        { type: "leaf", id: "l1", tabs: [doc("x.md")], activeIndex: 0 },
        { type: "leaf", id: "l2", tabs: ["a"], activeIndex: 0 },
        { type: "leaf", id: "l3", tabs: ["b", doc("y.md")], activeIndex: 1 },
      ],
      sizes: [0.2, 0.3, 0.5],
    };
    const next = stripDocTabs(split);
    expect(next?.type).toBe("split");
    if (next?.type === "split") {
      expect(next.children.length).toBe(2);
      expect(next.sizes[0] + next.sizes[1]).toBeCloseTo(1);
      const l3 = next.children[1];
      if (l3.type === "leaf") {
        expect(l3.tabs).toEqual(["b"]);
        expect(l3.activeIndex).toBe(0);
      }
    }
  });

  it("returns the single surviving child instead of a one-child split", () => {
    const split: LayoutNode = {
      type: "split",
      id: "s1",
      direction: "v",
      children: [
        { type: "leaf", id: "l1", tabs: [doc("x.md")], activeIndex: 0 },
        { type: "leaf", id: "l2", tabs: ["a"], activeIndex: 0 },
      ],
      sizes: [0.5, 0.5],
    };
    const next = stripDocTabs(split);
    expect(next?.type).toBe("leaf");
  });
});
