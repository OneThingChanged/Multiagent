import { useEffect, useRef, useState } from "react";

export function SearchBar({
  onFindNext,
  onFindPrev,
  onClose,
}: {
  onFindNext: (q: string) => void;
  onFindPrev: (q: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <div className="term-search-bar" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="term-search-input"
        value={q}
        placeholder="Search terminal..."
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onFindPrev(q);
            else onFindNext(q);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <button
        className="term-search-btn"
        title="Previous (Shift+Enter)"
        onClick={() => onFindPrev(q)}
      >
        ↑
      </button>
      <button
        className="term-search-btn"
        title="Next (Enter)"
        onClick={() => onFindNext(q)}
      >
        ↓
      </button>
      <button
        className="term-search-btn term-search-close"
        title="Close (Esc)"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
