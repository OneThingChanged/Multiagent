import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { emit, invoke, listen } from "../platform/runtime";
import type { DesktopPetUpdate } from "../lib/desktopPet";
import "./DesktopPetPage.css";

const IDLE: DesktopPetUpdate = {
  status: "idle",
  workingCount: 0,
  workingItems: [],
  completedCount: 0,
  title: null,
  body: null,
  agentId: null,
  notificationKey: null,
  question: null,
};

export function DesktopPetPage() {
  const [update, setUpdate] = useState(IDLE);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [workPanelOpen, setWorkPanelOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const lastNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    document.title = "MultiAgent Desktop Pet";
    document.documentElement.classList.add("desktop-pet-document");
    document.body.classList.add("desktop-pet-document");

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: number | null = null;

    const apply = (next: DesktopPetUpdate) => {
      if (cancelled) return;
      const normalized = {
        ...next,
        workingItems: next.workingItems ?? [],
      };
      setUpdate(normalized);
      if (normalized.workingItems.length === 0) setWorkPanelOpen(false);
      if (normalized.workingCount > 0) setCelebrating(false);
      if (
        normalized.notificationKey &&
        normalized.notificationKey !== lastNotificationRef.current
      ) {
        lastNotificationRef.current = normalized.notificationKey;
        setBubbleVisible(true);
        setCelebrating(normalized.workingCount === 0);
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          setBubbleVisible(false);
          setCelebrating(false);
        }, 6500);
      }
    };

    listen<DesktopPetUpdate>("desktop-pet:update", (event) =>
      apply(event.payload)
    )
      .then((unlisten) => {
        if (cancelled) unlisten();
        else unsubscribe = unlisten;
      })
      .catch(() => {});
    invoke<DesktopPetUpdate>("desktop_pet_snapshot").then(apply).catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (timer !== null) window.clearTimeout(timer);
      document.documentElement.classList.remove("desktop-pet-document");
      document.body.classList.remove("desktop-pet-document");
    };
  }, []);

  const face =
    update.status === "idle"
      ? "-_-"
      : update.status === "working"
        ? ">_"
        : update.status === "done"
          ? "✓"
          : "^_^";
  const activate = () => {
    if (contextMenu || workPanelOpen) {
      setContextMenu(null);
      setWorkPanelOpen(false);
      return;
    }
    setBubbleVisible(false);
    emit("desktop-pet:activate", { agentId: update.agentId }).catch(() => {});
  };

  const openContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setWorkPanelOpen(false);
    setContextMenu({
      x: Math.min(event.clientX, 64),
      y: Math.min(event.clientY, 136),
    });
  };

  const closePet = () => {
    setContextMenu(null);
    // Hide this native window directly; cross-webview events are only used to
    // synchronize the main React state and can be delayed on some WebView2
    // versions when the source window is about to disappear.
    emit("desktop-pet:close-requested").catch(() => {});
    invoke("set_desktop_pet_enabled", { enabled: false }).catch(() => {});
  };

  const toggleWorkPanel = (event: ReactMouseEvent) => {
    event.stopPropagation();
    setBubbleVisible(false);
    setContextMenu(null);
    setWorkPanelOpen((open) => !open);
  };

  const openWorkingAgent = (agentId: string) => {
    setWorkPanelOpen(false);
    emit("desktop-pet:activate", { agentId }).catch(() => {});
  };

  return (
    <div
      className={`desktop-pet-shell ${celebrating ? "desktop-pet-celebrate" : ""}`}
      data-status={update.status}
      title="MultiAgent 열기"
      onClick={activate}
      onContextMenu={openContextMenu}
    >
      <div className={`desktop-pet-bubble ${bubbleVisible ? "visible" : ""}`}>
        <div className="desktop-pet-bubble-title">
          {update.title || "MultiAgent"}
        </div>
        <div className="desktop-pet-bubble-body">
          {update.body || "작업이 끝났어요"}
        </div>
      </div>

      {workPanelOpen && update.workingItems.length > 0 && (
        <div
          className="desktop-pet-work-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="desktop-pet-work-title">
            작업 중 {update.workingItems.length} · 완료 {update.completedCount}
          </div>
          <div className="desktop-pet-work-list">
            {update.workingItems.map((item) => (
              <button
                key={item.agentId}
                type="button"
                onClick={() => openWorkingAgent(item.agentId)}
                title={item.question || `${item.projectName} / ${item.agentName}`}
              >
                <span className="desktop-pet-work-session">
                  {item.projectName} / {item.agentName}
                </span>
                <span className="desktop-pet-work-question">
                  {item.question || "질문 정보 없음"}
                </span>
                <span className="desktop-pet-work-tool">
                  {item.tool}
                  {item.workStatus === "waiting"
                    ? " · 대기"
                    : item.workStatus === "blocked"
                      ? " · 확인"
                      : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="desktop-pet-robot">
        <div className="desktop-pet-antenna" />
        <div className="desktop-pet-head">
          <div className="desktop-pet-shine" />
          <div className="desktop-pet-screen">{face}</div>
        </div>
        <div className="desktop-pet-arm desktop-pet-arm-left" />
        <div className="desktop-pet-arm desktop-pet-arm-right" />
        <div className="desktop-pet-body"><span>M</span></div>
        <div className="desktop-pet-foot desktop-pet-foot-left" />
        <div className="desktop-pet-foot desktop-pet-foot-right" />
        {(update.workingCount > 0 || update.completedCount > 0) && (
          <div className="desktop-pet-badges">
            {update.workingCount > 0 && (
              <div
                className="desktop-pet-badge desktop-pet-work-badge"
                onClick={toggleWorkPanel}
                title={`작업 중 ${update.workingCount}개 · 내용 보기`}
              >
                …{update.workingCount}
              </div>
            )}
            {update.completedCount > 0 && (
              <div
                className="desktop-pet-badge desktop-pet-complete-badge"
                title={`완료 ${update.completedCount}개`}
              >
                ✓{update.completedCount}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="desktop-pet-drag"
        data-tauri-drag-region
        title="끌어서 이동"
        onClick={(event) => event.stopPropagation()}
      >
        •••
      </div>

      {contextMenu && (
        <div
          className="desktop-pet-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={closePet}>
            Close pet
          </button>
        </div>
      )}
    </div>
  );
}
