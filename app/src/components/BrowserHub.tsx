import { useEffect, useMemo, useState } from "react";
import { invoke } from "../platform/runtime";
import type { DocumentBrowserSnapshot } from "../platform/ipcContract";
import { EmbeddedDocumentBrowser } from "./EmbeddedDocumentBrowser";

type BrowserHubProps = {
  browsers: DocumentBrowserSnapshot[];
  selectedBrowserId: string | null;
  agentNames: ReadonlyMap<string, string>;
  onSelectBrowser: (browserId: string) => void;
  onCreateBrowser: () => Promise<void>;
  onCloseBrowser: (browserId: string) => Promise<void>;
};

export function browserHubTabTitle(browser: DocumentBrowserSnapshot) {
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
  const path = browser.relativePath.trim();
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
    <main className="terminal-area browser-hub" aria-label="브라우저 모아보기">
      <div className="browser-hub-tabs" role="tablist" aria-label="열린 브라우저 탭">
        {browsers.map((browser) => {
          const active = browser.browserId === selectedBrowserId;
          const agentName = browser.agentId
            ? agentNames.get(browser.agentId) ?? "연결된 세션"
            : null;
          const title = browserHubTabTitle(browser);
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
                <span className="browser-hub-tab-icon" aria-hidden="true">WEB</span>
                <span className="browser-hub-tab-title">{title}</span>
                {browser.loading && <span className="browser-hub-tab-loading" aria-label="불러오는 중" />}
                {agentName && <span className="browser-hub-tab-agent">{agentName}</span>}
              </button>
              <button
                className="browser-hub-tab-close"
                onClick={() => closeBrowser(browser.browserId)}
                disabled={busyBrowserId === browser.browserId}
                aria-label={`${title} 닫기`}
                title="브라우저 닫기"
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
          title="새 브라우저"
          aria-label="새 브라우저"
        >
          +
        </button>
        <span className="browser-hub-tab-spacer" />
        <span className="browser-hub-count">{browsers.length}개</span>
      </div>

      <div className="browser-hub-content">
        {selectedBrowser && attachedBrowserId === selectedBrowser.browserId ? (
          <EmbeddedDocumentBrowser
            key={selectedBrowser.browserId}
            browserId={selectedBrowser.browserId}
            documentPath={selectedBrowser.url || selectedBrowser.relativePath || "새 브라우저"}
            active
          />
        ) : selectedBrowser ? (
          <div className="browser-hub-empty">브라우저 연결 중…</div>
        ) : (
          <div className="browser-hub-empty">
            <span className="browser-hub-empty-icon" aria-hidden="true">WEB</span>
            <strong>열린 브라우저가 없습니다</strong>
            <span>새 탭을 열면 에이전트와 함께 사용하는 브라우저가 여기에 모입니다.</span>
            <button onClick={createBrowser} disabled={creating}>
              {creating ? "여는 중…" : "새 브라우저 열기"}
            </button>
          </div>
        )}
        {error && <div className="browser-hub-error" role="alert">{error}</div>}
      </div>
    </main>
  );
}
