import { useMemo, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import type { AttentionItem, AttentionKind } from "../lib/attention";
import { useAppLanguage, type ResolvedAppLanguage } from "../lib/appLanguage";

const KIND_LABEL: Record<AttentionKind, string> = {
  waiting: "응답 대기",
  blocked: "확인 필요",
  completed: "완료",
  stale: "상태 확인",
};
const KIND_LABEL_EN: Record<AttentionKind, string> = {
  waiting: "Waiting for response",
  blocked: "Needs attention",
  completed: "Completed",
  stale: "Check status",
};

function relativeTime(timestamp: number, language: ResolvedAppLanguage) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return language === "ko" ? "방금" : "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return language === "ko" ? `${minutes}분 전` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === "ko" ? `${hours}시간 전` : `${hours}h ago`;
  return language === "ko" ? `${Math.floor(hours / 24)}일 전` : `${Math.floor(hours / 24)}d ago`;
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
  const { language, text } = useAppLanguage();

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
            <p>{text(`확인할 항목 ${unreadCount}개`, `${unreadCount} item${unreadCount === 1 ? "" : "s"} to review`)}</p>
          </div>
          <button className="app-icon-btn" onClick={onClose} title={text("닫기", "Close")}>×</button>
        </header>
        <div className="attention-toolbar">
          <button
            className={!unreadOnly ? "attention-filter-active" : ""}
            onClick={() => setUnreadOnly(false)}
          >{text(`전체 ${items.length}`, `All ${items.length}`)}</button>
          <button
            className={unreadOnly ? "attention-filter-active" : ""}
            onClick={() => setUnreadOnly(true)}
          >{text(`읽지 않음 ${unreadCount}`, `Unread ${unreadCount}`)}</button>
          <span />
          <button onClick={onMarkAllRead} disabled={unreadCount === 0}>{text("모두 읽음", "Mark all read")}</button>
          <button onClick={onClearRead} disabled={!items.some((item) => item.read)}>{text("읽은 항목 삭제", "Clear read")}</button>
        </div>
        <div className="attention-list">
          {visible.map((item) => (
            <button
              key={item.id}
              className={`attention-item ${item.read ? "attention-item-read" : ""}`}
              onClick={() => onSelect(item)}
            >
              <span className={`attention-kind attention-kind-${item.kind}`}>
                {language === "ko" ? KIND_LABEL[item.kind] : KIND_LABEL_EN[item.kind]}
              </span>
              <span className="attention-copy">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <small>{relativeTime(item.createdAt, language)}</small>
              </span>
              {!item.read && <span className="attention-unread-dot" aria-label={text("읽지 않음", "Unread")} />}
            </button>
          ))}
          {visible.length === 0 && (
            <div className="attention-empty">
              {unreadOnly
                ? text("읽지 않은 항목이 없습니다.", "There are no unread items.")
                : text("아직 확인할 항목이 없습니다.", "There are no items to review yet.")}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
