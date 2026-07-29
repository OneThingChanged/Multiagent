// Git History tabs are encoded as prefixed tab ids inside LeafNode.tabs so the
// whole layout/group algebra (pruneAgent, addTabToLeafAt, performDrop, …) keeps
// operating on opaque strings without a schema migration — the same trick doc
// tabs use.
// Legacy main-repository tabs use `githist:<projectId>[:<relativePath>]`.
// Submodule tabs use an encoded v2 form containing project, repository, and
// repository-relative path. Both remain opaque to the layout/group algebra.

export const GIT_HISTORY_TAB_PREFIX = "githist:";
export const GIT_HISTORY_TAB_V2_PREFIX = "githist2:";

export type GitHistoryTabRef = {
  projectId: string;
  // null → the registered project root; otherwise a submodule path.
  repositoryPath: string | null;
  // null → whole-repo history; otherwise a file/folder path (forward slashes).
  path: string | null;
};

export function isGitHistoryTabId(id: string): boolean {
  return (
    id.startsWith(GIT_HISTORY_TAB_PREFIX) ||
    id.startsWith(GIT_HISTORY_TAB_V2_PREFIX)
  );
}

export function makeGitHistoryTabId(
  projectId: string,
  relativePath?: string | null,
  repositoryPath?: string | null
): string {
  const rel = (relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const repository = (repositoryPath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (repository) {
    return `${GIT_HISTORY_TAB_V2_PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(repository)}:${encodeURIComponent(rel)}`;
  }
  return rel
    ? `${GIT_HISTORY_TAB_PREFIX}${projectId}:${rel}`
    : `${GIT_HISTORY_TAB_PREFIX}${projectId}`;
}

export function parseGitHistoryTabId(id: string): GitHistoryTabRef | null {
  if (id.startsWith(GIT_HISTORY_TAB_V2_PREFIX)) {
    const parts = id.slice(GIT_HISTORY_TAB_V2_PREFIX.length).split(":");
    if (parts.length !== 3) return null;
    try {
      const [projectId, repositoryPath, relativePath] = parts.map((part) =>
        decodeURIComponent(part)
      );
      if (!projectId || !repositoryPath) return null;
      return {
        projectId,
        repositoryPath,
        path: relativePath || null,
      };
    } catch {
      return null;
    }
  }
  if (!isGitHistoryTabId(id)) return null;
  const payload = id.slice(GIT_HISTORY_TAB_PREFIX.length);
  if (!payload) return null;
  const sep = payload.indexOf(":");
  if (sep < 0) {
    return { projectId: payload, repositoryPath: null, path: null };
  }
  const projectId = payload.slice(0, sep);
  const rest = payload.slice(sep + 1);
  if (!projectId) return null;
  return { projectId, repositoryPath: null, path: rest || null };
}

// Short label for the tab chip.
export function gitHistoryTabTitle(id: string): string {
  const ref = parseGitHistoryTabId(id);
  if (!ref) return "History";
  const labelPath = ref.path || ref.repositoryPath;
  if (!labelPath) return "History";
  const segments = labelPath.split("/").filter(Boolean);
  return `History: ${segments[segments.length - 1] || labelPath}`;
}
