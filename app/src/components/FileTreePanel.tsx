import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../platform/runtime";
import type { Project } from "../types";
import type { AppThemeId } from "../lib/appTheme";
import type { DirectoryEntry } from "../platform/ipcContract";

// Orca-style lazy file explorer: one list_directory call per expanded folder,
// cached in dirCache (key "" = project root).
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

const FILTER_MAX_DIRS = 400;
const FILTER_MAX_RESULTS = 200;
const FILTER_DEBOUNCE_MS = 150;

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

export function FileTreePanel({
  project,
  width,
  theme,
  onOpenFile,
  onClose,
}: {
  project: Project | null;
  width: number;
  theme: AppThemeId;
  onOpenFile: (projectId: string, relativePath: string) => void;
  onClose: () => void;
}) {
  const folder = project && !project.sshHostId ? project.folder : "";
  const projectId = project?.id ?? null;

  const [dirCache, setDirCache] = useState<Map<string, FileTreeEntry[]>>(
    () => new Map()
  );
  const dirCacheRef = useRef(dirCache);
  useEffect(() => {
    dirCacheRef.current = dirCache;
  }, [dirCache]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [filterResult, setFilterResult] = useState<FilterResult | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const filterRunRef = useRef(0);

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

  // Reset + load root whenever the active project folder changes.
  useEffect(() => {
    setDirCache(new Map());
    setExpanded(new Set());
    setError(null);
    setFilter("");
    setFilterResult(null);
    if (folder) void loadDir("");
  }, [folder, loadDir]);

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

  const refresh = useCallback(() => {
    setDirCache(new Map());
    setError(null);
    if (folder) void loadDir("");
  }, [folder, loadDir]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

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
      const localCache = new Map(dirCache);
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

  const rootLoading = loadingDirs.has("");
  const filtering = filter.trim().length > 0;

  return (
    <div className={`file-tree-panel docs-theme-${theme}`} style={{ width }}>
      <div className="file-tree-header">
        <div className="file-tree-title" title={folder}>
          {project ? project.name : "Files"}
        </div>
        <div className="file-tree-actions">
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
          <button className="docs-icon-btn" onClick={onClose} title="닫기">
            ×
          </button>
        </div>
      </div>

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

      <div className="file-tree-body">
        {!project && (
          <div className="docs-empty">프로젝트를 선택하면 파일을 볼 수 있습니다.</div>
        )}
        {project && !folder && (
          <div className="docs-empty">
            {project.sshHostId
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
            {visibleRows.map(({ entry, depth }) => {
              const isExpanded = entry.isDir && expanded.has(entry.relativePath);
              const isLoading = entry.isDir && loadingDirs.has(entry.relativePath);
              return (
                <button
                  key={entry.relativePath}
                  className={`file-tree-row ${entry.isDir ? "file-tree-row-dir" : "file-tree-row-file"}`}
                  style={{ paddingLeft: 8 + depth * 16 }}
                  onClick={() => {
                    if (entry.isDir) toggleDir(entry.relativePath);
                    else if (projectId) onOpenFile(projectId, entry.relativePath);
                  }}
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
                </button>
              );
            })}
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
                  className="file-tree-row file-tree-row-file"
                  style={{ paddingLeft: 8 }}
                  onClick={() => {
                    if (projectId) onOpenFile(projectId, entry.relativePath);
                  }}
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
    </div>
  );
}
