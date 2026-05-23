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
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  hasActive: boolean;
  onClose: () => void;
  onAction: (action: "open" | "tab" | "split-h" | "split-v") => void;
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
          disabled={!hasActive}
        >
          탭으로 추가
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("split-h")}
          disabled={!hasActive}
        >
          오른쪽 분할
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("split-v")}
          disabled={!hasActive}
        >
          아래로 분할
        </button>
      </div>
    </>
  );
}
