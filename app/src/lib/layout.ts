import type { LayoutNode, LeafNode, Path, SplitNode, Group } from "../types";

export function makeLeaf(agentId: string): LeafNode {
  return {
    type: "leaf",
    id: crypto.randomUUID(),
    tabs: [agentId],
    activeIndex: 0,
  };
}

export function activeAgentInLeaf(leaf: LeafNode): string | null {
  return leaf.tabs[leaf.activeIndex] ?? null;
}

export function pathEq(a: Path | null, b: Path | null): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function getAt(node: LayoutNode | null, path: Path): LayoutNode | null {
  let cur: LayoutNode | null = node;
  for (const i of path) {
    if (!cur || cur.type !== "split") return null;
    cur = cur.children[i] ?? null;
  }
  return cur;
}

export function normalizeSizes(sizes: number[]): number[] {
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum <= 0) return sizes.map(() => 1 / Math.max(sizes.length, 1));
  return sizes.map((s) => s / sum);
}

export function setAt(
  node: LayoutNode | null,
  path: Path,
  next: LayoutNode | null
): LayoutNode | null {
  if (path.length === 0) return next;
  if (!node || node.type !== "split") return node;
  const i = path[0];

  if (path.length === 1) {
    if (next === null) {
      const newChildren = node.children.filter((_, j) => j !== i);
      const newSizes = node.sizes.filter((_, j) => j !== i);
      if (newChildren.length === 0) return null;
      if (newChildren.length === 1) return newChildren[0];
      return { ...node, children: newChildren, sizes: normalizeSizes(newSizes) };
    } else {
      const newChildren = [...node.children];
      newChildren[i] = next;
      return { ...node, children: newChildren };
    }
  }

  const child = node.children[i];
  if (!child) return node;
  const replaced = setAt(child, path.slice(1), next);
  if (replaced === null) {
    const newChildren = node.children.filter((_, j) => j !== i);
    const newSizes = node.sizes.filter((_, j) => j !== i);
    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0];
    return { ...node, children: newChildren, sizes: normalizeSizes(newSizes) };
  }
  const newChildren = [...node.children];
  newChildren[i] = replaced;
  return { ...node, children: newChildren };
}

export function findLeafPath(
  node: LayoutNode | null,
  agentId: string,
  base: Path = []
): Path | null {
  if (!node) return null;
  if (node.type === "leaf")
    return node.tabs.includes(agentId) ? base : null;
  for (let i = 0; i < node.children.length; i++) {
    const p = findLeafPath(node.children[i], agentId, [...base, i]);
    if (p) return p;
  }
  return null;
}

export function findLeafPathById(
  node: LayoutNode | null,
  leafId: string,
  base: Path = []
): Path | null {
  if (!node) return null;
  if (node.type === "leaf") return node.id === leafId ? base : null;
  for (let i = 0; i < node.children.length; i++) {
    const p = findLeafPathById(node.children[i], leafId, [...base, i]);
    if (p) return p;
  }
  return null;
}

export function firstLeafPath(
  node: LayoutNode | null,
  base: Path = []
): Path | null {
  if (!node) return null;
  if (node.type === "leaf") return base;
  return firstLeafPath(node.children[0], [...base, 0]);
}

export function pruneAgent(
  node: LayoutNode | null,
  agentId: string
): LayoutNode | null {
  if (!node) return null;
  if (node.type === "leaf") {
    if (!node.tabs.includes(agentId)) return node;
    const idx = node.tabs.indexOf(agentId);
    const newTabs = node.tabs.filter((t) => t !== agentId);
    if (newTabs.length === 0) return null;
    let newActive = node.activeIndex;
    if (idx < newActive) newActive -= 1;
    if (newActive >= newTabs.length) newActive = newTabs.length - 1;
    if (newActive < 0) newActive = 0;
    return { ...node, tabs: newTabs, activeIndex: newActive };
  }
  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const c = pruneAgent(node.children[i], agentId);
    if (c) {
      newChildren.push(c);
      newSizes.push(node.sizes[i]);
    }
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return { ...node, children: newChildren, sizes: normalizeSizes(newSizes) };
}

export function collectAgentIds(
  node: LayoutNode | null,
  out: Set<string> = new Set()
): Set<string> {
  if (!node) return out;
  if (node.type === "leaf") {
    for (const t of node.tabs) out.add(t);
    return out;
  }
  for (const c of node.children) collectAgentIds(c, out);
  return out;
}

export function collectAgentIdsInOrder(
  node: LayoutNode | null,
  out: string[] = []
): string[] {
  if (!node) return out;
  if (node.type === "leaf") {
    for (const t of node.tabs) out.push(t);
    return out;
  }
  for (const c of node.children) collectAgentIdsInOrder(c, out);
  return out;
}

export function validateLayout(
  node: any,
  validIds: Set<string>,
  seen: Set<string> = new Set()
): LayoutNode | null {
  if (!node) return null;
  if (node.type === "leaf") {
    let tabs: string[];
    let activeIndex: number;
    if (Array.isArray(node.tabs)) {
      tabs = node.tabs.filter((t: any) => typeof t === "string");
      activeIndex =
        typeof node.activeIndex === "number" ? node.activeIndex : 0;
    } else if (typeof node.agentId === "string") {
      tabs = [node.agentId];
      activeIndex = 0;
    } else {
      return null;
    }
    const validTabs: string[] = [];
    for (const t of tabs) {
      if (!validIds.has(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      validTabs.push(t);
    }
    if (validTabs.length === 0) return null;
    return {
      type: "leaf",
      id: node.id || crypto.randomUUID(),
      tabs: validTabs,
      activeIndex: Math.max(0, Math.min(activeIndex, validTabs.length - 1)),
    };
  }
  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];
  const childrenRaw = node.children ?? [];
  const sizesRaw = node.sizes ?? [];
  for (let i = 0; i < childrenRaw.length; i++) {
    const c = validateLayout(childrenRaw[i], validIds, seen);
    if (c) {
      newChildren.push(c);
      newSizes.push(sizesRaw[i] ?? 1 / childrenRaw.length);
    }
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return {
    type: "split",
    id: node.id || crypto.randomUUID(),
    direction: node.direction === "v" ? "v" : "h",
    children: newChildren,
    sizes: normalizeSizes(newSizes),
  };
}

export function splitLeafAt(
  layout: LayoutNode | null,
  path: Path,
  direction: "h" | "v",
  newAgentId: string
): { layout: LayoutNode | null; newPath: Path } {
  const target = getAt(layout, path);
  if (!target || target.type !== "leaf") {
    return { layout, newPath: path };
  }
  const newSplit: SplitNode = {
    type: "split",
    id: crypto.randomUUID(),
    direction,
    children: [target, makeLeaf(newAgentId)],
    sizes: [0.5, 0.5],
  };
  return { layout: setAt(layout, path, newSplit), newPath: [...path, 1] };
}

export function addTabToLeafAt(
  layout: LayoutNode | null,
  path: Path,
  agentId: string
): LayoutNode | null {
  const leaf = getAt(layout, path);
  if (!leaf || leaf.type !== "leaf") return layout;
  if (leaf.tabs.includes(agentId)) {
    const idx = leaf.tabs.indexOf(agentId);
    return setAt(layout, path, { ...leaf, activeIndex: idx });
  }
  const newTabs = [...leaf.tabs, agentId];
  return setAt(layout, path, {
    ...leaf,
    tabs: newTabs,
    activeIndex: newTabs.length - 1,
  });
}

export function setLeafActiveTab(
  layout: LayoutNode | null,
  path: Path,
  agentId: string
): LayoutNode | null {
  const leaf = getAt(layout, path);
  if (!leaf || leaf.type !== "leaf") return layout;
  const idx = leaf.tabs.indexOf(agentId);
  if (idx < 0) return layout;
  if (idx === leaf.activeIndex) return layout;
  return setAt(layout, path, { ...leaf, activeIndex: idx });
}

export function setSizesAt(
  layout: LayoutNode | null,
  path: Path,
  sizes: number[]
): LayoutNode | null {
  const node = getAt(layout, path);
  if (!node || node.type !== "split") return layout;
  const updated: SplitNode = { ...node, sizes: normalizeSizes(sizes) };
  return setAt(layout, path, updated);
}

export function insertNextTo(
  layout: LayoutNode | null,
  targetPath: Path,
  newLeaf: LeafNode,
  direction: "h" | "v",
  before: boolean
): { layout: LayoutNode | null; newPath: Path } {
  if (!layout) {
    return { layout: newLeaf, newPath: [] };
  }
  if (targetPath.length === 0) {
    if (layout.type === "split" && layout.direction === direction) {
      const insertIdx = before ? 0 : layout.children.length;
      const newChildren = [
        ...layout.children.slice(0, insertIdx),
        newLeaf,
        ...layout.children.slice(insertIdx),
      ];
      const share = 1 / newChildren.length;
      const newSizes = newChildren.map(() => share);
      return {
        layout: { ...layout, children: newChildren, sizes: newSizes },
        newPath: [insertIdx],
      };
    }
    const wrapped: SplitNode = {
      type: "split",
      id: crypto.randomUUID(),
      direction,
      children: before ? [newLeaf, layout] : [layout, newLeaf],
      sizes: [0.5, 0.5],
    };
    return { layout: wrapped, newPath: before ? [0] : [1] };
  }
  const parentPath = targetPath.slice(0, -1);
  const targetIdx = targetPath[targetPath.length - 1];
  const parent = getAt(layout, parentPath);
  if (parent && parent.type === "split" && parent.direction === direction) {
    const insertIdx = before ? targetIdx : targetIdx + 1;
    const targetSize = parent.sizes[targetIdx];
    const half = targetSize / 2;
    const newChildren = [
      ...parent.children.slice(0, insertIdx),
      newLeaf,
      ...parent.children.slice(insertIdx),
    ];
    const newSizes = [...parent.sizes];
    newSizes[targetIdx] = half;
    newSizes.splice(insertIdx, 0, half);
    const newParent: SplitNode = {
      ...parent,
      children: newChildren,
      sizes: normalizeSizes(newSizes),
    };
    return {
      layout: setAt(layout, parentPath, newParent),
      newPath: [...parentPath, insertIdx],
    };
  }
  const target = getAt(layout, targetPath);
  if (!target) return { layout, newPath: targetPath };
  const newSplit: SplitNode = {
    type: "split",
    id: crypto.randomUUID(),
    direction,
    children: before ? [newLeaf, target] : [target, newLeaf],
    sizes: [0.5, 0.5],
  };
  return {
    layout: setAt(layout, targetPath, newSplit),
    newPath: [...targetPath, before ? 0 : 1],
  };
}

export function groupOf(groups: Group[], agentId: string): Group | null {
  for (const g of groups) {
    if (findLeafPath(g.layout, agentId)) return g;
  }
  return null;
}

export function updateGroup(
  groups: Group[],
  groupId: string,
  newLayout: LayoutNode | null
): Group[] {
  if (newLayout === null) {
    return groups.filter((g) => g.id !== groupId);
  }
  return groups.map((g) =>
    g.id === groupId ? { ...g, layout: newLayout } : g
  );
}
