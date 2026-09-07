import { describe, expect, it } from "vitest";
import type { Group, LayoutNode } from "../types";
import { collectAgentIds, makeLeaf } from "./layout";
import { loadStoredAgents, normalizeStoredGroups } from "./persistence";

function split(agentIds: string[]): LayoutNode {
  return {
    type: "split",
    id: `split-${agentIds.join("-")}`,
    direction: "h",
    children: agentIds.map((agentId) => makeLeaf(agentId)),
    sizes: agentIds.map(() => 1 / agentIds.length),
  };
}

describe("normalizeStoredGroups", () => {
  it("keeps the Screen and removes stale solo duplicates", () => {
    const raw: Group[] = [
      { id: "solo-a", projectId: "project-a", layout: makeLeaf("a") },
      { id: "screen-ab", projectId: "project-a", layout: split(["a", "b"]) },
      { id: "solo-b", projectId: "project-b", layout: makeLeaf("b") },
      { id: "solo-c", projectId: "project-c", layout: makeLeaf("c") },
    ];

    const normalized = normalizeStoredGroups(
      raw,
      new Set(["a", "b", "c"]),
      new Map([
        ["a", "project-a"],
        ["b", "project-b"],
        ["c", "project-c"],
      ])
    );

    const screen = normalized.find((group) => group.id === "screen-ab");
    expect([...collectAgentIds(screen?.layout ?? null)].sort()).toEqual(["a", "b"]);
    expect(normalized.some((group) => group.id === "solo-a")).toBe(false);
    expect(normalized.some((group) => group.id === "solo-b")).toBe(false);
    expect(normalized.some((group) => group.id === "solo-c")).toBe(true);

    for (const agentId of ["a", "b", "c"]) {
      expect(
        normalized.filter((group) => collectAgentIds(group.layout).has(agentId))
      ).toHaveLength(1);
    }
  });

  it("uses the preferred Screen when duplicate split groups compete", () => {
    const normalized = normalizeStoredGroups(
      [
        { id: "screen-old", layout: split(["a", "b"]) },
        { id: "screen-active", layout: split(["a", "c"]) },
      ],
      new Set(["a", "b", "c"]),
      new Map(),
      "screen-active"
    );

    const active = normalized.find((group) => group.id === "screen-active");
    expect([...collectAgentIds(active?.layout ?? null)].sort()).toEqual(["a", "c"]);
    expect(
      normalized.filter((group) => collectAgentIds(group.layout).has("a"))
    ).toHaveLength(1);
  });

  it("keeps doc tabs alongside agent siblings across restarts", () => {
    const DOC = "doc:project-a:docs/README.md";
    const raw: Group[] = [
      {
        id: "screen-a",
        projectId: "project-a",
        layout: {
          type: "leaf",
          id: "leaf-a",
          tabs: ["a", DOC],
          activeIndex: 1,
        },
      },
    ];

    const normalized = normalizeStoredGroups(
      raw,
      new Set(["a"]),
      new Map([["a", "project-a"]])
    );

    const screen = normalized.find((group) => group.id === "screen-a");
    expect(screen).toBeTruthy();
    expect(collectAgentIds(screen?.layout ?? null).has(DOC)).toBe(true);
    // no solo group is fabricated for the doc id
    expect(normalized).toHaveLength(1);
  });

  it("dedupes a doc tab present in two stored groups", () => {
    const DOC = "doc:project-a:docs/README.md";
    const raw: Group[] = [
      {
        id: "screen-ab",
        layout: {
          type: "split",
          id: "split-1",
          direction: "h",
          children: [
            { type: "leaf", id: "l1", tabs: ["a", DOC], activeIndex: 0 },
            { type: "leaf", id: "l2", tabs: ["b"], activeIndex: 0 },
          ],
          sizes: [0.5, 0.5],
        },
      },
      {
        id: "solo-doc",
        layout: { type: "leaf", id: "l3", tabs: ["c", DOC], activeIndex: 0 },
      },
    ];

    const normalized = normalizeStoredGroups(
      raw,
      new Set(["a", "b", "c"]),
      new Map()
    );

    expect(
      normalized.filter((group) => collectAgentIds(group.layout).has(DOC))
    ).toHaveLength(1);
    // Screen (split) wins ownership over the leaf group
    const owner = normalized.find((group) =>
      collectAgentIds(group.layout).has(DOC)
    );
    expect(owner?.id).toBe("screen-ab");
  });

  it("drops a stored group that only contains doc tabs pointing nowhere", () => {
    const DOC = "doc:project-gone:old.md";
    const raw: Group[] = [
      {
        id: "doc-only",
        layout: { type: "leaf", id: "l1", tabs: [DOC], activeIndex: 0 },
      },
      { id: "solo-a", layout: makeLeaf("a") },
    ];

    const normalized = normalizeStoredGroups(raw, new Set(["a"]), new Map());
    // doc-only group survives validateLayout (doc ids are kept) — acceptable,
    // but it must not steal active agents or duplicate them
    expect(
      normalized.filter((group) => collectAgentIds(group.layout).has("a"))
    ).toHaveLength(1);
  });
});


describe("Codex account persistence", () => {
  it("restores account binding and per-account conversations on cold start", () => {
    const restored = loadStoredAgents([{ id: "a", projectId: "p", name: "A", folder: "project", aiToolId: "codex", createdAt: 0,
      codexAccountId: "work", codexAccountSessions: { default: "old", work: "new" }, lastSessionId: "new" }],
      [{ id: "p", name: "P", folder: "project", createdAt: 0 }]);
    expect(restored[0]).toMatchObject({ codexAccountId: "work", codexAccountSessions: { default: "old", work: "new" }, lastSessionId: "new" });
  });
});
