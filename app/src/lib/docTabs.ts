import type { LayoutNode } from "../types";

// Doc tabs are encoded as prefixed tab ids inside LeafNode.tabs so the whole
// layout/group algebra (pruneAgent, addTabToLeafAt, performDrop, ...) keeps
// operating on opaque strings without a schema migration.
// Format: `doc:<projectId>:<relativePath>` — projectId is a UUID (no colons),
// so parsing splits at the first ":" after the prefix. The relative path may
// itself contain ":" (e.g. absolute Windows fallback payloads) and stays intact.
export const DOC_TAB_PREFIX = "doc:";

export type DocTabRef = {
  projectId: string;
  relativePath: string;
};

export type DocKind = "markdown" | "html" | "image" | "text";

export function isDocTabId(id: string): boolean {
  return id.startsWith(DOC_TAB_PREFIX);
}

export function makeDocTabId(projectId: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${DOC_TAB_PREFIX}${projectId}:${normalized}`;
}

export function parseDocTabId(id: string): DocTabRef | null {
  if (!isDocTabId(id)) return null;
  const payload = id.slice(DOC_TAB_PREFIX.length);
  const sep = payload.indexOf(":");
  if (sep <= 0) return null;
  const projectId = payload.slice(0, sep);
  const relativePath = payload.slice(sep + 1);
  if (!relativePath) return null;
  return { projectId, relativePath };
}

export function docTabBasename(id: string): string {
  const ref = parseDocTabId(id);
  if (!ref) return id;
  const segments = ref.relativePath.split("/");
  return segments[segments.length - 1] || ref.relativePath;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
]);

export function docKindForPath(p: string): DocKind {
  const name = p.replace(/\\/g, "/").split("/").pop() ?? p;
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return "text";
}

export function docFileExtension(id: string): string {
  const name = docTabBasename(id);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// Remove every doc tab from a layout tree. Used before mirroring layouts to
// remote/monitor clients, which only understand agent ids. Standalone walk
// (no ./layout import) so layout.ts can depend on this module without a cycle.
export function stripDocTabs(node: LayoutNode | null): LayoutNode | null {
  if (!node) return null;
  if (node.type === "leaf") {
    if (!node.tabs.some((t) => isDocTabId(t))) return node;
    const activeTab = node.tabs[node.activeIndex] ?? null;
    const newTabs = node.tabs.filter((t) => !isDocTabId(t));
    if (newTabs.length === 0) return null;
    let newActive =
      activeTab !== null ? newTabs.indexOf(activeTab) : node.activeIndex;
    if (newActive < 0) newActive = Math.min(node.activeIndex, newTabs.length - 1);
    if (newActive < 0) newActive = 0;
    return { ...node, tabs: newTabs, activeIndex: newActive };
  }
  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const c = stripDocTabs(node.children[i]);
    if (c) {
      newChildren.push(c);
      newSizes.push(node.sizes[i]);
    }
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  const sum = newSizes.reduce((a, b) => a + b, 0);
  return {
    ...node,
    children: newChildren,
    sizes:
      sum > 0
        ? newSizes.map((s) => s / sum)
        : newSizes.map(() => 1 / newSizes.length),
  };
}
