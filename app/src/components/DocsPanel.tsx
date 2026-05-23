import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Agent } from "../types";
import type { AppThemeId } from "../lib/appTheme";

type MarkdownFile = {
  name: string;
  relative_path: string;
};

type DocsNavMode = "list" | "tree" | "hidden";

type DocsTreeNode = {
  name: string;
  path: string;
  folders: DocsTreeNode[];
  files: MarkdownFile[];
};

type MutableDocsTreeNode = {
  name: string;
  path: string;
  folders: Map<string, MutableDocsTreeNode>;
  files: MarkdownFile[];
};

const NAV_MODE_LABEL: Record<DocsNavMode, string> = {
  list: "List",
  tree: "Tree",
  hidden: "Hide",
};

function nextNavMode(mode: DocsNavMode): DocsNavMode {
  if (mode === "list") return "tree";
  if (mode === "tree") return "hidden";
  return "list";
}

function bestInitialPath(files: MarkdownFile[]) {
  return (
    files.find((file) => file.relative_path.toLowerCase() === "readme.md")
      ?.relative_path ??
    files.find((file) =>
      file.relative_path.toLowerCase().endsWith("/readme.md")
    )?.relative_path ??
    files[0]?.relative_path ??
    null
  );
}

function displayPath(path: string) {
  return path.replace(/\//g, " / ");
}

function joinFolderPath(folder: string, relativePath: string) {
  return `${folder.replace(/[\\/]+$/, "")}/${relativePath}`;
}

function fileNameFromPath(path: string) {
  const parts = path.split("/");
  return parts[parts.length - 1] || "document.md";
}

function buildDocsTree(files: MarkdownFile[]): DocsTreeNode {
  const root: MutableDocsTreeNode = {
    name: "",
    path: "",
    folders: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.relative_path.split("/").filter(Boolean);
    let node = root;
    for (const folderName of parts.slice(0, -1)) {
      const folderPath = node.path ? `${node.path}/${folderName}` : folderName;
      let child = node.folders.get(folderName);
      if (!child) {
        child = {
          name: folderName,
          path: folderPath,
          folders: new Map(),
          files: [],
        };
        node.folders.set(folderName, child);
      }
      node = child;
    }
    node.files.push(file);
  }

  const freezeNode = (node: MutableDocsTreeNode): DocsTreeNode => ({
    name: node.name,
    path: node.path,
    folders: Array.from(node.folders.values())
      .map(freezeNode)
      .sort((a, b) => a.name.localeCompare(b.name)),
    files: [...node.files].sort((a, b) => a.name.localeCompare(b.name)),
  });

  return freezeNode(root);
}

function folderPathsFromFiles(files: MarkdownFile[]) {
  const paths = new Set<string>();
  for (const file of files) {
    const parts = file.relative_path.split("/").filter(Boolean);
    let current = "";
    for (const folder of parts.slice(0, -1)) {
      current = current ? `${current}/${folder}` : folder;
      paths.add(current);
    }
  }
  return paths;
}

function ancestorFolderPaths(path: string) {
  const parts = path.split("/").filter(Boolean);
  const ancestors: string[] = [];
  let current = "";
  for (const folder of parts.slice(0, -1)) {
    current = current ? `${current}/${folder}` : folder;
    ancestors.push(current);
  }
  return ancestors;
}

export function DocsPanel({
  open,
  activeAgent,
  width,
  requestedPath,
  requestKey,
  theme,
  onClose,
}: {
  open: boolean;
  activeAgent: Agent | null;
  width: number;
  requestedPath: string | null;
  requestKey: number;
  theme: AppThemeId;
  onClose: () => void;
}) {
  const folder = activeAgent?.folder ?? "";
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [navMode, setNavMode] = useState<DocsNavMode>("list");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setSelectedPath(null);
    setContent("");
    setError(null);
  }, [folder]);

  useEffect(() => {
    if (!open || !folder) {
      setFiles([]);
      return;
    }

    let cancelled = false;
    setListLoading(true);
    setError(null);
    invoke<MarkdownFile[]>("list_markdown_files", { folder })
      .then((nextFiles) => {
        if (cancelled) return;
        setFiles(nextFiles);
        setSelectedPath((current) =>
          requestedPath ??
          (current && nextFiles.some((file) => file.relative_path === current)
            ? current
            : bestInitialPath(nextFiles))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setFiles([]);
        setSelectedPath(null);
        setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, folder, reloadKey, requestedPath]);

  useEffect(() => {
    if (!open || !folder || !requestedPath) return;
    setSelectedPath(requestedPath);
  }, [open, folder, requestedPath, requestKey]);

  useEffect(() => {
    setExpandedFolders(folderPathsFromFiles(files));
  }, [files]);

  useEffect(() => {
    if (!selectedPath) return;
    const ancestors = ancestorFolderPaths(selectedPath);
    if (ancestors.length === 0) return;
    setExpandedFolders((current) => {
      let changed = false;
      const next = new Set(current);
      for (const ancestor of ancestors) {
        if (!next.has(ancestor)) {
          next.add(ancestor);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedPath]);

  useEffect(() => {
    if (!open || !folder || !selectedPath) {
      setContent("");
      return;
    }

    let cancelled = false;
    setDocLoading(true);
    setError(null);
    invoke<string>("read_markdown_file", {
      folder,
      relativePath: selectedPath,
    })
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent);
      })
      .catch((err) => {
        if (!cancelled) {
          setContent("");
          setError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, folder, selectedPath, reloadKey]);

  const selectedFile = useMemo(
    () =>
      files.find((file) => file.relative_path === selectedPath) ??
      (selectedPath
        ? { name: fileNameFromPath(selectedPath), relative_path: selectedPath }
        : null),
    [files, selectedPath]
  );
  const docsTree = useMemo(() => buildDocsTree(files), [files]);
  const selectedFullPath =
    folder && selectedPath ? joinFolderPath(folder, selectedPath) : null;

  const toggleFolder = (path: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderTreeNode = (node: DocsTreeNode, depth: number): ReactNode => (
    <>
      {node.files.map((file) => (
        <button
          key={file.relative_path}
          className={`docs-tree-file ${
            file.relative_path === selectedPath ? "docs-file-active" : ""
          }`}
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => setSelectedPath(file.relative_path)}
          title={file.relative_path}
        >
          <span className="docs-tree-icon docs-tree-icon-md">MD</span>
          <span className="docs-tree-file-name">{file.name}</span>
        </button>
      ))}
      {node.folders.map((folderNode) => {
        const expanded = expandedFolders.has(folderNode.path);
        return (
          <div key={folderNode.path} className="docs-tree-group">
            <button
              className="docs-tree-folder"
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => toggleFolder(folderNode.path)}
              title={folderNode.path}
            >
              <span className="docs-tree-caret">{expanded ? "▾" : "▸"}</span>
              <span className="docs-tree-icon docs-tree-icon-folder" />
              <span className="docs-tree-folder-name">{folderNode.name}</span>
            </button>
            {expanded && renderTreeNode(folderNode, depth + 1)}
          </div>
        );
      })}
    </>
  );

  if (!open) return null;

  return (
    <aside className={`docs-panel docs-theme-${theme}`} style={{ width }}>
      <div className="docs-header">
        <div className="docs-title-block">
          <div className="docs-title">Docs</div>
          <div className="docs-subtitle" title={activeAgent?.folder ?? ""}>
            {activeAgent ? activeAgent.name : "No active agent"}
          </div>
        </div>
        <button className="docs-icon-btn" onClick={onClose} title="Close docs">
          ×
        </button>
      </div>

      <div className="docs-toolbar">
        <button
          className="docs-tool-btn"
          onClick={() => setReloadKey((v) => v + 1)}
          disabled={!folder || listLoading || docLoading}
        >
          Refresh
        </button>
        <button
          className={`docs-tool-btn docs-nav-toggle-btn ${
            navMode !== "hidden" ? "docs-tool-active" : ""
          }`}
          onClick={() => setNavMode((mode) => nextNavMode(mode))}
          disabled={!folder}
          title="List → Tree → Hide"
        >
          View: {NAV_MODE_LABEL[navMode]}
        </button>
        <button
          className="docs-tool-btn"
          onClick={() => selectedFullPath && openPath(selectedFullPath)}
          disabled={!selectedFullPath}
        >
          Open
        </button>
        <button
          className="docs-tool-btn"
          onClick={() => selectedFullPath && revealItemInDir(selectedFullPath)}
          disabled={!selectedFullPath}
        >
          Reveal
        </button>
      </div>

      {!activeAgent && (
        <div className="docs-empty">에이전트를 선택하면 문서를 볼 수 있습니다.</div>
      )}

      {activeAgent && !folder && (
        <div className="docs-empty">선택된 에이전트에 폴더가 없습니다.</div>
      )}

      {activeAgent && folder && (
        <>
          <div className={`docs-main docs-nav-${navMode}`}>
            {navMode !== "hidden" && (
              <div className="docs-file-list">
                {listLoading && <div className="docs-empty">Loading...</div>}
                {!listLoading && files.length === 0 && (
                  <div className="docs-empty">Markdown 파일이 없습니다.</div>
                )}
                {!listLoading &&
                  navMode === "list" &&
                  files.map((file) => (
                    <button
                      key={file.relative_path}
                      className={`docs-file ${
                        file.relative_path === selectedPath
                          ? "docs-file-active"
                          : ""
                      }`}
                      onClick={() => setSelectedPath(file.relative_path)}
                      title={file.relative_path}
                    >
                      <span className="docs-file-name">{file.name}</span>
                      <span className="docs-file-path">
                        {displayPath(file.relative_path)}
                      </span>
                    </button>
                  ))}
                {!listLoading && navMode === "tree" && (
                  <div className="docs-tree">{renderTreeNode(docsTree, 0)}</div>
                )}
              </div>
            )}

            <div className="docs-content-wrap">
              {error && <div className="docs-error">{error}</div>}
              {!error && docLoading && (
                <div className="docs-empty">Loading...</div>
              )}
              {!error && !docLoading && selectedFile && (
                <>
                  <div className="docs-current" title={selectedFile.relative_path}>
                    {displayPath(selectedFile.relative_path)}
                  </div>
                  <div className="docs-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[rehypeHighlight, { detect: true }]]}
                    >
                      {content}
                    </ReactMarkdown>
                  </div>
                </>
              )}
              {!error && !docLoading && !selectedFile && files.length === 0 && (
                <div className="docs-empty">Markdown 파일이 없습니다.</div>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
