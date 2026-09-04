import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  areNativeViewsOccluded,
  subscribeNativeViewOcclusion,
} from "../lib/nativeViewOcclusion";
import { invoke, listen } from "../platform/runtime";
import type { DocumentBrowserSnapshot, RuntimeCommand } from "../platform/ipcContract";
import { useAppLanguage } from "../lib/appLanguage";

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

export function EmbeddedDocumentBrowser({
  browserId,
  documentPath,
  active = true,
}: EmbeddedDocumentBrowserProps) {
  const { text } = useAppLanguage();
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
  const [nativeViewsOccluded, setNativeViewsOccluded] = useState(areNativeViewsOccluded);
  const browserVisible = active && !nativeViewsOccluded;

  useEffect(
    () => subscribeNativeViewOcclusion(setNativeViewsOccluded),
    [],
  );

  useEffect(() => {
    const nextAddress = snapshot.url || snapshot.relativePath || documentPath;
    if (nextAddress) setAddress(nextAddress);
  }, [documentPath, snapshot.relativePath, snapshot.url]);

  const syncBounds = useCallback(() => {
    if (!browserVisible) return;
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
  }, [browserId, browserVisible]);

  useLayoutEffect(() => {
    void invoke("document_browser_visibility", {
      browserId,
      visible: browserVisible,
    }).then(() => {
      if (browserVisible) syncBounds();
    }).catch(() => {});
  }, [browserId, browserVisible, syncBounds]);

  useLayoutEffect(() => {
    // Screen changes unmount the current PaneSlot without closing its browser
    // tab. Keep the native view alive for a later return, but never leave its
    // last visible state covering the newly selected Screen.
    return () => {
      void invoke("document_browser_visibility", {
        browserId,
        visible: false,
      }).catch(() => {});
    };
  }, [browserId]);

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
    if (!browserVisible) return;
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
  }, [browserVisible, syncBounds]);

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
  const elementName = pointedElement?.label || pointedElement?.selector || pointedElement?.tag || text("요소", "element");
  const elementSize = pointedElement?.rect
    ? `${Math.round(pointedElement.rect.width || 0)} × ${Math.round(pointedElement.rect.height || 0)}`
    : "";
  const delivery = asDeliveryPreview(snapshot.annotationDelivery);
  const deliveryLabel = delivery
    ? delivery.ok
      ? delivery.target === "clipboard" ? text("클립보드 복사 완료", "Copied to clipboard") : text("세션 전송 완료", "Sent to session")
      : `${delivery.target === "clipboard" ? text("클립보드 복사 실패", "Clipboard copy failed") : text("세션 전송 실패", "Send to session failed")}: ${delivery.error || text("알 수 없는 오류", "Unknown error")}`
    : "";

  return (
    <div className="embedded-document-browser">
      <header className="document-browser-toolbar embedded-document-browser-toolbar">
        <div className="document-browser-nav">
          <button
            className="document-browser-btn"
            disabled={!snapshot.canGoBack}
            onClick={() => command("document_browser_back")}
            title={text("뒤로가기", "Back")}
          >
            ←
          </button>
          <button
            className="document-browser-btn"
            disabled={!snapshot.canGoForward}
            onClick={() => command("document_browser_forward")}
            title={text("앞으로가기", "Forward")}
          >
            →
          </button>
          <button
            className="document-browser-btn"
            onClick={() => command("document_browser_reload")}
            title={text("새로고침", "Reload")}
          >
            ↻
          </button>
        </div>
        <form
          className="document-browser-location document-browser-address-form"
          onSubmit={navigate}
          title={text("주소를 입력하고 Enter로 이동", "Enter an address and press Enter")}
        >
          <input
            className="document-browser-address"
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            aria-label={text("브라우저 주소", "Browser address")}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {snapshot.loading && <span className="document-browser-status-inline">{text("불러오는 중…", "Loading…")}</span>}
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
            title={text("DevTools처럼 요소 경계를 표시하고 클릭한 영역을 캡처", "Show element boundaries like DevTools and capture the clicked area")}
          >
            {snapshot.inspectionMode && !snapshot.inspectionSendToSession ? text("선택 취소", "Cancel selection") : text("영역 선택", "Select area")}
          </button>
          <button
            className={`document-browser-btn${snapshot.inspectionMode && snapshot.inspectionSendToSession ? " is-active" : ""}`}
            onClick={() => toggleInspection(true)}
            disabled={!snapshot.agentId}
            title={snapshot.agentId
              ? text("요소를 가리켜 확인한 뒤 클릭하면 이미지·JSON·HTML 문맥을 현재 세션에 전송", "Hover to inspect an element, then click to send image, JSON, and HTML context to the current session")
              : text("이 문서 탭에 연결된 세션이 없습니다. 터미널의 문서 링크에서 다시 열어 주세요.", "No session is connected to this document tab. Reopen it from the document link in a terminal.")}
          >
            {snapshot.inspectionMode && snapshot.inspectionSendToSession ? text("전송 취소", "Cancel send") : text("선택 후 전송", "Select and send")}
          </button>
          <button
            className="document-browser-btn"
            onClick={() => command("document_browser_open_external")}
            title={text("기본 브라우저로 열기", "Open in default browser")}
          >
            {text("기본 브라우저", "Default browser")}
          </button>
        </div>
      </header>
      {(snapshot.inspectionMode || Boolean(snapshot.selectedElement) || Boolean(snapshot.hoveredElement) || Boolean(snapshot.annotation)) && (
        <div className="document-browser-annotation-bar">
          <span>
            {snapshot.inspectionMode
              ? text(
                  `요소 선택 모드 · ${elementName}${elementSize ? ` · ${elementSize}` : ""} · 클릭하여 ${snapshot.inspectionSendToSession ? "세션에 전송" : "캡처"} · Esc 취소`,
                  `Element selection · ${elementName}${elementSize ? ` · ${elementSize}` : ""} · click to ${snapshot.inspectionSendToSession ? "send to session" : "capture"} · Esc to cancel`,
                )
              : Boolean(snapshot.selectedElement)
                ? text(`선택됨 · ${elementName}${elementSize ? ` · ${elementSize}` : ""}`, `Selected · ${elementName}${elementSize ? ` · ${elementSize}` : ""}`)
                : text("가리킨 영역", "Hovered area")}
            {snapshot.annotation ? text(" · 캡처됨", " · captured") : ""}
            {deliveryLabel ? ` · ${deliveryLabel}` : ""}
          </span>
          {Boolean(snapshot.annotation) && (
            <details>
              <summary>{text("JSON/HTML 문맥 보기", "View JSON/HTML context")}</summary>
              <pre>{String(JSON.stringify(snapshot.annotation, null, 2))}</pre>
            </details>
          )}
        </div>
      )}
      <div ref={hostRef} className="embedded-document-browser-host" aria-label={text("HTML 문서 브라우저", "HTML document browser")} />
    </div>
  );
}
