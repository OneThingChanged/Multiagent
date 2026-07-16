import { describe, it, expect } from "vitest";
import type { Group, LayoutNode, Path } from "../types";
import {
  collectAgentIds,
  findLeafPath,
  getAt,
  makeLeaf,
} from "./layout";
import * as ops from "./groupOps";

function leafState(agentIds: string[]): ops.GroupState {
  const groups: Group[] = agentIds.map((id) => ({
    id: `g-${id}`,
    layout: makeLeaf(id),
  }));
  return {
    groups,
    activeGroupId: groups[0]?.id ?? null,
    activePath: groups.length > 0 ? [] : null,
  };
}

function leafAt(state: ops.GroupState, groupId: string, path: Path): LayoutNode | null {
  const g = state.groups.find((g) => g.id === groupId);
  return g ? getAt(g.layout, path) : null;
}

describe("selectAgent", () => {
  it("activates an existing agent's group + path", () => {
    const s = leafState(["a", "b", "c"]);
    const next = ops.selectAgent(s, "b");
    expect(next.activeGroupId).toBe("g-b");
    expect(next.activePath).toEqual([]);
  });

  it("creates a new solo group for an unknown agent", () => {
    const s = leafState(["a"]);
    const next = ops.selectAgent(s, "z");
    expect(next.groups.length).toBe(2);
    expect(collectAgentIds(next.groups[1].layout).has("z")).toBe(true);
    expect(next.activeGroupId).toBe(next.groups[1].id);
  });

  it("keeps project id when it creates a missing agent group", () => {
    const s = leafState(["a"]);
    const next = ops.selectAgent(s, "z", "project-1");
    expect(next.groups[1].projectId).toBe("project-1");
  });
});

describe("selectGroup", () => {
  it("opens the requested Screen even when a stale solo group contains the same agent", () => {
    const solo = { id: "solo-a", layout: makeLeaf("a") };
    const split = ops.splitWith(
      {
        groups: [
          { id: "screen-ab", layout: makeLeaf("a") },
          { id: "solo-b", layout: makeLeaf("b") },
        ],
        activeGroupId: "screen-ab",
        activePath: [],
      },
      "b",
      "h"
    ).groups.find((group) => group.id === "screen-ab")!;
    const state: ops.GroupState = {
      groups: [solo, split],
      activeGroupId: "solo-a",
      activePath: [],
    };

    const next = ops.selectGroup(state, "screen-ab", "a");
    expect(next.activeGroupId).toBe("screen-ab");
    expect(next.activePath).toEqual([0]);
  });
});

describe("openAsTab", () => {
  it("falls back to selectAgent when no active group", () => {
    const s: ops.GroupState = { groups: [], activeGroupId: null, activePath: null };
    const next = ops.openAsTab(s, "x", "project-1");
    expect(next.groups.length).toBe(1);
    expect(next.groups[0].projectId).toBe("project-1");
    expect(collectAgentIds(next.groups[0].layout).has("x")).toBe(true);
  });

  it("just refocuses when target is already in the active leaf", () => {
    const s = leafState(["a", "b"]);
    let next = ops.openAsTab(s, "b");
    // b moves to the active leaf (g-a) as a tab
    expect(next.activeGroupId).toBe("g-a");
    const active = leafAt(next, "g-a", []);
    expect(active?.type).toBe("leaf");
    if (active?.type === "leaf") {
      expect(active.tabs).toContain("a");
      expect(active.tabs).toContain("b");
    }
    // 2nd call should be a no-op for tabs
    next = ops.openAsTab(next, "b");
    const active2 = leafAt(next, "g-a", []);
    if (active2?.type === "leaf") {
      expect(active2.tabs.length).toBe(2);
    }
  });

  it("moves an agent from another group into the active leaf as a tab", () => {
    const s = leafState(["a", "b"]);
    const next = ops.openAsTab(s, "b");
    // b's original solo group should be gone (became empty)
    expect(next.groups.some((g) => g.id === "g-b")).toBe(false);
    const active = leafAt(next, "g-a", []);
    if (active?.type === "leaf") expect(active.tabs).toEqual(["a", "b"]);
  });

  it("does not add an outside agent into a session-locked active group", () => {
    const s = leafState(["a", "b"]);
    s.groups[0] = {
      ...s.groups[0],
      sessionLocked: true,
      sessionPins: { a: "session-a" },
    };

    const next = ops.openAsTab(s, "b");
    expect(next).toBe(s);
  });

  it("does not move an agent out of another session-locked group", () => {
    const s = leafState(["a", "b"]);
    s.groups[1] = {
      ...s.groups[1],
      sessionLocked: true,
      sessionPins: { b: "session-b" },
    };

    const next = ops.openAsTab(s, "b");
    expect(next).toBe(s);
  });
});

describe("splitWith", () => {
  it("h-splits the active leaf with the new agent on the right", () => {
    const s = leafState(["a", "b"]);
    const next = ops.splitWith(s, "b", "h");
    const root = leafAt(next, "g-a", []);
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(root.direction).toBe("h");
      expect(root.children.length).toBe(2);
      // newPath points at the new (right) child
      expect(next.activePath).toEqual([1]);
    }
  });

  it("v-splits the active leaf with the new agent below", () => {
    const s = leafState(["a", "b"]);
    const next = ops.splitWith(s, "b", "v");
    const root = leafAt(next, "g-a", []);
    if (root?.type === "split") expect(root.direction).toBe("v");
  });

  it("just refocuses when the agent is already in the active group", () => {
    const s = leafState(["a"]);
    const splitOnce = ops.splitWith(s, "b", "h");
    // now g-a has 'a' on left, 'b' on right
    const splitAgain = ops.splitWith(splitOnce, "a", "h");
    // 'a' already in active group — should NOT add another split
    const root = leafAt(splitAgain, "g-a", []);
    if (root?.type === "split") {
      expect(root.children.length).toBe(2);
    }
  });

  it("adds a third pane without detaching the previous split partner", () => {
    let s = leafState(["a", "b", "c"]);
    s = ops.splitWith(s, "b", "h");
    s = ops.selectAgent(s, "a");

    const next = ops.splitWith(s, "c", "v");
    const screen = next.groups.find((group) =>
      collectAgentIds(group.layout).has("a")
    );

    expect(screen).toBeTruthy();
    expect(screen?.id).toBe("g-a");
    expect([...collectAgentIds(screen?.layout ?? null)].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(next.groups.filter((group) =>
      collectAgentIds(group.layout).has("b")
    )).toHaveLength(1);
    expect(next.activeGroupId).toBe(screen?.id);
    expect(next.activePath).toEqual([0, 1]);
    expect(screen?.layout.type).toBe("split");
    if (screen?.layout.type === "split") {
      expect(screen.layout.direction).toBe("h");
      expect(screen.layout.children).toHaveLength(2);
      expect(screen.layout.children[0].type).toBe("split");
    }
  });

  it("keeps tabs together when their pane gets a new split partner", () => {
    let s = leafState(["a", "tab", "b", "c"]);
    s = ops.openAsTab(s, "tab");
    s = ops.splitWith(s, "b", "h");
    s = ops.selectAgent(s, "a");

    const next = ops.splitWith(s, "c", "h");
    const screen = next.groups.find((group) =>
      collectAgentIds(group.layout).has("a")
    );

    expect([...collectAgentIds(screen?.layout ?? null)].sort()).toEqual([
      "a",
      "b",
      "c",
      "tab",
    ]);
    expect(screen?.layout.type).toBe("split");
    if (screen?.layout.type === "split") {
      expect(screen.layout.children).toHaveLength(3);
      const tabbedPane = screen.layout.children.find(
        (child) => child.type === "leaf" && child.tabs.includes("a")
      );
      expect(tabbedPane?.type).toBe("leaf");
      if (tabbedPane?.type === "leaf") {
        expect(tabbedPane.tabs).toEqual(["a", "tab"]);
      }
    }
  });
});

describe("closeTab", () => {
  it("removes the leaf entirely when closing the last tab", () => {
    const s = leafState(["a", "b"]);
    const next = ops.closeTab(s, [], "a");
    // g-a is gone; a is now a brand new solo group at end
    expect(next.groups.some((g) => g.id === "g-a")).toBe(false);
    const last = next.groups[next.groups.length - 1];
    expect(collectAgentIds(last.layout).has("a")).toBe(true);
  });

  it("removes one tab and keeps the rest", () => {
    const s = leafState(["a"]);
    const withTab = ops.openAsTab(s, "z"); // makes [a, z] in g-a
    // simulate as if z exists in agents — add to state manually
    withTab.groups = [
      ...withTab.groups,
      { id: "g-z-orphan-removed", layout: makeLeaf("z-other") },
    ];
    const next = ops.closeTab(withTab, [], "z");
    const leaf = leafAt(next, "g-a", []);
    if (leaf?.type === "leaf") {
      expect(leaf.tabs).toEqual(["a"]);
    }
  });

  it("keeps project id on the solo group created from a closed tab", () => {
    const s = leafState(["a"]);
    s.groups[0] = { ...s.groups[0], projectId: "project-1" };
    const withTab = ops.openAsTab(s, "b");
    const next = ops.closeTab(withTab, [], "b");
    const last = next.groups[next.groups.length - 1];
    expect(last.projectId).toBe("project-1");
    expect(collectAgentIds(last.layout).has("b")).toBe(true);
  });

  it("uses the closed agent's project id when it leaves a mixed-project group", () => {
    const s = leafState(["a"]);
    s.groups[0] = { ...s.groups[0], projectId: "project-a" };
    const withTab = ops.openAsTab(s, "b", "project-b");
    const next = ops.closeTab(withTab, [], "b", "project-b");
    const last = next.groups[next.groups.length - 1];
    expect(last.projectId).toBe("project-b");
    expect(collectAgentIds(last.layout).has("b")).toBe(true);
  });

  it("prunes session pins when a tab leaves a locked group", () => {
    const s = leafState(["a"]);
    const withTab = ops.openAsTab(s, "b");
    const group = withTab.groups.find((g) => g.id === "g-a");
    expect(group).toBeTruthy();
    if (!group) return;

    const locked: ops.GroupState = {
      ...withTab,
      groups: [
        {
          ...group,
          sessionLocked: true,
          sessionPins: { a: "session-a", b: "session-b" },
        },
      ],
    };

    const next = ops.closeTab(locked, [], "b");
    const remaining = next.groups.find((g) => g.id === "g-a");
    expect(remaining?.sessionLocked).toBe(true);
    expect(remaining?.sessionPins).toEqual({ a: "session-a" });
  });

  it("reopens a detached tab at its original index without restarting it", () => {
    const initial = ops.openAsTab(leafState(["a", "b"]), "b");
    const closed = ops.closeTabWithHistory(initial, [], "a");

    expect(closed.closed).toBeTruthy();
    const reopened = ops.reopenClosedTab(closed.state, closed.closed!);
    expect(reopened.restored).toBe(true);
    expect(reopened.state.activeGroupId).toBe("g-a");
    expect(reopened.state.activePath).toEqual([]);
    const leaf = leafAt(reopened.state, "g-a", []);
    expect(leaf?.type).toBe("leaf");
    if (leaf?.type === "leaf") {
      expect(leaf.tabs).toEqual(["a", "b"]);
      expect(leaf.activeIndex).toBe(0);
    }
    expect(reopened.state.groups.filter((group) =>
      collectAgentIds(group.layout).has("a")
    )).toHaveLength(1);
  });

  it("restores a collapsed split with its original sizes and path", () => {
    let initial = leafState(["a", "b"]);
    initial = ops.splitWith(initial, "b", "h");
    const screen = initial.groups.find((group) => group.id === "g-a")!;
    if (screen.layout.type !== "split") throw new Error("expected split");
    screen.layout.sizes = [0.35, 0.65];

    const closed = ops.closeTabWithHistory(initial, [1], "b");
    expect(closed.state.groups.find((group) => group.id === "g-a")?.layout.type)
      .toBe("leaf");

    const reopened = ops.reopenClosedTab(closed.state, closed.closed!);
    const restored = reopened.state.groups.find((group) => group.id === "g-a");
    expect(restored?.layout.type).toBe("split");
    if (restored?.layout.type === "split") {
      expect(restored.layout.sizes).toEqual([0.35, 0.65]);
      expect(findLeafPath(restored.layout, "b")).toEqual([1]);
    }
    expect(reopened.state.activePath).toEqual([1]);
  });

  it("reopens consecutive closes in last-closed-first order", () => {
    const initial = ops.openAsTab(leafState(["a", "b"]), "b");
    const first = ops.closeTabWithHistory(initial, [], "a");
    const second = ops.closeTabWithHistory(first.state, [], "b");

    const reopenSecond = ops.reopenClosedTab(second.state, second.closed!);
    const reopenFirst = ops.reopenClosedTab(reopenSecond.state, first.closed!);
    const leaf = leafAt(reopenFirst.state, "g-a", []);
    expect(leaf?.type).toBe("leaf");
    if (leaf?.type === "leaf") expect(leaf.tabs).toEqual(["a", "b"]);
  });

  it("falls back to the surviving pane when the original leaf changed", () => {
    let initial = leafState(["a", "b", "c"]);
    initial = ops.splitWith(initial, "b", "h");
    const closed = ops.closeTabWithHistory(initial, [1], "b");
    const changed = ops.openAsTab(
      { ...closed.state, activeGroupId: "g-a", activePath: [] },
      "c"
    );

    const reopened = ops.reopenClosedTab(changed, closed.closed!);
    expect(reopened.restored).toBe(true);
    const target = reopened.state.groups.find((group) => group.id === "g-a");
    expect(target).toBeTruthy();
    expect(collectAgentIds(target?.layout ?? null)).toEqual(
      new Set(["a", "b", "c"])
    );
  });
});

describe("setActiveTabInPane", () => {
  it("sets the leaf's activeIndex", () => {
    const s = leafState(["a"]);
    const merged = ops.openAsTab(s, "b"); // g-a has [a, b]
    const next = ops.setActiveTabInPane(merged, [], "a");
    const leaf = leafAt(next, "g-a", []);
    if (leaf?.type === "leaf") expect(leaf.activeIndex).toBe(0);
  });
});

describe("resizeAt", () => {
  it("normalizes sizes after a resize", () => {
    const s = leafState(["a"]);
    const split = ops.splitWith(s, "b", "h");
    const next = ops.resizeAt(split, [], [0.3, 0.7]);
    const root = leafAt(next, "g-a", []);
    if (root?.type === "split") {
      const sum = root.sizes.reduce((x, y) => x + y, 0);
      expect(sum).toBeCloseTo(1);
      expect(root.sizes[0]).toBeCloseTo(0.3);
    }
  });
});

describe("removeAgentFromLayout", () => {
  it("removes the agent and deletes the group if it was solo", () => {
    const s = leafState(["a", "b"]);
    const next = ops.removeAgentFromLayout(s, "a");
    expect(next.groups.some((g) => g.id === "g-a")).toBe(false);
    expect(next.activeGroupId).toBeNull();
  });

  it("keeps siblings when removing one tab of a multi-tab leaf", () => {
    const s = leafState(["a"]);
    const merged = ops.openAsTab(s, "b"); // g-a has [a, b]
    const next = ops.removeAgentFromLayout(merged, "b");
    const leaf = leafAt(next, "g-a", []);
    if (leaf?.type === "leaf") expect(leaf.tabs).toEqual(["a"]);
  });
});

describe("performDrop", () => {
  function setup() {
    // g-a holds [a], g-b holds [b]
    return leafState(["a", "b"]);
  }

  it("center: merges source into target leaf as a tab", () => {
    const s = setup();
    const targetLeafId = (leafAt(s, "g-a", []) as { id: string }).id;
    const next = ops.performDrop(s, "b", targetLeafId, "center");
    const leaf = leafAt(next, "g-a", []);
    if (leaf?.type === "leaf") expect(leaf.tabs).toEqual(["a", "b"]);
    expect(next.groups.some((g) => g.id === "g-b")).toBe(false);
  });

  it("left edge: h-split with new leaf on the left", () => {
    const s = setup();
    const targetLeafId = (leafAt(s, "g-a", []) as { id: string }).id;
    const next = ops.performDrop(s, "b", targetLeafId, "left");
    const root = leafAt(next, "g-a", []);
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(root.direction).toBe("h");
      // new leaf (b) is at index 0
      const firstLeafPath = findLeafPath(root, "b");
      expect(firstLeafPath).toEqual([0]);
    }
  });

  it("bottom edge: v-split with new leaf below", () => {
    const s = setup();
    const targetLeafId = (leafAt(s, "g-a", []) as { id: string }).id;
    const next = ops.performDrop(s, "b", targetLeafId, "bottom");
    const root = leafAt(next, "g-a", []);
    if (root?.type === "split") {
      expect(root.direction).toBe("v");
      const newPath = findLeafPath(root, "b");
      expect(newPath).toEqual([1]);
    }
  });

  it("can split an agent from another project into the active group", () => {
    const s = setup();
    s.groups[0] = { ...s.groups[0], projectId: "project-a" };
    s.groups[1] = { ...s.groups[1], projectId: "project-b" };
    const targetLeafId = (leafAt(s, "g-a", []) as { id: string }).id;
    const next = ops.performDrop(s, "b", targetLeafId, "right");

    expect(next.activeGroupId).toBe("g-a");
    expect(next.groups.some((g) => g.id === "g-b")).toBe(false);
    const root = leafAt(next, "g-a", []);
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(findLeafPath(root, "a")).toEqual([0]);
      expect(findLeafPath(root, "b")).toEqual([1]);
    }
  });

  it("same-leaf single-tab drop is a no-op", () => {
    const s = leafState(["a"]);
    const targetLeafId = (leafAt(s, "g-a", []) as { id: string }).id;
    const next = ops.performDrop(s, "a", targetLeafId, "left");
    expect(next).toBe(s);
  });

  it("adds a third pane on an edge drop", () => {
    let s = leafState(["a", "b", "c"]);
    s = ops.splitWith(s, "b", "h");
    s = ops.selectAgent(s, "a");
    const activeGroup = s.groups.find((group) => group.id === s.activeGroupId);
    const targetPath = activeGroup
      ? findLeafPath(activeGroup.layout, "a")
      : null;
    const target =
      activeGroup && targetPath
        ? getAt(activeGroup.layout, targetPath)
        : null;
    expect(target?.type).toBe("leaf");
    if (!target || target.type !== "leaf") return;

    const next = ops.performDrop(s, "c", target.id, "right");
    const screen = next.groups.find((group) =>
      collectAgentIds(group.layout).has("a")
    );

    expect([...collectAgentIds(screen?.layout ?? null)].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(next.groups.filter((group) =>
      collectAgentIds(group.layout).has("b")
    )).toHaveLength(1);
    expect(screen?.id).toBe("g-a");
    expect(next.activeGroupId).toBe(screen?.id);
    expect(screen?.layout.type).toBe("split");
    if (screen?.layout.type === "split") {
      expect(screen.layout.direction).toBe("h");
      expect(screen.layout.children).toHaveLength(3);
      expect(findLeafPath(screen.layout, "a")).toEqual([0]);
      expect(findLeafPath(screen.layout, "c")).toEqual([1]);
      expect(findLeafPath(screen.layout, "b")).toEqual([2]);
    }
  });
});
