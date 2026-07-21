import { useLayoutEffect, useRef, useState } from "react";
import type {
  ContextMenuState,
  ProjectContextMenuState,
  SessionContextAction,
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

export const TAB_COLORS: { name: string; value: string }[] = [
  { name: "파랑", value: "#4c8bf5" },
  { name: "보라", value: "#a371f7" },
  { name: "분홍", value: "#f778ba" },
  { name: "빨강", value: "#f85149" },
  { name: "주황", value: "#e3742f" },
  { name: "노랑", value: "#d29922" },
  { name: "초록", value: "#3fb950" },
  { name: "청록", value: "#2dd4bf" },
  { name: "회색", value: "#8b949e" },
];

export function TabContextMenu({
  state,
  pinned,
  tabColor,
  canReopen,
  onDismiss,
  onSplit,
  onTogglePin,
  onCloseTab,
  onCloseOthers,
  onCloseRight,
  onRename,
  onSetColor,
  onReopen,
  chatMode,
  onToggleChat,
  canChat,
}: {
  state: TabCtxState;
  pinned: boolean;
  tabColor: string | null;
  canReopen: boolean;
  onDismiss: () => void;
  onSplit: (direction: "h" | "v") => void;
  onTogglePin: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
  onRename: () => void;
  onSetColor: (color: string | null) => void;
  onReopen: () => void;
  chatMode: boolean;
  onToggleChat: () => void;
  canChat: boolean;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  const run = (action: () => void) => () => {
    action();
    onDismiss();
  };
  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onDismiss}
        onContextMenu={(e) => {
          e.preventDefault();
          onDismiss();
        }}
      />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button className="ctx-item" onClick={run(() => onSplit("h"))}>
          오른쪽으로 분할
        </button>
        <button className="ctx-item" onClick={run(() => onSplit("v"))}>
          아래로 분할
        </button>
        {canChat && (
          <>
            <div className="ctx-separator" />
            <button className="ctx-item" onClick={run(onToggleChat)}>
              {chatMode ? "⌗ 터미널 뷰로 보기" : "💬 대화(채팅) 뷰로 보기"}
            </button>
          </>
        )}
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={run(onTogglePin)}>
          {pinned ? "탭 고정 해제" : "탭 고정"}
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={run(onCloseTab)}>
          닫기 <span className="ctx-shortcut">Ctrl+W</span>
        </button>
        <button className="ctx-item" onClick={run(onCloseOthers)}>
          다른 탭 닫기
        </button>
        <button className="ctx-item" onClick={run(onCloseRight)}>
          오른쪽 탭 모두 닫기
        </button>
        <button className="ctx-item" onClick={run(onReopen)} disabled={!canReopen}>
          최근 닫은 탭 다시 열기 <span className="ctx-shortcut">Ctrl+Shift+T</span>
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={run(onRename)}>
          이름 변경
        </button>
        <div className="ctx-color-label">탭 색상</div>
        <div className="ctx-color-row">
          <button
            className={`ctx-color-swatch ctx-color-none ${!tabColor ? "ctx-color-active" : ""}`}
            title="색상 없음"
            onClick={run(() => onSetColor(null))}
          />
          {TAB_COLORS.map((color) => (
            <button
              key={color.value}
              className={`ctx-color-swatch ${tabColor === color.value ? "ctx-color-active" : ""}`}
              style={{ background: color.value }}
              title={color.name}
              onClick={run(() => onSetColor(color.value))}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export function TerminalContextMenu({
  x,
  y,
  hasSelection,
  onClose,
  onCopy,
  onPaste,
  onSelectAll,
}: {
  x: number;
  y: number;
  hasSelection: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
}) {
  const { ref, pos } = useClampedMenuPosition(x, y);
  return (
    <>
      <div
        className="ctx-backdrop"
        onMouseDown={onClose}
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
        <button className="ctx-item" onClick={onCopy} disabled={!hasSelection}>
          복사 (Ctrl+C)
        </button>
        <button className="ctx-item" onClick={onPaste}>
          붙여넣기 (Ctrl+V)
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={onSelectAll}>
          모두 선택
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
    action: SessionContextAction
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
        <button className="ctx-item" onClick={() => onAction("open-new-window")}>
          새 창에서 열기
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
