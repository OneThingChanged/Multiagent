import { describe, expect, it } from "vitest";
import type { Group, LayoutNode } from "../types";
import { collectAgentIds, makeLeaf } from "./layout";
import { normalizeStoredGroups } from "./persistence";

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
});
