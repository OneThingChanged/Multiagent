import { useLayoutEffect, useRef, useState } from "react";
import type {
  ContextMenuState,
  ProjectContextMenuState,
  TabCtxState,
} from "../types";

// Keep a context menu fully inside the viewport: after it renders, measure it
// and shift left/up so it doesn't get clipped at the right/bottom edges.
function useClampedMenuPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - margin) {
      left = Math.max(margin, vw - rect.width - margin);
    }
    if (top + rect.height > vh - margin) {
      top = Math.max(margin, vh - rect.height - margin);
    }
    setPos({ left, top });
  }, [x, y]);
  return { ref, pos };
}

export function ProjectContextMenu({
  state,
  onClose,
  onAction,
}: {
  state: ProjectContextMenuState;
  onClose: () => void;
  onAction: (action: "rename" | "delete" | "properties") => void;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button className="ctx-item" onClick={() => onAction("rename")}>
          프로젝트 이름 변경
        </button>
        <button className="ctx-item" onClick={() => onAction("properties")}>
          속성
        </button>
        <div className="ctx-separator" />
        <button
          className="ctx-item ctx-item-danger"
          onClick={() => onAction("delete")}
        >
          프로젝트 삭제
        </button>
      </div>
    </>
  );
}

export function TabContextMenu({
  state,
  onClose,
  onCloseTab,
}: {
  state: TabCtxState;
  onClose: () => void;
  onCloseTab: () => void;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button className="ctx-item" onClick={onCloseTab}>
          Close
        </button>
      </div>
    </>
  );
}

export function ContextMenu({
  state,
  hasActive,
  canPlaceInActive,
  isSessionLocked,
  canPinSession,
  canRestart,
  canDeactivate,
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  hasActive: boolean;
  canPlaceInActive: boolean;
  isSessionLocked: boolean;
  canPinSession: boolean;
  canRestart: boolean;
  canDeactivate: boolean;
  onClose: () => void;
  onAction: (
    action:
      | "open"
      | "tab"
      | "split-h"
      | "split-v"
      | "rename"
      | "pin-session"
      | "clear-session-pin"
      | "restart"
      | "deactivate"
      | "relink"
      | "properties"
  ) => void;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button className="ctx-item" onClick={() => onAction("open")}>
          전환 (현재 그룹으로 이동)
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("tab")}
          disabled={!hasActive || !canPlaceInActive}
        >
          탭으로 추가
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("split-h")}
          disabled={!hasActive || !canPlaceInActive}
        >
          오른쪽 분할
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("split-v")}
          disabled={!hasActive || !canPlaceInActive}
        >
          아래로 분할
        </button>
        <button className="ctx-item" onClick={() => onAction("rename")}>
          세션 별명 변경
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("restart")}
          disabled={!canRestart}
        >
          세션 재시작
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("deactivate")}
          disabled={!canDeactivate}
        >
          세션 비활성화
        </button>
        <button className="ctx-item" onClick={() => onAction("relink")}>
          현재 세션으로 재등록
        </button>
        <div className="ctx-separator" />
        <button
          className="ctx-item"
          onClick={() => onAction("pin-session")}
          disabled={!canPinSession}
        >
          현재 세션으로 그룹 고정
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("clear-session-pin")}
          disabled={!isSessionLocked}
        >
          그룹 세션 고정 해제
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={() => onAction("properties")}>
          속성
        </button>
      </div>
    </>
  );
}
