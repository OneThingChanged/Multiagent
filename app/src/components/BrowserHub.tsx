import { useEffect, useMemo, useState } from "react";
import { docKindForPath } from "../lib/docTabs";
import { invoke } from "../platform/runtime";
import type { DocumentBrowserSnapshot } from "../platform/ipcContract";
import { EmbeddedDocumentBrowser } from "./EmbeddedDocumentBrowser";
import { useAppLanguage } from "../lib/appLanguage";

type BrowserHubProps = {
  browsers: DocumentBrowserSnapshot[];
  selectedBrowserId: string | null;
  agentNames: ReadonlyMap<string, string>;
  onSelectBrowser: (browserId: string) => void;
  onCreateBrowser: () => Promise<void>;
  onCloseBrowser: (browserId: string) => Promise<void>;
};

export function isHtmlDocumentBrowser(browser: DocumentBrowserSnapshot) {
  const path = browser.relativePath.trim();
  return Boolean(
    path && !/^https?:\/\//i.test(path) && docKindForPath(path) === "html",
  );
}

export function browserHubTabTitle(browser: DocumentBrowserSnapshot) {
  const path = browser.relativePath.trim();
  if (isHtmlDocumentBrowser(browser)) {
    return path.split(/[\\/]/).pop() || path;
  }

  const title = browser.title.trim();
  const url = browser.url.trim();
  if (title && title !== "about:blank") {
    try {
      const parsedTitle = new URL(title);
      if (parsedTitle.protocol === "http:" || parsedTitle.protocol === "https:") {
        return parsedTitle.hostname || parsedTitle.pathname || "새 탭";
      }
    } catch {
      return title;
    }
  }
  if (url && url !== "about:blank") {
    try {
      const parsed = new URL(url);
      return parsed.hostname || parsed.pathname || "새 탭";
    } catch {
      return url;
    }
  }
  if (path) return path.split(/[\\/]/).pop() || path;
  return "새 탭";
}

export function BrowserHub({
  browsers,
  selectedBrowserId,
  agentNames,
  onSelectBrowser,
  onCreateBrowser,
  onCloseBrowser,
}: BrowserHubProps) {
  const { text } = useAppLanguage();
  const [attachedBrowserId, setAttachedBrowserId] = useState<string | null>(null);
  const [attachRequest, setAttachRequest] = useState(0);
  const [busyBrowserId, setBusyBrowserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedBrowser = useMemo(
    () => browsers.find((browser) => browser.browserId === selectedBrowserId) ?? null,
    [browsers, selectedBrowserId]
  );
  const selectedBrowserExists = selectedBrowser !== null;

  useEffect(() => {
    if (!selectedBrowserId || !selectedBrowserExists) {
      setAttachedBrowserId(null);
      return;
    }
    let cancelled = false;
    setAttachedBrowserId(null);
    setError(null);
    void invoke("document_browser_attach", { browserId: selectedBrowserId })
      .then(() => {
        if (!cancelled) setAttachedBrowserId(selectedBrowserId);
      })
      .catch((attachError) => {
        if (!cancelled) setError(String(attachError));
      });
    return () => {
      cancelled = true;
    };
  }, [attachRequest, selectedBrowserExists, selectedBrowserId]);

  const selectBrowser = (browserId: string) => {
    if (browserId === selectedBrowserId) {
      // A browser may have been claimed by another workspace window. Clicking
      // the already-selected tab explicitly reattaches it here.
      setAttachRequest((current) => current + 1);
    }
    onSelectBrowser(browserId);
  };

  const createBrowser = () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    void onCreateBrowser()
      .catch((createError) => setError(String(createError)))
      .finally(() => setCreating(false));
  };

  const closeBrowser = (browserId: string) => {
    if (busyBrowserId) return;
    setBusyBrowserId(browserId);
    setError(null);
    void onCloseBrowser(browserId)
      .catch((closeError) => setError(String(closeError)))
      .finally(() => setBusyBrowserId(null));
  };

  return (
    <main className="terminal-area browser-hub" aria-label={text("브라우저 모아보기", "Browser hub")}>
      <div className="browser-hub-tabs" role="tablist" aria-label={text("열린 브라우저 탭", "Open browser tabs")}>
        {browsers.map((browser) => {
          const active = browser.browserId === selectedBrowserId;
          const agentName = browser.agentId
            ? agentNames.get(browser.agentId) ?? text("연결된 세션", "Connected session")
            : null;
          const title = browserHubTabTitle(browser);
          const isHtmlDocument = isHtmlDocumentBrowser(browser);
          return (
            <div
              key={browser.browserId}
              className={`browser-hub-tab${active ? " is-active" : ""}`}
              title={[title, browser.url, agentName].filter(Boolean).join(" · ")}
            >
              <button
                className="browser-hub-tab-select"
                role="tab"
                aria-selected={active}
                onClick={() => selectBrowser(browser.browserId)}
              >
                <span
                  className={`browser-hub-tab-icon${isHtmlDocument ? " is-html" : ""}`}
                  aria-hidden="true"
                >
                  {isHtmlDocument ? "HTML" : "WEB"}
                </span>
                <span className="browser-hub-tab-title">{title}</span>
                {browser.loading && <span className="browser-hub-tab-loading" aria-label={text("불러오는 중", "Loading")} />}
                {agentName && <span className="browser-hub-tab-agent">{agentName}</span>}
              </button>
              <button
                className="browser-hub-tab-close"
                onClick={() => closeBrowser(browser.browserId)}
                disabled={busyBrowserId === browser.browserId}
                aria-label={text(`${title} 닫기`, `Close ${title}`)}
                title={text("브라우저 닫기", "Close browser")}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          className="browser-hub-new-tab"
          onClick={createBrowser}
          disabled={creating}
          title={text("새 브라우저", "New browser")}
          aria-label={text("새 브라우저", "New browser")}
        >
          +
        </button>
        <span className="browser-hub-tab-spacer" />
        <span className="browser-hub-count">{text(`${browsers.length}개`, String(browsers.length))}</span>
      </div>

      <div className="browser-hub-content">
        {selectedBrowser && attachedBrowserId === selectedBrowser.browserId ? (
          <EmbeddedDocumentBrowser
            key={selectedBrowser.browserId}
            browserId={selectedBrowser.browserId}
            documentPath={selectedBrowser.url || selectedBrowser.relativePath || text("새 브라우저", "New browser")}
            active
          />
        ) : selectedBrowser ? (
          <div className="browser-hub-empty">{text("브라우저 연결 중…", "Connecting to browser…")}</div>
        ) : (
          <div className="browser-hub-empty">
            <span className="browser-hub-empty-icon" aria-hidden="true">WEB</span>
            <strong>{text("열린 브라우저가 없습니다", "No browsers are open")}</strong>
            <span>{text("새 탭을 열면 에이전트와 함께 사용하는 브라우저가 여기에 모입니다.", "Browsers shared with agents appear here when you open a new tab.")}</span>
            <button onClick={createBrowser} disabled={creating}>
              {creating ? text("여는 중…", "Opening…") : text("새 브라우저 열기", "Open new browser")}
            </button>
          </div>
        )}
        {error && <div className="browser-hub-error" role="alert">{error}</div>}
      </div>
    </main>
  );
}
