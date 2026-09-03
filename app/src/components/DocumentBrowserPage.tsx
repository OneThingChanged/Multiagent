import { useEffect, useState, type FormEvent } from "react";
import { invoke, listen } from "../platform/runtime";
import type { DocumentBrowserSnapshot, RuntimeCommand } from "../platform/ipcContract";

type BrowserSnapshot = DocumentBrowserSnapshot;

function normalizeBrowserAddress(rawAddress: string) {
  const value = rawAddress.trim();
  if (!value) return "";
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

function browserQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    browserId: params.get("browserId") || "",
    documentPath: params.get("documentPath") || "",
  };
}

export function isDocumentBrowserPage() {
  return new URLSearchParams(window.location.search).get("documentBrowser") === "1";
}

export function DocumentBrowserPage() {
  const { browserId, documentPath } = browserQuery();
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>({
    browserId,
    title: documentPath.split("/").pop() || documentPath || "HTML 문서",
    relativePath: documentPath,
    url: "",
    canGoBack: false,
    canGoForward: false,
    loading: true,
  });
  const [address, setAddress] = useState(documentPath);

  useEffect(() => {
    const nextAddress = snapshot.url || snapshot.relativePath || documentPath;
    if (nextAddress) setAddress(nextAddress);
  }, [documentPath, snapshot.relativePath, snapshot.url]);

  useEffect(() => {
    if (!browserId) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<BrowserSnapshot>("document-browser:update", (event) => {
        if (active && event.payload?.browserId === browserId) {
          setSnapshot(event.payload);
        }
      });
      try {
        const initial = await invoke<BrowserSnapshot>("document_browser_ready", { browserId });
        if (active && initial) setSnapshot(initial);
      } catch (error) {
        if (active) {
          setSnapshot((current) => ({
            ...current,
            loading: false,
            error: String(error),
          }));
        }
      }
    })();
    return () => {
      active = false;
      unlisten?.();
    };
  }, [browserId]);

  const command = (name: Extract<RuntimeCommand, `document_browser_${string}`>) => {
    void invoke(name, { browserId }).catch((error) => {
      setSnapshot((current) => ({ ...current, error: String(error) }));
    });
  };

  const navigate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = normalizeBrowserAddress(address);
    if (!url) return;
    void invoke("document_browser_navigate", { browserId, url }).catch((error) => {
      setSnapshot((current) => ({ ...current, loading: false, error: String(error) }));
    });
  };

  return (
    <main className="document-browser-page">
      <header className="document-browser-toolbar">
        <div className="document-browser-nav">
          <button
            className="document-browser-btn"
            disabled={!snapshot.canGoBack}
            onClick={() => command("document_browser_back")}
            title="뒤로가기"
          >
            ←
          </button>
          <button
            className="document-browser-btn"
            disabled={!snapshot.canGoForward}
            onClick={() => command("document_browser_forward")}
            title="앞으로가기"
          >
            →
          </button>
          <button
            className="document-browser-btn"
            onClick={() => command("document_browser_reload")}
            title="새로고침"
          >
            ↻
          </button>
        </div>
        <form
          className="document-browser-location document-browser-address-form"
          onSubmit={navigate}
          title="주소를 입력하고 Enter로 이동"
        >
          <input
            className="document-browser-address"
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="브라우저 주소"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {snapshot.loading && <span className="document-browser-status-inline">불러오는 중…</span>}
          {!snapshot.loading && snapshot.error && (
            <span className="document-browser-status-inline document-browser-error">
              {snapshot.error}
            </span>
          )}
        </form>
        <div className="document-browser-actions">
          <button
            className="document-browser-btn"
            onClick={() => command("document_browser_open_external")}
            title="기본 브라우저로 열기"
          >
            기본 브라우저
          </button>
          <button
            className="document-browser-btn document-browser-close"
            onClick={() => command("document_browser_close")}
            title="닫기"
          >
            닫기
          </button>
        </div>
      </header>
    </main>
  );
}
