import { useLayoutEffect, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import type {
  ContextMenuState,
  ProjectFolderContextMenuState,
  ProjectContextMenuState,
  SessionContextAction,
  TabCtxState,
} from "../types";

// Keep a context menu fully inside the viewport: after it renders, measure it
// and shift left/up so it doesn't get clipped at the right/bottom edges.
function useClampedMenuPosition(x: number, y: number) {
  useNativeViewOcclusion();

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

export function ProjectFolderContextMenu({
  state,
  onClose,
  onAction,
}: {
  state: ProjectFolderContextMenuState;
  onClose: () => void;
  onAction: (action: "rename" | "delete") => void;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  const { text } = useAppLanguage();
  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button className="ctx-item" onClick={() => onAction("rename")}>
          {text("폴더 이름 변경", "Rename folder")}
        </button>
        <div className="ctx-separator" />
        <button
          className="ctx-item ctx-item-danger"
          onClick={() => onAction("delete")}
        >
          {text("폴더 삭제", "Delete folder")}
        </button>
      </div>
    </>
  );
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
  const { text } = useAppLanguage();
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
          {text("프로젝트 이름 변경", "Rename project")}
        </button>
        <button className="ctx-item" onClick={() => onAction("properties")}>
          {text("속성", "Properties")}
        </button>
        <div className="ctx-separator" />
        <button
          className="ctx-item ctx-item-danger"
          onClick={() => onAction("delete")}
        >
          {text("프로젝트 삭제", "Delete project")}
        </button>
      </div>
    </>
  );
}

export const TAB_COLORS: { name: string; nameEn: string; value: string }[] = [
  { name: "파랑", nameEn: "Blue", value: "#4c8bf5" },
  { name: "보라", nameEn: "Purple", value: "#a371f7" },
  { name: "분홍", nameEn: "Pink", value: "#f778ba" },
  { name: "빨강", nameEn: "Red", value: "#f85149" },
  { name: "주황", nameEn: "Orange", value: "#e3742f" },
  { name: "노랑", nameEn: "Yellow", value: "#d29922" },
  { name: "초록", nameEn: "Green", value: "#3fb950" },
  { name: "청록", nameEn: "Teal", value: "#2dd4bf" },
  { name: "회색", nameEn: "Gray", value: "#8b949e" },
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
  canRevealInExplorer,
  onRevealInExplorer,
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
  canRevealInExplorer: boolean;
  onRevealInExplorer: () => void;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  const { language, text } = useAppLanguage();
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
          {text("오른쪽으로 분할", "Split right")}
        </button>
        <button className="ctx-item" onClick={run(() => onSplit("v"))}>
          {text("아래로 분할", "Split down")}
        </button>
        {canRevealInExplorer && (
          <>
            <div className="ctx-separator" />
            <button className="ctx-item" onClick={run(onRevealInExplorer)}>
              {text("탐색기에서 보기", "Reveal in File Explorer")}
            </button>
          </>
        )}
        {canChat && (
          <>
            <div className="ctx-separator" />
            <button className="ctx-item" onClick={run(onToggleChat)}>
              {chatMode
                ? text("⌗ 터미널 뷰로 보기", "⌗ Show terminal view")
                : text("💬 대화(채팅) 뷰로 보기", "💬 Show chat view")}
            </button>
          </>
        )}
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={run(onTogglePin)}>
          {pinned ? text("탭 고정 해제", "Unpin tab") : text("탭 고정", "Pin tab")}
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={run(onCloseTab)}>
          {text("닫기", "Close")} <span className="ctx-shortcut">Ctrl+W</span>
        </button>
        <button className="ctx-item" onClick={run(onCloseOthers)}>
          {text("다른 탭 닫기", "Close other tabs")}
        </button>
        <button className="ctx-item" onClick={run(onCloseRight)}>
          {text("오른쪽 탭 모두 닫기", "Close tabs to the right")}
        </button>
        <button className="ctx-item" onClick={run(onReopen)} disabled={!canReopen}>
          {text("최근 닫은 탭 다시 열기", "Reopen closed tab")} <span className="ctx-shortcut">Ctrl+Shift+T</span>
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={run(onRename)}>
          {text("이름 변경", "Rename")}
        </button>
        <div className="ctx-color-label">{text("탭 색상", "Tab color")}</div>
        <div className="ctx-color-row">
          <button
            className={`ctx-color-swatch ctx-color-none ${!tabColor ? "ctx-color-active" : ""}`}
            title={text("색상 없음", "No color")}
            onClick={run(() => onSetColor(null))}
          />
          {TAB_COLORS.map((color) => (
            <button
              key={color.value}
              className={`ctx-color-swatch ${tabColor === color.value ? "ctx-color-active" : ""}`}
              style={{ background: color.value }}
              title={language === "ko" ? color.name : color.nameEn}
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
  const { text } = useAppLanguage();
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
          {text("복사", "Copy")} (Ctrl+C)
        </button>
        <button className="ctx-item" onClick={onPaste}>
          {text("붙여넣기", "Paste")} (Ctrl+V)
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={onSelectAll}>
          {text("모두 선택", "Select all")}
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
  canDeactivate,
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  hasActive: boolean;
  canPlaceInActive: boolean;
  isSessionLocked: boolean;
  canPinSession: boolean;
  canDeactivate: boolean;
  onClose: () => void;
  onAction: (
    action: SessionContextAction
  ) => void;
}) {
  const { ref, pos } = useClampedMenuPosition(state.x, state.y);
  const { text } = useAppLanguage();
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
          {text("전환 (현재 그룹으로 이동)", "Switch (move to current group)")}
        </button>
        <button className="ctx-item" onClick={() => onAction("open-new-window")}>
          {text("새 창에서 열기", "Open in new window")}
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("tab")}
          disabled={!hasActive || !canPlaceInActive}
        >
          {text("탭으로 추가", "Add as tab")}
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("split-h")}
          disabled={!hasActive || !canPlaceInActive}
        >
          {text("오른쪽 분할", "Split right")}
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("split-v")}
          disabled={!hasActive || !canPlaceInActive}
        >
          {text("아래로 분할", "Split down")}
        </button>
        <button className="ctx-item" onClick={() => onAction("rename")}>
          {text("세션 별명 변경", "Rename session")}
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("deactivate")}
          disabled={!canDeactivate}
        >
          {text("세션 비활성화", "Deactivate session")}
        </button>
        <button className="ctx-item" onClick={() => onAction("relink")}>
          {text("현재 세션으로 재등록", "Relink to current session")}
        </button>
        <div className="ctx-separator" />
        <button
          className="ctx-item ctx-item-danger"
          onClick={() => onAction("delete")}
        >
          {text("세션 삭제", "Delete session")}
        </button>
        <div className="ctx-separator" />
        <button
          className="ctx-item"
          onClick={() => onAction("pin-session")}
          disabled={!canPinSession}
        >
          {text("현재 세션으로 그룹 고정", "Pin group to this session")}
        </button>
        <button
          className="ctx-item"
          onClick={() => onAction("clear-session-pin")}
          disabled={!isSessionLocked}
        >
          {text("그룹 세션 고정 해제", "Unpin group sessions")}
        </button>
        <div className="ctx-separator" />
        <button className="ctx-item" onClick={() => onAction("properties")}>
          {text("속성", "Properties")}
        </button>
      </div>
    </>
  );
}
