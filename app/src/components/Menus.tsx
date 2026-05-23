import type { ContextMenuState, TabCtxState } from "../types";

export function TabContextMenu({
  state,
  onClose,
  onCloseTab,
}: {
  state: TabCtxState;
  onClose: () => void;
  onCloseTab: () => void;
}) {
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
        className="ctx-menu"
        style={{ left: state.x, top: state.y }}
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
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  hasActive: boolean;
  canPlaceInActive: boolean;
  isSessionLocked: boolean;
  canPinSession: boolean;
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
  ) => void;
}) {
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
        className="ctx-menu"
        style={{ left: state.x, top: state.y }}
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
      </div>
    </>
  );
}
