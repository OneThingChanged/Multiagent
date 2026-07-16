import { useEffect, useMemo, useRef, useState } from "react";
import { rankQuickOpenItems, type QuickOpenItem } from "../lib/quickOpen";

const KIND_LABEL: Record<QuickOpenItem["kind"], string> = {
  project: "PROJECT",
  session: "SESSION",
  screen: "SCREEN",
  document: "DOC",
  command: "COMMAND",
};

export function QuickOpen({
  items,
  loadingDocuments,
  onSelect,
  onClose,
}: {
  items: QuickOpenItem[];
  loadingDocuments: boolean;
  onSelect: (item: QuickOpenItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rankQuickOpenItems(items, query), [items, query]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    document.querySelector(`[data-quick-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="quick-open-backdrop" onMouseDown={onClose}>
      <section
        className="quick-open"
        role="dialog"
        aria-modal="true"
        aria-label="Quick Open"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(results.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && results[activeIndex]) {
            event.preventDefault();
            onSelect(results[activeIndex]);
          }
        }}
      >
        <div className="quick-open-input-row">
          <span className="quick-open-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="프로젝트, 세션, Screen, 문서 또는 명령 검색"
            aria-label="Quick Open 검색"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="quick-open-hints">
          <span><b>&gt;</b> 명령</span><span><b>@</b> 세션</span>
          <span><b>#</b> Screen</span><span><b>/</b> 문서</span>
          {loadingDocuments && <span className="quick-open-loading">문서 검색 중…</span>}
        </div>
        <div className="quick-open-results" role="listbox">
          {results.map((item, index) => (
            <button
              key={item.id}
              type="button"
              data-quick-index={index}
              className={`quick-open-result ${index === activeIndex ? "quick-open-result-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(item)}
              role="option"
              aria-selected={index === activeIndex}
            >
              <span className={`quick-open-kind quick-open-kind-${item.kind}`}>
                {KIND_LABEL[item.kind]}
              </span>
              <span className="quick-open-result-copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="quick-open-empty">일치하는 항목이 없습니다.</div>
          )}
        </div>
      </section>
    </div>
  );
}
