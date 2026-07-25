import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Project } from "../types";
import type { AppThemeId } from "../lib/appTheme";
import type { TextFileResult, DocAssetResult } from "../platform/ipcContract";
import { docKindForPath, parseDocTabId, type DocKind } from "../lib/docTabs";
import {
  htmlNeedsAssetInlining,
  inlineHtmlAssets,
} from "../lib/htmlAssets";

function joinFolderPath(folder: string, relativePath: string) {
  return `${folder.replace(/[\\/]+$/, "")}/${relativePath}`;
}

function displayPath(path: string) {
  return path.replace(/\//g, " / ");
}

function languageForPath(path: string) {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// Wrap raw source in a markdown fence so the existing ReactMarkdown +
// rehype-highlight pipeline renders it — no extra dependency needed. The
// fence must be longer than any backtick run inside the content.
function fencedSource(content: string, language: string) {
  const longestRun = content.match(/`+/g)?.reduce(
    (max, run) => Math.max(max, run.length),
    0
  ) ?? 0;
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

// Injected into HTML doc tabs so http(s) links respond: Ctrl/Cmd+click (or
// middle-click) opens the OS browser via window.open → the main process's
// window-open handler (shell.openExternal); plain clicks are swallowed so a
// stray click can't navigate the sandboxed frame. The document's OWN scripts
// stay blocked — the app CSP only whitelists this exact text by hash
// (index.html script-src 'sha256-…'). If you change ANY character here,
// recompute the hash: node -e "console.log(require('crypto').createHash(
// 'sha256').update(SCRIPT,'utf8').digest('base64'))"
const DOC_LINK_SCRIPT =
  'document.addEventListener("click",function(e){var t=e.target,a=t&&t.closest?t.closest("a[href]"):null;if(!a)return;var h=a.href||"";if(/^https?:/i.test(h)){e.preventDefault();if(e.ctrlKey||e.metaKey)window.open(h,"_blank","noopener")}else if(!/^#/.test(a.getAttribute("href")||""))e.preventDefault()},!0);document.addEventListener("auxclick",function(e){if(1!==e.button)return;var t=e.target,a=t&&t.closest?t.closest("a[href]"):null;if(!a)return;var h=a.href||"";if(/^https?:/i.test(h)){e.preventDefault();window.open(h,"_blank","noopener")}},!0);';

type DocViewerState =
  | { phase: "loading" }
  | { phase: "markdown"; content: string }
  | { phase: "html"; content: string }
  | { phase: "image"; dataUrl: string }
  | { phase: "text"; content: string; language: string }
  | { phase: "binary"; reason: "binary" | "too_large"; size?: number }
  | { phase: "error"; message: string };

export function DocViewer({
  docId,
  project,
  theme,
}: {
  docId: string;
  project: Project | null;
  theme: AppThemeId;
}) {
  const ref = parseDocTabId(docId);
  const folder = project?.folder ?? "";
  const relativePath = ref?.relativePath ?? "";
  const [state, setState] = useState<DocViewerState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!relativePath) {
      setState({ phase: "error", message: "잘못된 문서 탭입니다." });
      return;
    }
    if (!folder) {
      setState({
        phase: "error",
        message: "프로젝트 폴더를 찾을 수 없습니다. (프로젝트가 삭제되었을 수 있음)",
      });
      return;
    }

    let cancelled = false;
    setState({ phase: "loading" });
    const kind: DocKind = docKindForPath(relativePath);

    const load = async () => {
      if (kind === "markdown" || kind === "html") {
        const content = await invoke<string>("read_markdown_file", {
          folder,
          relativePath,
        });
        if (cancelled) return;
        if (kind === "markdown") {
          setState({ phase: "markdown", content });
          return;
        }
        // HTML renders in a srcDoc iframe (about:srcdoc), so relative images,
        // css url()s and linked stylesheets can't resolve on their own. Inline
        // local assets (scoped to the project root) so they display.
        let html = content;
        if (htmlNeedsAssetInlining(content)) {
          html = await inlineHtmlAssets(content, {
            htmlRelative: relativePath,
            readAsset: (containerRelative, ref) =>
              invoke<DocAssetResult>("read_doc_asset", {
                folder,
                containerRelative,
                ref,
              }).catch(() => null),
          });
        }
        if (cancelled) return;
        setState({ phase: "html", content: html });
        return;
      }
      if (kind === "image") {
        const dataUrl = await invoke<string>("read_image_data_url", {
          path: joinFolderPath(folder, relativePath),
          folder,
        });
        if (cancelled) return;
        setState({ phase: "image", dataUrl });
        return;
      }
      const result = await invoke<TextFileResult>("read_text_file", {
        folder,
        relativePath,
      });
      if (cancelled) return;
      if (result.kind === "text") {
        setState({
          phase: "text",
          content: result.content,
          language: languageForPath(relativePath),
        });
      } else if (result.kind === "too_large") {
        setState({ phase: "binary", reason: "too_large", size: result.size });
      } else {
        setState({ phase: "binary", reason: "binary" });
      }
    };

    load().catch((err) => {
      if (!cancelled) setState({ phase: "error", message: String(err) });
    });

    return () => {
      cancelled = true;
    };
  }, [docId, folder, relativePath, reloadKey]);

  const fullPath = folder && relativePath
    ? joinFolderPath(folder, relativePath)
    : null;

  const openLocal = () => {
    if (fullPath) invoke("open_local_path", { path: fullPath }).catch(() => {});
  };
  const revealLocal = () => {
    if (fullPath) invoke("reveal_local_path", { path: fullPath }).catch(() => {});
  };

  return (
    <div className={`doc-view docs-theme-${theme}`}>
      <div className="doc-view-header">
        <div className="doc-view-path" title={relativePath}>
          {displayPath(relativePath)}
        </div>
        <div className="doc-view-actions">
          <button
            className="docs-tool-btn"
            onClick={() => setReloadKey((v) => v + 1)}
            title="다시 읽기"
          >
            Refresh
          </button>
          <button
            className="docs-tool-btn"
            onClick={openLocal}
            disabled={!fullPath}
            title="OS 기본 앱으로 열기"
          >
            Open
          </button>
          <button
            className="docs-tool-btn"
            onClick={revealLocal}
            disabled={!fullPath}
            title="탐색기에서 보기"
          >
            Reveal
          </button>
        </div>
      </div>
      <div className="doc-view-body">
        {state.phase === "loading" && (
          <div className="docs-empty">Loading...</div>
        )}
        {state.phase === "markdown" && (
          <div className="docs-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeHighlight, { detect: true }]]}
            >
              {state.content}
            </ReactMarkdown>
          </div>
        )}
        {state.phase === "html" && (
          <iframe
            className="doc-html-frame"
            sandbox="allow-scripts allow-popups"
            srcDoc={`${state.content}\n<script>${DOC_LINK_SCRIPT}</script>`}
            title={`${relativePath} — 링크는 Ctrl+클릭으로 브라우저에서 열립니다`}
          />
        )}
        {state.phase === "image" && (
          <div className="doc-image-wrap">
            <img
              className="doc-image"
              src={state.dataUrl}
              alt={relativePath}
            />
          </div>
        )}
        {state.phase === "text" && (
          <div className="docs-content doc-source">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeHighlight, { detect: true }]]}
            >
              {fencedSource(state.content, state.language)}
            </ReactMarkdown>
          </div>
        )}
        {state.phase === "binary" && (
          <div className="doc-fallback">
            <div className="doc-fallback-title">
              {state.reason === "too_large"
                ? `파일이 너무 큽니다 (${Math.round((state.size ?? 0) / 1024)} KB)`
                : "미리볼 수 없는 파일입니다"}
            </div>
            <div className="doc-fallback-actions">
              <button className="docs-tool-btn" onClick={openLocal}>
                OS로 열기
              </button>
              <button className="docs-tool-btn" onClick={revealLocal}>
                탐색기에서 보기
              </button>
            </div>
          </div>
        )}
        {state.phase === "error" && (
          <div className="doc-fallback">
            <div className="doc-fallback-title doc-fallback-error">
              {state.message}
            </div>
            <div className="doc-fallback-actions">
              <button
                className="docs-tool-btn"
                onClick={() => setReloadKey((v) => v + 1)}
              >
                Retry
              </button>
              {fullPath && (
                <button className="docs-tool-btn" onClick={revealLocal}>
                  탐색기에서 보기
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
