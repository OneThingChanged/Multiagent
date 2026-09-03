import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Project } from "../types";
import type { AppThemeId } from "../lib/appTheme";
import type { TextFileResult } from "../platform/ipcContract";
import { docKindForPath, parseDocTabId, type DocKind } from "../lib/docTabs";
import { EmbeddedDocumentBrowser } from "./EmbeddedDocumentBrowser";

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

type DocViewerState =
  | { phase: "loading" }
  | { phase: "markdown"; content: string }
  | { phase: "html"; content: string | null }
  | { phase: "image"; dataUrl: string }
  | { phase: "text"; content: string; language: string }
  | { phase: "binary"; reason: "binary" | "too_large"; size?: number }
  | { phase: "error"; message: string };

export function DocViewer({
  docId,
  project,
  theme,
  agentId,
}: {
  docId: string;
  project: Project | null;
  theme: AppThemeId;
  agentId?: string | null;
}) {
  const ref = parseDocTabId(docId);
  const folder = project?.folder ?? "";
  const relativePath = ref?.relativePath ?? "";
  const [state, setState] = useState<DocViewerState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [embeddedBrowser, setEmbeddedBrowser] = useState<{
    browserId: string;
    docId: string;
  } | null>(null);
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
    setEmbeddedBrowser(null);
    setState({ phase: "loading" });
    const kind: DocKind = docKindForPath(relativePath);

    const load = async () => {
      // Do not copy arbitrary project HTML into the trusted application
      // renderer. The Electron Document Browser validates and streams it
      // through the isolated preview origin before it is shown.
      if (kind === "html") {
        try {
          const result = await invoke<{ browserId: string }>("document_browser_open", {
            folder,
            relativePath,
            sourceTabId: docId,
            ...(agentId ? { agentId } : {}),
          });
          if (cancelled) return;
          setEmbeddedBrowser({ browserId: result.browserId, docId });
          setState({ phase: "html", content: null });
        } catch (error) {
          if (!cancelled) setState({ phase: "error", message: String(error) });
        }
        return;
      }
      if (kind === "markdown") {
        const content = await invoke<string>("read_markdown_file", {
          folder,
          relativePath,
        });
        if (cancelled) return;
        setState({ phase: "markdown", content });
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
  }, [docId, folder, relativePath, reloadKey, agentId]);

  const fullPath = folder && relativePath
    ? joinFolderPath(folder, relativePath)
    : null;

  const openLocal = () => {
    if (fullPath) invoke("open_local_path", { path: fullPath }).catch(() => {});
  };
  const revealLocal = () => {
    if (fullPath) invoke("reveal_local_path", { path: fullPath }).catch(() => {});
  };
  const openBrowser = async () => {
    if (!folder || !relativePath) return;
    try {
      const result = await invoke<{ browserId: string }>("document_browser_open", {
        folder,
        relativePath,
        sourceTabId: docId,
        ...(agentId ? { agentId } : {}),
      });
      setEmbeddedBrowser({ browserId: result.browserId, docId });
    } catch (error) {
      setState({ phase: "error", message: String(error) });
    }
  };
  const browserOpenForThisDocument = embeddedBrowser?.docId === docId;
  const usesEmbeddedHtmlBrowser = docKindForPath(relativePath) === "html";

  return (
    <div className={`doc-view docs-theme-${theme}`}>
      {!usesEmbeddedHtmlBrowser && (
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
      )}
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
        {state.phase === "html" && browserOpenForThisDocument && embeddedBrowser && (
          <EmbeddedDocumentBrowser
            browserId={embeddedBrowser.browserId}
            documentPath={relativePath}
          />
        )}
        {state.phase === "html" && !browserOpenForThisDocument && (
          <div className="doc-html-launch">
            <div className="doc-html-launch-icon">HTML</div>
            <div className="doc-html-launch-title">전용 브라우저에서 문서 열기</div>
            <div className="doc-html-launch-copy">
              상대경로 CSS, JavaScript, 이미지, 폰트와 미디어를 원본 경로 그대로 불러옵니다.
              프로젝트 폴더 밖의 파일과 Electron 권한은 차단됩니다.
            </div>
            <div className="doc-fallback-actions">
              <button className="docs-tool-btn docs-tool-btn-primary" onClick={openBrowser}>
                전용 브라우저로 열기
              </button>
            </div>
          </div>
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
