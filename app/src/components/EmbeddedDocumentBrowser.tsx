import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { invoke, listen } from "../platform/runtime";
import type { DocumentBrowserSnapshot, RuntimeCommand } from "../platform/ipcContract";

type EmbeddedDocumentBrowserProps = {
  browserId: string;
  documentPath: string;
  active?: boolean;
};

const browserCommands = [
  "document_browser_back",
  "document_browser_forward",
  "document_browser_reload",
  "document_browser_open_external",
] as const satisfies readonly Extract<RuntimeCommand, `document_browser_${string}`>[];

function normalizeBrowserAddress(rawAddress: string) {
  const value = rawAddress.trim();
  if (!value) return "";
  // Keep the address bar intentionally web-only. Bare hostnames are treated
  // like a normal browser address and upgraded to HTTPS; the main process
  // still validates the final URL before navigation.
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

type BrowserLease = {
  mounts: number;
  closeTimer: number | null;
};

type ElementPreview = {
  label?: string;
  tag?: string;
  selector?: string;
  rect?: { width?: number; height?: number };
};

type DeliveryPreview = {
  ok?: boolean;
  error?: string;
  target?: "clipboard" | "session";
};

function asElementPreview(value: unknown): ElementPreview | null {
  return value && typeof value === "object" ? value as ElementPreview : null;
}

function asDeliveryPreview(value: unknown): DeliveryPreview | null {
  return value && typeof value === "object" ? value as DeliveryPreview : null;
}

// A document tab can be remounted while it is dragged to another split pane.
// Keep the native view alive across that one-tick handoff instead of letting
// the old pane close the view that the new pane has just adopted.
const browserLeases = new Map<string, BrowserLease>();

export function EmbeddedDocumentBrowser({
  browserId,
  documentPath,
  active = true,
}: EmbeddedDocumentBrowserProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<DocumentBrowserSnapshot>({
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

  const syncBounds = useCallback(() => {
    if (!active) return;
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width < 2 || height < 2) return;
    void invoke("document_browser_bounds", {
      browserId,
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width,
      height,
    }).catch(() => {});
  }, [active, browserId]);

  useEffect(() => {
    void invoke("document_browser_visibility", {
      browserId,
      visible: active,
    }).then(() => {
      if (active) syncBounds();
    }).catch(() => {});
  }, [active, browserId, syncBounds]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<DocumentBrowserSnapshot>("document-browser:update", (event) => {
        if (active && event.payload?.browserId === browserId) {
          setSnapshot(event.payload);
        }
      });
      try {
        const initial = await invoke<DocumentBrowserSnapshot>("document_browser_ready", {
          browserId,
        });
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

  useLayoutEffect(() => {
    if (!active) return;
    const host = hostRef.current;
    if (!host) return;
    syncBounds();
    const observer = new ResizeObserver(syncBounds);
    observer.observe(host);
    window.addEventListener("resize", syncBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, [syncBounds]);

  useEffect(() => {
    const lease = browserLeases.get(browserId) ?? { mounts: 0, closeTimer: null };
    if (lease.closeTimer !== null) {
      window.clearTimeout(lease.closeTimer);
      lease.closeTimer = null;
    }
    lease.mounts += 1;
    browserLeases.set(browserId, lease);

    return () => {
      const current = browserLeases.get(browserId);
      if (!current) return;
      current.mounts = Math.max(0, current.mounts - 1);
      if (current.mounts > 0 || current.closeTimer !== null) return;
      current.closeTimer = window.setTimeout(() => {
        const latest = browserLeases.get(browserId);
        if (!latest || latest.mounts > 0) return;
        browserLeases.delete(browserId);
        void invoke("document_browser_close", { browserId }).catch(() => {});
      }, 0);
    };
  }, [browserId]);

  const command = (name: (typeof browserCommands)[number]) => {
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

  const toggleInspection = (sendToSession: boolean) => {
    const sameMode = snapshot.inspectionMode === true &&
      Boolean(snapshot.inspectionSendToSession) === sendToSession;
    void invoke("document_browser_inspect", {
      browserId,
      enabled: !sameMode,
      sendToSession,
    }).then((next) => {
      if (next) setSnapshot(next);
    }).catch((error) => {
      setSnapshot((current) => ({ ...current, error: String(error) }));
    });
  };

  const pointedElement = asElementPreview(snapshot.selectedElement || snapshot.hoveredElement);
  const elementName = pointedElement?.label || pointedElement?.selector || pointedElement?.tag || "요소";
  const elementSize = pointedElement?.rect
    ? `${Math.round(pointedElement.rect.width || 0)} × ${Math.round(pointedElement.rect.height || 0)}`
    : "";
  const delivery = asDeliveryPreview(snapshot.annotationDelivery);
  const deliveryLabel = delivery
    ? delivery.ok
      ? delivery.target === "clipboard" ? "클립보드 복사 완료" : "세션 전송 완료"
      : `${delivery.target === "clipboard" ? "클립보드 복사 실패" : "세션 전송 실패"}: ${delivery.error || "알 수 없는 오류"}`
    : "";

  return (
    <div className="embedded-document-browser">
      <header className="document-browser-toolbar embedded-document-browser-toolbar">
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
          <span className="document-browser-title">{snapshot.title}</span>
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
            className={`document-browser-btn${snapshot.inspectionMode && !snapshot.inspectionSendToSession ? " is-active" : ""}`}
            onClick={() => toggleInspection(false)}
            title="DevTools처럼 요소 경계를 표시하고 클릭한 영역을 캡처"
          >
            {snapshot.inspectionMode && !snapshot.inspectionSendToSession ? "선택 취소" : "영역 선택"}
          </button>
          <button
            className={`document-browser-btn${snapshot.inspectionMode && snapshot.inspectionSendToSession ? " is-active" : ""}`}
            onClick={() => toggleInspection(true)}
            disabled={!snapshot.agentId}
            title={snapshot.agentId
              ? "요소를 가리켜 확인한 뒤 클릭하면 이미지·JSON·HTML 문맥을 현재 세션에 전송"
              : "이 문서 탭에 연결된 세션이 없습니다. 터미널의 문서 링크에서 다시 열어 주세요."}
          >
            {snapshot.inspectionMode && snapshot.inspectionSendToSession ? "전송 취소" : "선택 후 전송"}
          </button>
          <button
            className="document-browser-btn"
            onClick={() => command("document_browser_open_external")}
            title="기본 브라우저로 열기"
          >
            기본 브라우저
          </button>
        </div>
      </header>
      {(snapshot.inspectionMode || Boolean(snapshot.selectedElement) || Boolean(snapshot.hoveredElement) || Boolean(snapshot.annotation)) && (
        <div className="document-browser-annotation-bar">
          <span>
            {snapshot.inspectionMode
              ? `요소 선택 모드 · ${elementName}${elementSize ? ` · ${elementSize}` : ""} · 클릭하여 ${snapshot.inspectionSendToSession ? "세션에 전송" : "캡처"} · Esc 취소`
              : Boolean(snapshot.selectedElement)
                ? `선택됨 · ${elementName}${elementSize ? ` · ${elementSize}` : ""}`
                : "가리킨 영역"}
            {snapshot.annotation ? " · 캡처됨" : ""}
            {deliveryLabel ? ` · ${deliveryLabel}` : ""}
          </span>
          {Boolean(snapshot.annotation) && (
            <details>
              <summary>JSON/HTML 문맥 보기</summary>
              <pre>{String(JSON.stringify(snapshot.annotation, null, 2))}</pre>
            </details>
          )}
        </div>
      )}
      <div ref={hostRef} className="embedded-document-browser-host" aria-label="HTML 문서 브라우저" />
    </div>
  );
}
