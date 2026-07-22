// Git History tabs are encoded as prefixed tab ids inside LeafNode.tabs so the
// whole layout/group algebra (pruneAgent, addTabToLeafAt, performDrop, …) keeps
// operating on opaque strings without a schema migration — the same trick doc
// tabs use.
// Format: `githist:<projectId>` for whole-repo history, or
// `githist:<projectId>:<relativePath>` for a path-scoped history. projectId is
// a UUID (no colons), so parsing splits at the first ":" after the prefix.

export const GIT_HISTORY_TAB_PREFIX = "githist:";

export type GitHistoryTabRef = {
  projectId: string;
  // null → whole-repo history; otherwise a file/folder path (forward slashes).
  path: string | null;
};

export function isGitHistoryTabId(id: string): boolean {
  return id.startsWith(GIT_HISTORY_TAB_PREFIX);
}

export function makeGitHistoryTabId(
  projectId: string,
  relativePath?: string | null
): string {
  const rel = (relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  return rel
    ? `${GIT_HISTORY_TAB_PREFIX}${projectId}:${rel}`
    : `${GIT_HISTORY_TAB_PREFIX}${projectId}`;
}

export function parseGitHistoryTabId(id: string): GitHistoryTabRef | null {
  if (!isGitHistoryTabId(id)) return null;
  const payload = id.slice(GIT_HISTORY_TAB_PREFIX.length);
  if (!payload) return null;
  const sep = payload.indexOf(":");
  if (sep < 0) return { projectId: payload, path: null };
  const projectId = payload.slice(0, sep);
  const rest = payload.slice(sep + 1);
  if (!projectId) return null;
  return { projectId, path: rest || null };
}

// Short label for the tab chip.
export function gitHistoryTabTitle(id: string): string {
  const ref = parseGitHistoryTabId(id);
  if (!ref || !ref.path) return "History";
  const segments = ref.path.split("/").filter(Boolean);
  return `History: ${segments[segments.length - 1] || ref.path}`;
}
