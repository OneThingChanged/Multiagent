import { useEffect, useMemo, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { rankQuickOpenItems, type QuickOpenItem } from "../lib/quickOpen";
import { useAppLanguage } from "../lib/appLanguage";

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
  useNativeViewOcclusion();
  const { text } = useAppLanguage();

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
            placeholder={text("프로젝트, 세션, Screen, 문서 또는 명령 검색", "Search projects, sessions, screens, documents, or commands")}
            aria-label={text("Quick Open 검색", "Search Quick Open")}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="quick-open-hints">
          <span><b>&gt;</b> {text("명령", "commands")}</span><span><b>@</b> {text("세션", "sessions")}</span>
          <span><b>#</b> Screen</span><span><b>/</b> {text("문서", "documents")}</span>
          {loadingDocuments && <span className="quick-open-loading">{text("문서 검색 중…", "Searching documents…")}</span>}
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
            <div className="quick-open-empty">{text("일치하는 항목이 없습니다.", "No matching items.")}</div>
          )}
        </div>
      </section>
    </div>
  );
}
