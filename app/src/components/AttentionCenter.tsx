import { useMemo, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import type { AttentionItem, AttentionKind } from "../lib/attention";

const KIND_LABEL: Record<AttentionKind, string> = {
  waiting: "응답 대기",
  blocked: "확인 필요",
  completed: "완료",
  stale: "상태 확인",
};

function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "방금";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function AttentionCenter({
  items,
  onSelect,
  onMarkAllRead,
  onClearRead,
  onClose,
}: {
  items: AttentionItem[];
  onSelect: (item: AttentionItem) => void;
  onMarkAllRead: () => void;
  onClearRead: () => void;
  onClose: () => void;
}) {
  useNativeViewOcclusion();

  const [unreadOnly, setUnreadOnly] = useState(false);
  const visible = useMemo(
    () => [...items].reverse().filter((item) => !unreadOnly || !item.read),
    [items, unreadOnly]
  );
  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <div className="attention-backdrop" onMouseDown={onClose}>
      <aside
        className="attention-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attention-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="attention-header">
          <div>
            <h2 id="attention-title">Attention Center</h2>
            <p>확인할 항목 {unreadCount}개</p>
          </div>
          <button className="app-icon-btn" onClick={onClose} title="닫기">×</button>
        </header>
        <div className="attention-toolbar">
          <button
            className={!unreadOnly ? "attention-filter-active" : ""}
            onClick={() => setUnreadOnly(false)}
          >전체 {items.length}</button>
          <button
            className={unreadOnly ? "attention-filter-active" : ""}
            onClick={() => setUnreadOnly(true)}
          >읽지 않음 {unreadCount}</button>
          <span />
          <button onClick={onMarkAllRead} disabled={unreadCount === 0}>모두 읽음</button>
          <button onClick={onClearRead} disabled={!items.some((item) => item.read)}>읽은 항목 삭제</button>
        </div>
        <div className="attention-list">
          {visible.map((item) => (
            <button
              key={item.id}
              className={`attention-item ${item.read ? "attention-item-read" : ""}`}
              onClick={() => onSelect(item)}
            >
              <span className={`attention-kind attention-kind-${item.kind}`}>
                {KIND_LABEL[item.kind]}
              </span>
              <span className="attention-copy">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <small>{relativeTime(item.createdAt)}</small>
              </span>
              {!item.read && <span className="attention-unread-dot" aria-label="읽지 않음" />}
            </button>
          ))}
          {visible.length === 0 && (
            <div className="attention-empty">
              {unreadOnly ? "읽지 않은 항목이 없습니다." : "아직 확인할 항목이 없습니다."}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
