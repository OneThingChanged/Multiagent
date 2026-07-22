import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { invoke, listen } from "../platform/runtime";
import type { Project } from "../types";
import type { AppThemeId } from "../lib/appTheme";
import type {
  DirectoryEntry,
  GitChangeEntry,
  GitChangesResult,
  GitFileCommit,
  GitStatusLetter,
  GitStatusResult,
} from "../platform/ipcContract";
import { loadDiffToolCommand } from "../lib/diffTool";

// Orca-style lazy file explorer: one list_directory call per expanded folder,
// cached in dirCache (key "" = project root). Expanded state persists per
// project, the shown project can be pinned, and git status paints M/A/U/D
// badges like an IDE.
type FileTreeEntry = {
  name: string;
  relativePath: string;
  isDir: boolean;
};

type VisibleRow = {
  entry: FileTreeEntry;
  depth: number;
};

type FilterResult = {
  entries: FileTreeEntry[];
  truncated: boolean;
};

type TreeEditing = {
  kind: "rename" | "new-file" | "new-dir";
  parentPath: string;
  targetPath?: string;
  initial: string;
};

type CtxMenuState = {
  x: number;
  y: number;
  entry: FileTreeEntry | null; // null = tree background (project root)
};

const LS_TREE_PIN = "multiagent.fileTreePin.v1";
const LS_TREE_EXPANDED = "multiagent.fileTreeExpanded.v1";
const FILTER_MAX_DIRS = 400;
const FILTER_MAX_RESULTS = 200;
const FILTER_DEBOUNCE_MS = 150;
const EXPAND_ALL_MAX_DIRS = 400;
const GIT_POLL_MS = 10_000;
const GIT_RANK: Record<GitStatusLetter, number> = {
  D: 5,
  M: 4,
  A: 3,
  U: 2,
  R: 1,
};

function toEntry(raw: DirectoryEntry): FileTreeEntry {
  return {
    name: raw.name,
    relativePath: raw.relative_path,
    isDir: raw.is_dir,
  };
}

function fileIconClass(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext === "md" || ext === "markdown") return "file-tree-icon-md";
  if (ext === "html" || ext === "htm") return "file-tree-icon-html";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].includes(ext)) {
    return "file-tree-icon-image";
  }
  return "file-tree-icon-file";
}

function parentPath(relativePath: string) {
  const idx = relativePath.lastIndexOf("/");
  return idx >= 0 ? relativePath.slice(0, idx) : "";
}

function baseName(relativePath: string) {
  const idx = relativePath.lastIndexOf("/");
  return idx >= 0 ? relativePath.slice(idx + 1) : relativePath;
}

function nativeAbsolutePath(folder: string, relativePath: string) {
  const sep = folder.includes("\\") ? "\\" : "/";
  const rel = sep === "\\" ? relativePath.replace(/\//g, "\\") : relativePath;
  return `${folder.replace(/[\\/]+$/, "")}${sep}${rel}`;
}

function loadPinState(): { pinned: boolean; projectId: string | null } {
  try {
    const raw = localStorage.getItem(LS_TREE_PIN);
    if (!raw) return { pinned: false, projectId: null };
    const parsed = JSON.parse(raw) as { pinned?: boolean; projectId?: string };
    return {
      pinned: !!parsed.pinned,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
    };
  } catch {
    return { pinned: false, projectId: null };
  }
}

function savePinState(pinned: boolean, projectId: string | null) {
  try {
    localStorage.setItem(LS_TREE_PIN, JSON.stringify({ pinned, projectId }));
  } catch {}
}

function loadExpandedFor(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(LS_TREE_EXPANDED);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    const list = parsed[projectId];
    return Array.isArray(list)
      ? new Set(list.filter((p) => typeof p === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveExpandedFor(projectId: string, expanded: Set<string>) {
  try {
    const raw = localStorage.getItem(LS_TREE_EXPANDED);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    parsed[projectId] = [...expanded];
    localStorage.setItem(LS_TREE_EXPANDED, JSON.stringify(parsed));
  } catch {}
}

export function FileTreePanel({
  projects,
  activeProject,
  width,
  theme,
  onOpenFile,
  onOpenGitHistory,
  onClose,
}: {
  projects: Project[];
  activeProject: Project | null;
  width: number;
  theme: AppThemeId;
  onOpenFile: (projectId: string, relativePath: string) => void;
  onOpenGitHistory: (projectId: string, relativePath?: string | null) => void;
  onClose: () => void;
}) {
  // ---- Shown project: follows the active project unless pinned ----
  const initialPin = useRef(loadPinState());
  const [pinned, setPinned] = useState(initialPin.current.pinned);
  const [shownProjectId, setShownProjectId] = useState<string | null>(() => {
    const stored = initialPin.current;
    if (stored.pinned && stored.projectId) return stored.projectId;
    return activeProject?.id ?? null;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const shownProject = useMemo(
    () => projects.find((p) => p.id === shownProjectId) ?? null,
    [projects, shownProjectId]
  );
  const folder = shownProject && !shownProject.sshHostId ? shownProject.folder : "";
  const projectId = shownProject?.id ?? null;

  // Follow the active project when unpinned.
  useEffect(() => {
    if (!pinned) setShownProjectId(activeProject?.id ?? null);
  }, [activeProject?.id, pinned]);

  // Shown project disappeared (deleted) → fall back to the active one.
  useEffect(() => {
    if (shownProjectId && !projects.some((p) => p.id === shownProjectId)) {
      setShownProjectId(activeProject?.id ?? null);
      if (pinned) {
        setPinned(false);
        savePinState(false, null);
      }
    }
  }, [activeProject?.id, pinned, projects, shownProjectId]);

  const togglePin = useCallback(() => {
    setPinned((current) => {
      const next = !current;
      savePinState(next, next ? shownProjectId : null);
      return next;
    });
  }, [shownProjectId]);

  const selectProject = useCallback(
    (id: string) => {
      setShownProjectId(id);
      setDropdownOpen(false);
      if (pinned) savePinState(true, id);
    },
    [pinned]
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  // ---- Tree data ----
  const [dirCache, setDirCache] = useState<Map<string, FileTreeEntry[]>>(
    () => new Map()
  );
  const dirCacheRef = useRef(dirCache);
  useEffect(() => {
    dirCacheRef.current = dirCache;
  }, [dirCache]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Single-click selects (highlights) a file row; double-click opens it.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [expandingAll, setExpandingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [filterResult, setFilterResult] = useState<FilterResult | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const filterRunRef = useRef(0);

  // ---- Git status ----
  const [gitFiles, setGitFiles] = useState<Map<string, GitStatusLetter>>(
    () => new Map()
  );
  const [gitFolders, setGitFolders] = useState<Map<string, GitStatusLetter>>(
    () => new Map()
  );

  // ---- Context menu & inline editing ----
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [editing, setEditing] = useState<TreeEditing | null>(null);

  // ---- View tab: Files / Source Control ----
  const [view, setView] = useState<"files" | "scm">("files");

  const showOpError = useCallback((err: unknown) => {
    setOpError(String(err));
    window.setTimeout(() => setOpError(null), 5000);
  }, []);

  const loadDir = useCallback(
    async (relative: string) => {
      if (!folder) return;
      setLoadingDirs((current) => {
        const next = new Set(current);
        next.add(relative);
        return next;
      });
      try {
        const entries = await invoke<DirectoryEntry[]>("list_directory", {
          folder,
          relative,
        });
        setDirCache((current) => {
          const next = new Map(current);
          next.set(relative, entries.map(toEntry));
          return next;
        });
        if (relative === "") setError(null);
      } catch (err) {
        if (relative === "") setError(String(err));
      } finally {
        setLoadingDirs((current) => {
          const next = new Set(current);
          next.delete(relative);
          return next;
        });
      }
    },
    [folder]
  );

  const refreshGit = useCallback(async () => {
    if (!folder) {
      setGitFiles(new Map());
      setGitFolders(new Map());
      return;
    }
    try {
      const result = await invoke<GitStatusResult>("git_status", { folder });
      const files = new Map<string, GitStatusLetter>();
      const folders = new Map<string, GitStatusLetter>();
      if (result.is_repo) {
        for (const entry of result.entries) {
          files.set(entry.relative_path, entry.status);
          // Propagate the dominant status up the folder chain (D > M > A > U).
          let dir = parentPath(entry.relative_path);
          while (dir) {
            const current = folders.get(dir);
            if (!current || GIT_RANK[entry.status] > GIT_RANK[current]) {
              folders.set(dir, entry.status);
            }
            dir = parentPath(dir);
          }
        }
      }
      setGitFiles(files);
      setGitFolders(folders);
    } catch {
      setGitFiles(new Map());
      setGitFolders(new Map());
    }
  }, [folder]);

  // Reset + load root + restore expanded dirs whenever the shown folder changes.
  useEffect(() => {
    setDirCache(new Map());
    setError(null);
    setOpError(null);
    setFilter("");
    setFilterResult(null);
    setCtxMenu(null);
    setEditing(null);
    const restored = projectId ? loadExpandedFor(projectId) : new Set<string>();
    setExpanded(restored);
    if (folder) {
      void loadDir("");
      for (const dir of restored) void loadDir(dir);
      void refreshGit();
    } else {
      setGitFiles(new Map());
      setGitFolders(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, projectId, loadDir, refreshGit]);

  // Persist expanded state per project.
  useEffect(() => {
    if (projectId) saveExpandedFor(projectId, expanded);
  }, [expanded, projectId]);

  // Poll git status while the panel is visible.
  useEffect(() => {
    if (!folder) return;
    const timer = window.setInterval(() => void refreshGit(), GIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [folder, refreshGit]);

  const toggleDir = useCallback(
    (relativePath: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(relativePath)) {
          next.delete(relativePath);
        } else {
          next.add(relativePath);
        }
        return next;
      });
      if (!dirCacheRef.current.has(relativePath)) void loadDir(relativePath);
    },
    [loadDir]
  );

  const refreshDir = useCallback(
    async (relative: string) => {
      setDirCache((current) => {
        const next = new Map(current);
        next.delete(relative);
        return next;
      });
      await loadDir(relative);
    },
    [loadDir]
  );

  const refresh = useCallback(() => {
    setDirCache(new Map());
    setError(null);
    if (folder) {
      void loadDir("");
      for (const dir of expanded) void loadDir(dir);
      void refreshGit();
    }
  }, [expanded, folder, loadDir, refreshGit]);

  // Auto-refresh the tree + git when an agent finishes a tool or a turn — hook
  // events (tool-end / done) mean files may have been created/edited/moved.
  // Debounced so a burst of tool calls triggers a single rescan.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    let unlisten = () => {};
    let timer: number | undefined;
    void listen<{ event?: string }>("agent:hook-event", (e) => {
      const ev = e.payload?.event;
      if (ev !== "tool-end" && ev !== "done") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshRef.current(), 400);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten();
      window.clearTimeout(timer);
    };
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const expandAll = useCallback(async () => {
    if (!folder || expandingAll) return;
    setExpandingAll(true);
    try {
      const discovered = new Set<string>();
      const queue: string[] = [""];
      const localCache = new Map(dirCacheRef.current);
      let visited = 0;
      while (queue.length > 0 && visited < EXPAND_ALL_MAX_DIRS) {
        const relative = queue.shift()!;
        visited += 1;
        let entries = localCache.get(relative);
        if (!entries) {
          try {
            const raw = await invoke<DirectoryEntry[]>("list_directory", {
              folder,
              relative,
            });
            entries = raw.map(toEntry);
            localCache.set(relative, entries);
          } catch {
            continue;
          }
        }
        for (const entry of entries) {
          if (entry.isDir) {
            discovered.add(entry.relativePath);
            queue.push(entry.relativePath);
          }
        }
      }
      setDirCache(localCache);
      setExpanded(discovered);
    } finally {
      setExpandingAll(false);
    }
  }, [expandingAll, folder]);

  // Flat visible-row projection over the cached expanded dirs.
  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    const walk = (relative: string, depth: number) => {
      const entries = dirCache.get(relative);
      if (!entries) return;
      for (const entry of entries) {
        rows.push({ entry, depth });
        if (entry.isDir && expanded.has(entry.relativePath)) {
          walk(entry.relativePath, depth + 1);
        }
      }
    };
    walk("", 0);
    return rows;
  }, [dirCache, expanded]);

  // "Find files" — debounced client-side BFS reusing/filling dirCache.
  useEffect(() => {
    const query = filter.trim().toLowerCase();
    if (!query || !folder) {
      setFilterResult(null);
      setFilterLoading(false);
      return;
    }
    const runId = ++filterRunRef.current;
    setFilterLoading(true);
    const timer = window.setTimeout(async () => {
      const matches: FileTreeEntry[] = [];
      let truncated = false;
      const queue: string[] = [""];
      let visitedDirs = 0;
      const localCache = new Map(dirCacheRef.current);
      while (queue.length > 0) {
        if (filterRunRef.current !== runId) return;
        if (visitedDirs >= FILTER_MAX_DIRS || matches.length >= FILTER_MAX_RESULTS) {
          truncated = true;
          break;
        }
        const relative = queue.shift()!;
        visitedDirs += 1;
        let entries = localCache.get(relative);
        if (!entries) {
          try {
            const raw = await invoke<DirectoryEntry[]>("list_directory", {
              folder,
              relative,
            });
            entries = raw.map(toEntry);
            localCache.set(relative, entries);
            const fetched = entries;
            setDirCache((current) => {
              if (current.has(relative)) return current;
              const next = new Map(current);
              next.set(relative, fetched);
              return next;
            });
          } catch {
            continue;
          }
        }
        for (const entry of entries) {
          if (entry.isDir) {
            queue.push(entry.relativePath);
          } else if (entry.name.toLowerCase().includes(query)) {
            matches.push(entry);
            if (matches.length >= FILTER_MAX_RESULTS) break;
          }
        }
      }
      if (filterRunRef.current !== runId) return;
      setFilterResult({ entries: matches, truncated });
      setFilterLoading(false);
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirCache, filter, folder]);

  // ---- Context menu actions ----

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = () => setCtxMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const openCtxMenu = useCallback(
    (event: ReactMouseEvent, entry: FileTreeEntry | null) => {
      event.preventDefault();
      event.stopPropagation();
      setCtxMenu({ x: event.clientX, y: event.clientY, entry });
    },
    []
  );

  const copyText = useCallback(
    (text: string) => {
      invoke("clipboard_write_text", { text }).catch(showOpError);
    },
    [showOpError]
  );

  const startCreate = useCallback(
    (kind: "new-file" | "new-dir", parent: string) => {
      setCtxMenu(null);
      if (parent) {
        setExpanded((current) => {
          if (current.has(parent)) return current;
          const next = new Set(current);
          next.add(parent);
          return next;
        });
        if (!dirCacheRef.current.has(parent)) void loadDir(parent);
      }
      setEditing({ kind, parentPath: parent, initial: "" });
    },
    [loadDir]
  );

  const startRename = useCallback((entry: FileTreeEntry) => {
    setCtxMenu(null);
    setEditing({
      kind: "rename",
      parentPath: parentPath(entry.relativePath),
      targetPath: entry.relativePath,
      initial: entry.name,
    });
  }, []);

  const commitEditing = useCallback(
    async (name: string) => {
      const edit = editing;
      setEditing(null);
      if (!edit || !folder) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        if (edit.kind === "rename" && edit.targetPath) {
          const target = edit.targetPath;
          if (trimmed === baseName(target)) return;
          const newRel = await invoke<string>("rename_path", {
            folder,
            relativePath: target,
            newName: trimmed,
          });
          // Keep expansion for a renamed dir subtree.
          setExpanded((current) => {
            const next = new Set<string>();
            for (const p of current) {
              if (p === target) next.add(newRel);
              else if (p.startsWith(`${target}/`)) {
                next.add(newRel + p.slice(target.length));
              } else next.add(p);
            }
            return next;
          });
        } else {
          const rel = edit.parentPath
            ? `${edit.parentPath}/${trimmed}`
            : trimmed;
          await invoke(
            edit.kind === "new-file" ? "create_file" : "create_directory",
            { folder, relativePath: rel }
          );
        }
        await refreshDir(edit.parentPath);
        void refreshGit();
      } catch (err) {
        showOpError(err);
      }
    },
    [editing, folder, refreshDir, refreshGit, showOpError]
  );

  const duplicateEntry = useCallback(
    async (entry: FileTreeEntry) => {
      setCtxMenu(null);
      if (!folder) return;
      try {
        await invoke<string>("duplicate_path", {
          folder,
          relativePath: entry.relativePath,
        });
        await refreshDir(parentPath(entry.relativePath));
        void refreshGit();
      } catch (err) {
        showOpError(err);
      }
    },
    [folder, refreshDir, refreshGit, showOpError]
  );

  const deleteEntry = useCallback(
    async (entry: FileTreeEntry) => {
      setCtxMenu(null);
      if (!folder) return;
      try {
        await invoke("delete_path", {
          folder,
          relativePath: entry.relativePath,
        });
        if (entry.isDir) {
          setExpanded((current) => {
            const next = new Set(
              [...current].filter(
                (p) =>
                  p !== entry.relativePath &&
                  !p.startsWith(entry.relativePath + "/")
              )
            );
            return next;
          });
        }
        await refreshDir(parentPath(entry.relativePath));
        void refreshGit();
      } catch (err) {
        showOpError(err);
      }
    },
    [folder, refreshDir, refreshGit, showOpError]
  );

  // ---- Render helpers ----

  const rootLoading = loadingDirs.has("");
  const filtering = filter.trim().length > 0;

  const gitClassFor = (entry: FileTreeEntry) => {
    const status = entry.isDir
      ? gitFolders.get(entry.relativePath)
      : gitFiles.get(entry.relativePath);
    return status ? ` git-${status}` : "";
  };

  const gitBadgeFor = (entry: FileTreeEntry) => {
    const status = entry.isDir
      ? gitFolders.get(entry.relativePath)
      : gitFiles.get(entry.relativePath);
    return status ? (
      <span className="file-tree-badge">{status}</span>
    ) : null;
  };

  const editorRow = (depth: number) => (
    <InlineNameInput
      key="__editor__"
      depth={depth}
      initial={editing?.initial ?? ""}
      isDir={editing?.kind === "new-dir"}
      onCommit={(value) => void commitEditing(value)}
      onCancel={() => setEditing(null)}
    />
  );

  const renderTreeRows = () => {
    const items: ReactNode[] = [];
    // New-entry editor at project root goes first.
    if (editing && editing.kind !== "rename" && editing.parentPath === "") {
      items.push(editorRow(0));
    }
    for (const { entry, depth } of visibleRows) {
      if (editing?.kind === "rename" && editing.targetPath === entry.relativePath) {
        items.push(editorRow(depth));
        continue;
      }
      const isExpanded = entry.isDir && expanded.has(entry.relativePath);
      const isLoading = entry.isDir && loadingDirs.has(entry.relativePath);
      items.push(
        <button
          key={entry.relativePath}
          className={`file-tree-row ${entry.isDir ? "file-tree-row-dir" : "file-tree-row-file"}${gitClassFor(entry)}${
            !entry.isDir && selectedPath === entry.relativePath
              ? " file-tree-row-selected"
              : ""
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            // Folder: single click toggles. File: single click selects /
            // deselects; double click (below) opens it.
            if (entry.isDir) {
              toggleDir(entry.relativePath);
            } else {
              setSelectedPath((current) =>
                current === entry.relativePath ? null : entry.relativePath
              );
            }
          }}
          onDoubleClick={() => {
            if (!entry.isDir && projectId) {
              onOpenFile(projectId, entry.relativePath);
            }
          }}
          onContextMenu={(event) => openCtxMenu(event, entry)}
          title={entry.relativePath}
        >
          {entry.isDir ? (
            <span
              className={`file-tree-caret ${isExpanded ? "file-tree-caret-open" : ""}`}
            >
              ▸
            </span>
          ) : (
            <span className="file-tree-caret file-tree-caret-spacer" />
          )}
          <span
            className={`file-tree-icon ${
              entry.isDir
                ? isLoading
                  ? "file-tree-icon-loading"
                  : "file-tree-icon-folder"
                : fileIconClass(entry.name)
            }`}
          />
          <span className="file-tree-name">{entry.name}</span>
          {gitBadgeFor(entry)}
        </button>
      );
      // New-entry editor inside this dir goes right below its row.
      if (
        editing &&
        editing.kind !== "rename" &&
        entry.isDir &&
        editing.parentPath === entry.relativePath
      ) {
        items.push(editorRow(depth + 1));
      }
    }
    return items;
  };

  const changedCount = gitFiles.size;

  return (
    <div className={`file-tree-panel docs-theme-${theme}`} style={{ width }}>
      <div className="file-tree-tabs">
        <button
          className={`file-tree-tab ${view === "files" ? "file-tree-tab-active" : ""}`}
          onClick={() => setView("files")}
          title="Files"
        >
          🗀
        </button>
        <button
          className={`file-tree-tab ${view === "scm" ? "file-tree-tab-active" : ""}`}
          onClick={() => setView("scm")}
          title="Source Control"
        >
          <span className="file-tree-tab-icon">
            ⎇
            {changedCount > 0 && (
              <span className="file-tree-tab-count">
                {changedCount > 99 ? "99+" : changedCount}
              </span>
            )}
          </span>
        </button>
      </div>
      <div className="file-tree-header">
        <div
          className="file-tree-project"
          ref={dropdownRef}
          onClick={() => setDropdownOpen((open) => !open)}
          title={folder || shownProject?.name || ""}
        >
          <span className="file-tree-project-name">
            {shownProject ? shownProject.name : "Files"}
          </span>
          <span className="file-tree-project-chev">▾</span>
          {dropdownOpen && (
            <div className="file-tree-dropdown">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={p.id === shownProjectId ? "file-tree-dropdown-sel" : ""}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectProject(p.id);
                  }}
                >
                  <span className="file-tree-dropdown-name">{p.name}</span>
                  <span className="file-tree-dropdown-path">{p.folder}</span>
                </button>
              ))}
              {projects.length === 0 && (
                <div className="file-tree-dropdown-empty">프로젝트가 없습니다</div>
              )}
            </div>
          )}
        </div>
        <button
          className={`docs-icon-btn file-tree-pin ${pinned ? "file-tree-pin-on" : ""}`}
          onClick={togglePin}
          title={
            pinned
              ? `${shownProject?.name ?? ""}에 고정됨 — 클릭하여 해제`
              : "트리를 이 프로젝트에 고정"
          }
        >
          📌
        </button>
        <button className="docs-icon-btn" onClick={onClose} title="닫기">
          ×
        </button>
      </div>

      {view === "files" && (
        <div className="file-tree-search">
          <input
            type="text"
            value={filter}
            placeholder="Find files"
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && filter) {
                event.preventDefault();
                event.stopPropagation();
                setFilter("");
              }
            }}
          />
        </div>
      )}

      {view === "files" && (
        <div className="file-tree-toolbar">
          <span className="file-tree-toolbar-label">Files</span>
          <button
            className="docs-icon-btn"
            onClick={() => void expandAll()}
            title="모두 펼치기"
            disabled={!folder || expandingAll}
          >
            ⊞
          </button>
          <button
            className="docs-icon-btn"
            onClick={collapseAll}
            title="모두 접기"
            disabled={!folder}
          >
            ⊟
          </button>
          <button
            className="docs-icon-btn"
            onClick={refresh}
            title="새로고침"
            disabled={!folder || rootLoading}
          >
            ⟳
          </button>
        </div>
      )}

      {opError && <div className="file-tree-op-error">{opError}</div>}

      {view === "scm" && (
        <SourceControlView
          folder={folder}
          sshProject={!!shownProject?.sshHostId}
          onOpenFile={(rel) => {
            if (projectId) onOpenFile(projectId, rel);
          }}
          onOpenHistory={(rel) => {
            if (projectId) onOpenGitHistory(projectId, rel ?? null);
          }}
          onMutated={() => void refreshGit()}
          onError={showOpError}
        />
      )}

      {view === "files" && (
      <>
      <div
        className="file-tree-body"
        onContextMenu={(event) => {
          // Background right-click → root-level new file/folder menu.
          if (!(event.target as HTMLElement).closest(".file-tree-row")) {
            openCtxMenu(event, null);
          }
        }}
      >
        {!shownProject && (
          <div className="docs-empty">프로젝트를 선택하면 파일을 볼 수 있습니다.</div>
        )}
        {shownProject && !folder && (
          <div className="docs-empty">
            {shownProject.sshHostId
              ? "SSH 프로젝트는 파일 트리를 지원하지 않습니다."
              : "선택된 프로젝트에 폴더가 없습니다."}
          </div>
        )}
        {folder && error && (
          <div className="docs-error">
            {error}
            <button className="docs-tool-btn" onClick={refresh}>
              Retry
            </button>
          </div>
        )}
        {folder && !error && rootLoading && visibleRows.length === 0 && (
          <div className="docs-empty">Loading...</div>
        )}

        {folder && !error && !filtering && (
          <div className="file-tree-rows">
            {renderTreeRows()}
            {visibleRows.length === 0 && !rootLoading && (
              <div className="docs-empty">파일이 없습니다.</div>
            )}
          </div>
        )}

        {folder && !error && filtering && (
          <div className="file-tree-rows">
            {filterLoading && <div className="docs-empty">Searching...</div>}
            {!filterLoading &&
              filterResult?.entries.map((entry) => (
                <button
                  key={entry.relativePath}
                  className={`file-tree-row file-tree-row-file${gitClassFor(entry)}`}
                  style={{ paddingLeft: 8 }}
                  onClick={() => {
                    if (projectId) onOpenFile(projectId, entry.relativePath);
                  }}
                  onContextMenu={(event) => openCtxMenu(event, entry)}
                  title={entry.relativePath}
                >
                  <span className={`file-tree-icon ${fileIconClass(entry.name)}`} />
                  <span className="file-tree-name">{entry.name}</span>
                  <span className="file-tree-parent">
                    {parentPath(entry.relativePath)}
                  </span>
                </button>
              ))}
            {!filterLoading && filterResult && filterResult.entries.length === 0 && (
              <div className="docs-empty">일치하는 파일이 없습니다.</div>
            )}
            {!filterLoading && filterResult?.truncated && (
              <div className="file-tree-truncated">
                결과가 많아 일부만 표시합니다.
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {ctxMenu && folder && (
        <FileTreeContextMenu
          state={ctxMenu}
          onOpenDoc={(entry) => {
            setCtxMenu(null);
            if (projectId) onOpenFile(projectId, entry.relativePath);
          }}
          onOpenOs={(entry) => {
            setCtxMenu(null);
            invoke("open_local_path", {
              path: nativeAbsolutePath(folder, entry.relativePath),
            }).catch(showOpError);
          }}
          onCopyPath={(entry) => {
            setCtxMenu(null);
            copyText(nativeAbsolutePath(folder, entry.relativePath));
          }}
          onCopyRelative={(entry) => {
            setCtxMenu(null);
            copyText(entry.relativePath);
          }}
          onDuplicate={(entry) => void duplicateEntry(entry)}
          onReveal={(entry) => {
            setCtxMenu(null);
            invoke("reveal_local_path", {
              path: nativeAbsolutePath(folder, entry.relativePath),
            }).catch(showOpError);
          }}
          onRename={startRename}
          onDelete={(entry) => void deleteEntry(entry)}
          onNewFile={(parent) => startCreate("new-file", parent)}
          onNewDir={(parent) => startCreate("new-dir", parent)}
          onOpenHistory={(entry) => {
            setCtxMenu(null);
            if (projectId) onOpenGitHistory(projectId, entry.relativePath);
          }}
        />
      )}
    </div>
  );
}

function SourceControlView({
  folder,
  sshProject,
  onOpenFile,
  onOpenHistory,
  onMutated,
  onError,
}: {
  folder: string;
  sshProject: boolean;
  onOpenFile: (relativePath: string) => void;
  onOpenHistory: (relativePath?: string | null) => void;
  onMutated: () => void;
  onError: (err: unknown) => void;
}) {
  const [changes, setChanges] = useState<GitChangesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Multi-select for batch stage/unstage/discard (keyed by relative_path).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastClickedRef = useRef<string | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchList, setBranchList] = useState<
    { current: string; branches: string[] } | null
  >(null);
  const [ctx, setCtx] = useState<
    { x: number; y: number; entry: GitChangeEntry; staged: boolean } | null
  >(null);
  const [history, setHistory] = useState<
    { x: number; y: number; entry: GitChangeEntry; commits: GitFileCommit[] | null } | null
  >(null);

  const load = useCallback(async () => {
    if (!folder) {
      setChanges(null);
      return;
    }
    setLoading(true);
    try {
      const result = await invoke<GitChangesResult>("git_changes", { folder });
      setChanges(result);
      // Drop selections for paths that are no longer changed.
      setSelected((current) => {
        if (current.size === 0) return current;
        const live = new Set([
          ...result.staged.map((e) => e.relative_path),
          ...result.unstaged.map((e) => e.relative_path),
        ]);
        const next = new Set([...current].filter((p) => live.has(p)));
        return next.size === current.size ? current : next;
      });
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [folder, onError]);

  useEffect(() => {
    void load();
    if (!folder) return;
    const timer = window.setInterval(() => void load(), GIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [folder, load]);

  const runGitOp = useCallback(
    async (op: () => Promise<unknown>) => {
      if (busy) return;
      setBusy(true);
      try {
        await op();
        await load();
        onMutated();
      } catch (err) {
        onError(err);
      } finally {
        setBusy(false);
      }
    },
    [busy, load, onError, onMutated]
  );

  const stage = (paths: string[]) => {
    if (paths.length === 0) return;
    void runGitOp(() => invoke("git_stage", { folder, paths }));
  };
  const unstage = (paths: string[]) => {
    if (paths.length === 0) return;
    void runGitOp(() => invoke("git_unstage", { folder, paths }));
  };
  const discard = (paths: string[]) => {
    if (paths.length === 0) return;
    const label =
      paths.length === 1 ? `"${baseName(paths[0])}"의` : `${paths.length}개 파일의`;
    const ok = window.confirm(
      `${label} 변경을 되돌립니다.\n미추적 파일은 휴지통으로, 나머지는 마지막 커밋 상태로 복원됩니다.\n이 동작은 git으로 되돌릴 수 없습니다.`
    );
    if (!ok) return;
    void runGitOp(async () => {
      await invoke("git_discard", { folder, paths });
      setSelected(new Set());
    });
  };

  const openDiff = (relativePath: string, staged: boolean) => {
    const command = loadDiffToolCommand().trim();
    if (!command) {
      onError(
        new Error("설정 → Version Control에서 외부 diff 프로그램을 먼저 지정하세요.")
      );
      return;
    }
    invoke("git_diff_tool", { folder, relativePath, staged, command }).catch(onError);
  };

  const toggleBranchMenu = async () => {
    if (branchOpen) {
      setBranchOpen(false);
      return;
    }
    setBranchOpen(true);
    setBranchList(null);
    try {
      const result = await invoke("git_branches", { folder });
      setBranchList(result);
    } catch (err) {
      onError(err);
      setBranchOpen(false);
    }
  };

  const switchBranch = (branch: string) => {
    setBranchOpen(false);
    if (branchList && branch === branchList.current) return;
    void runGitOp(() => invoke("git_checkout", { folder, branch }));
  };

  const commitFile = (relativePath: string) => {
    const msg = message.trim();
    if (!msg) {
      onError(new Error("커밋 메시지를 먼저 입력하세요."));
      return;
    }
    void runGitOp(async () => {
      // Stage (covers untracked), then path-limited commit so only this file
      // lands even if other files are already staged.
      await invoke("git_stage", { folder, paths: [relativePath] });
      await invoke("git_commit", { folder, message: msg, paths: [relativePath] });
      setMessage("");
    });
  };

  const openHistory = async (
    entry: GitChangeEntry,
    at: { x: number; y: number }
  ) => {
    setCtx(null);
    setHistory({ x: at.x, y: at.y, entry, commits: null });
    try {
      const result = await invoke("git_file_history", {
        folder,
        relativePath: entry.relative_path,
      });
      setHistory((current) =>
        current && current.entry === entry
          ? { ...current, commits: result.commits }
          : current
      );
    } catch (err) {
      onError(err);
      setHistory(null);
    }
  };

  const diffCommit = (entry: GitChangeEntry, ref: string) => {
    setHistory(null);
    const command = loadDiffToolCommand().trim();
    if (!command) {
      onError(
        new Error("설정 → Version Control에서 외부 diff 프로그램을 먼저 지정하세요.")
      );
      return;
    }
    invoke("git_diff_tool", {
      folder,
      relativePath: entry.relative_path,
      staged: false,
      command,
      ref,
    }).catch(onError);
  };

  useEffect(() => {
    if (!ctx && !history) return;
    const close = () => {
      setCtx(null);
      setHistory(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx, history]);
  // VS Code behavior: with nothing staged, Commit stages every change first
  // (commit-all), so the button isn't a dead end when the user just types a
  // message. With staged files, it commits only those (selective).
  const commit = (commitAll: boolean, unstagedPaths: string[]) =>
    void runGitOp(async () => {
      if (commitAll && unstagedPaths.length > 0) {
        await invoke("git_stage", { folder, paths: unstagedPaths });
      }
      await invoke("git_commit", { folder, message: message.trim() });
      setMessage("");
    });

  const toggleSelected = (relativePath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  if (!folder) {
    return (
      <div className="file-tree-body">
        <div className="docs-empty">
          {sshProject
            ? "SSH 프로젝트는 Source Control을 지원하지 않습니다."
            : "프로젝트를 선택하면 변경사항을 볼 수 있습니다."}
        </div>
      </div>
    );
  }
  if (!changes) {
    return (
      <div className="file-tree-body">
        <div className="docs-empty">{loading ? "Loading..." : ""}</div>
      </div>
    );
  }
  if (!changes.is_repo) {
    return (
      <div className="file-tree-body">
        <div className="docs-empty">git 저장소가 아닙니다.</div>
      </div>
    );
  }

  const commitAll = changes.staged.length === 0;
  const unstagedPaths = changes.unstaged.map((entry) => entry.relative_path);
  const canCommit =
    (changes.staged.length > 0 || changes.unstaged.length > 0) &&
    !!message.trim() &&
    !busy;
  const doCommit = () => commit(commitAll, unstagedPaths);

  // Flat display order (staged then changes, deduped) for Shift+click ranges.
  const orderedPaths: string[] = [];
  const seenOrder = new Set<string>();
  for (const entry of [...changes.staged, ...changes.unstaged]) {
    if (!seenOrder.has(entry.relative_path)) {
      seenOrder.add(entry.relative_path);
      orderedPaths.push(entry.relative_path);
    }
  }

  const handleRowClick = (
    event: ReactMouseEvent<HTMLDivElement>,
    relativePath: string
  ) => {
    if (event.shiftKey && lastClickedRef.current) {
      const a = orderedPaths.indexOf(lastClickedRef.current);
      const b = orderedPaths.indexOf(relativePath);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        setSelected((current) => {
          const next = new Set(current);
          for (let i = lo; i <= hi; i += 1) next.add(orderedPaths[i]);
          return next;
        });
        return;
      }
    }
    toggleSelected(relativePath);
    lastClickedRef.current = relativePath;
  };

  const changeRow = (entry: GitChangeEntry, staged: boolean) => (
    <div
      key={`${staged ? "s" : "u"}:${entry.relative_path}`}
      className={`scm-row git-${entry.status} ${
        selected.has(entry.relative_path) ? "scm-row-selected" : ""
      }`}
      onClick={(event) => handleRowClick(event, entry.relative_path)}
      onDoubleClick={() => onOpenFile(entry.relative_path)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setHistory(null);
        setCtx({ x: event.clientX, y: event.clientY, entry, staged });
      }}
      title={`${entry.relative_path}\n(클릭: 선택 · Shift+클릭: 범위 선택 · 더블클릭: 열기 · 우클릭: 메뉴)`}
    >
      <input
        type="checkbox"
        className="scm-check"
        checked={selected.has(entry.relative_path)}
        onClick={(event) => event.stopPropagation()}
        onChange={() => toggleSelected(entry.relative_path)}
      />
      <span className={`file-tree-icon ${fileIconClass(baseName(entry.relative_path))}`} />
      <span className="scm-name">{baseName(entry.relative_path)}</span>
      <span className="scm-dir">{parentPath(entry.relative_path)}</span>
      <span className="scm-stats">
        {entry.additions > 0 && (
          <span className="scm-plus">+{entry.additions}</span>
        )}
        {entry.deletions > 0 && (
          <span className="scm-minus">-{entry.deletions}</span>
        )}
        <span className="scm-letter">{entry.status}</span>
      </span>
      <span
        className="scm-act scm-act-diff"
        title="외부 diff 프로그램으로 비교"
        onClick={(event) => {
          event.stopPropagation();
          openDiff(entry.relative_path, staged);
        }}
      >
        ⇄
      </span>
      <span
        className="scm-act scm-act-discard"
        title="변경 되돌리기 (Discard)"
        onClick={(event) => {
          event.stopPropagation();
          discard([entry.relative_path]);
        }}
      >
        ↺
      </span>
      <span
        className="scm-act"
        title={staged ? "Unstage" : "Stage"}
        onClick={(event) => {
          event.stopPropagation();
          if (staged) unstage([entry.relative_path]);
          else stage([entry.relative_path]);
        }}
      >
        {staged ? "−" : "+"}
      </span>
    </div>
  );

  const selectedPaths = [...selected];

  return (
    <div className="scm-view">
      <div className="scm-branchrow" title={changes.upstream ?? undefined}>
        <button
          className="scm-branch"
          onClick={toggleBranchMenu}
          disabled={busy || sshProject}
          title="브랜치 전환"
        >
          ⎇ {changes.branch || "(no branch)"} <span className="scm-branch-caret">▾</span>
        </button>
        {changes.ahead > 0 && <span className="scm-ahead">↑{changes.ahead}</span>}
        {changes.behind > 0 && <span className="scm-behind">↓{changes.behind}</span>}
        {changes.upstream && <span className="scm-upstream">vs {changes.upstream}</span>}
        {branchOpen && (
          <div
            className="scm-branch-backdrop"
            onClick={() => setBranchOpen(false)}
          />
        )}
        {branchOpen && (
          <div className="scm-branch-menu">
            {branchList === null && (
              <div className="scm-branch-empty">불러오는 중…</div>
            )}
            {branchList?.branches.map((name) => (
              <button
                key={name}
                className={`scm-branch-item ${
                  name === branchList.current ? "scm-branch-item-current" : ""
                }`}
                onClick={() => switchBranch(name)}
              >
                <span className="scm-branch-dot">
                  {name === branchList.current ? "●" : ""}
                </span>
                {name}
              </button>
            ))}
            {branchList && branchList.branches.length === 0 && (
              <div className="scm-branch-empty">브랜치 없음</div>
            )}
          </div>
        )}
      </div>
      <div className="scm-msg">
        <textarea
          value={message}
          placeholder="Message (커밋 메시지)"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              if (canCommit) doCommit();
            }
            event.stopPropagation();
          }}
          disabled={busy}
          spellCheck={false}
        />
      </div>
      <div className="scm-actions">
        <button
          onClick={() =>
            stage(changes.unstaged.map((entry) => entry.relative_path))
          }
          disabled={busy || changes.unstaged.length === 0}
        >
          + Stage All
        </button>
        <button
          className="scm-commit-btn"
          onClick={doCommit}
          disabled={!canCommit}
          title={
            commitAll
              ? "스테이징된 항목이 없어 전체 변경을 커밋합니다 (Ctrl+Enter)"
              : "스테이징된 항목만 커밋합니다 (Ctrl+Enter)"
          }
        >
          {commitAll
            ? `Commit All${
                changes.unstaged.length > 0 ? ` (${changes.unstaged.length})` : ""
              }`
            : `Commit (${changes.staged.length})`}
        </button>
      </div>
      {selectedPaths.length > 0 && (
        <div className="scm-selbar">
          <span className="scm-selbar-count">{selectedPaths.length}개 선택</span>
          <button onClick={() => stage(selectedPaths)} disabled={busy}>
            Stage
          </button>
          <button onClick={() => unstage(selectedPaths)} disabled={busy}>
            Unstage
          </button>
          <button
            className="scm-selbar-discard"
            onClick={() => discard(selectedPaths)}
            disabled={busy}
          >
            Discard
          </button>
          <button
            className="scm-selbar-clear"
            onClick={() => setSelected(new Set())}
            title="선택 해제"
          >
            ×
          </button>
        </div>
      )}
      <div className="file-tree-body">
        <div className="scm-section">
          Staged <span className="scm-count">{changes.staged.length}</span>
          {changes.staged.length > 0 && (
            <span
              className="scm-section-act"
              title="모두 언스테이지"
              onClick={() =>
                unstage(changes.staged.map((entry) => entry.relative_path))
              }
            >
              −
            </span>
          )}
        </div>
        <div className="scm-list">
          {changes.staged.map((entry) => changeRow(entry, true))}
          {changes.staged.length === 0 && (
            <div className="scm-empty">스테이징된 변경 없음</div>
          )}
        </div>
        <div className="scm-section">
          Changes <span className="scm-count">{changes.unstaged.length}</span>
        </div>
        <div className="scm-list">
          {changes.unstaged.map((entry) => changeRow(entry, false))}
          {changes.unstaged.length === 0 && (
            <div className="scm-empty">변경 없음</div>
          )}
        </div>
        <div className="scm-commits">
          <div className="scm-section">
            <span>Commits</span>
            <button
              type="button"
              className="scm-section-act"
              onClick={() => onOpenHistory(null)}
              title="전체 커밋 히스토리 자세히 보기"
              aria-label="커밋 히스토리 자세히 보기"
            >
              🔍
            </button>
          </div>
          {changes.commits.map((commitEntry) => (
            <div className="scm-commit" key={commitEntry.hash}>
              <span className="scm-hash">{commitEntry.hash}</span>
              <span className="scm-subject" title={commitEntry.subject}>
                {commitEntry.subject}
              </span>
            </div>
          ))}
        </div>
      </div>
      {ctx && (
        <div
          className="file-tree-ctx scm-ctx"
          style={{
            left: Math.min(ctx.x, window.innerWidth - 210),
            top: Math.min(ctx.y, window.innerHeight - 240),
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button onClick={() => { onOpenFile(ctx.entry.relative_path); setCtx(null); }}>
            열기
          </button>
          <button onClick={() => { onOpenHistory(ctx.entry.relative_path); setCtx(null); }}>
            이 경로 히스토리
          </button>
          <button onClick={() => { openDiff(ctx.entry.relative_path, ctx.staged); setCtx(null); }}>
            Diff (외부 프로그램)
          </button>
          <hr />
          <button
            onClick={() => {
              if (ctx.staged) unstage([ctx.entry.relative_path]);
              else stage([ctx.entry.relative_path]);
              setCtx(null);
            }}
          >
            {ctx.staged ? "Unstage" : "Stage"}
          </button>
          <button onClick={() => { commitFile(ctx.entry.relative_path); setCtx(null); }}>
            커밋 (이 파일만)
          </button>
          <button
            className="file-tree-ctx-danger"
            onClick={() => { discard([ctx.entry.relative_path]); setCtx(null); }}
          >
            Discard (변경 되돌리기)
          </button>
          <hr />
          <button onClick={() => void openHistory(ctx.entry, { x: ctx.x, y: ctx.y })}>
            File History…
          </button>
        </div>
      )}
      {history && (
        <div
          className="file-tree-ctx scm-history"
          style={{
            left: Math.min(history.x, window.innerWidth - 320),
            top: Math.min(history.y, window.innerHeight - 320),
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="scm-history-head">
            이력 · {baseName(history.entry.relative_path)}
          </div>
          {history.commits === null && (
            <div className="scm-history-empty">불러오는 중…</div>
          )}
          {history.commits?.length === 0 && (
            <div className="scm-history-empty">커밋 이력 없음</div>
          )}
          {history.commits?.map((commitEntry) => (
            <button
              key={commitEntry.hash}
              className="scm-history-item"
              title={`${commitEntry.subject}\n${commitEntry.author} · ${commitEntry.date}\n(클릭: 이 시점과 외부 diff)`}
              onClick={() => diffCommit(history.entry, commitEntry.hash)}
            >
              <span className="scm-history-hash">{commitEntry.hash.slice(0, 7)}</span>
              <span className="scm-history-subject">{commitEntry.subject}</span>
              <span className="scm-history-date">{commitEntry.date}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineNameInput({
  depth,
  initial,
  isDir,
  onCommit,
  onCancel,
}: {
  depth: number;
  initial: string;
  isDir: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initial.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };

  return (
    <div
      className="file-tree-row file-tree-editing"
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      <span className="file-tree-caret file-tree-caret-spacer" />
      <span
        className={`file-tree-icon ${isDir ? "file-tree-icon-folder" : "file-tree-icon-file"}`}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(false)}
        spellCheck={false}
      />
    </div>
  );
}

function FileTreeContextMenu({
  state,
  onOpenDoc,
  onOpenOs,
  onCopyPath,
  onCopyRelative,
  onDuplicate,
  onReveal,
  onRename,
  onDelete,
  onNewFile,
  onNewDir,
  onOpenHistory,
}: {
  state: CtxMenuState;
  onOpenDoc: (entry: FileTreeEntry) => void;
  onOpenOs: (entry: FileTreeEntry) => void;
  onCopyPath: (entry: FileTreeEntry) => void;
  onCopyRelative: (entry: FileTreeEntry) => void;
  onDuplicate: (entry: FileTreeEntry) => void;
  onReveal: (entry: FileTreeEntry) => void;
  onRename: (entry: FileTreeEntry) => void;
  onDelete: (entry: FileTreeEntry) => void;
  onNewFile: (parent: string) => void;
  onNewDir: (parent: string) => void;
  onOpenHistory: (entry: FileTreeEntry) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPos({
      x: Math.min(state.x, window.innerWidth - rect.width - 8),
      y: Math.min(state.y, window.innerHeight - rect.height - 8),
    });
  }, [state]);

  const entry = state.entry;
  const item = (
    label: string,
    action: () => void,
    options?: { danger?: boolean }
  ) => (
    <button
      key={label}
      className={options?.danger ? "file-tree-ctx-danger" : ""}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="file-tree-ctx"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {!entry && (
        <>
          {item("새 파일", () => onNewFile(""))}
          {item("새 폴더", () => onNewDir(""))}
        </>
      )}
      {entry && entry.isDir && (
        <>
          {item("새 파일", () => onNewFile(entry.relativePath))}
          {item("새 폴더", () => onNewDir(entry.relativePath))}
          <hr />
          {item("경로 복사", () => onCopyPath(entry))}
          {item("상대 경로 복사", () => onCopyRelative(entry))}
          <hr />
          {item("탐색기에서 보기", () => onReveal(entry))}
          <hr />
          {item("이 경로 히스토리", () => onOpenHistory(entry))}
          <hr />
          {item("이름 변경", () => onRename(entry))}
          {item("삭제 (휴지통)", () => onDelete(entry), { danger: true })}
        </>
      )}
      {entry && !entry.isDir && (
        <>
          {item("열기 (문서 탭)", () => onOpenDoc(entry))}
          {item("OS 기본 앱으로 열기", () => onOpenOs(entry))}
          <hr />
          {item("경로 복사", () => onCopyPath(entry))}
          {item("상대 경로 복사", () => onCopyRelative(entry))}
          {item("복제", () => onDuplicate(entry))}
          <hr />
          {item("탐색기에서 보기", () => onReveal(entry))}
          <hr />
          {item("이 경로 히스토리", () => onOpenHistory(entry))}
          <hr />
          {item("이름 변경", () => onRename(entry))}
          {item("삭제 (휴지통)", () => onDelete(entry), { danger: true })}
        </>
      )}
    </div>
  );
}
