import { Fragment, ReactNode, useRef } from "react";

export function Splitter({
  direction,
  sizes,
  onResize,
  children,
}: {
  direction: "h" | "v";
  sizes: number[];
  onResize: (sizes: number[]) => void;
  children: ReactNode[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  const startDrag = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    const container = ref.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const total = direction === "h" ? rect.width : rect.height;
    const origin = direction === "h" ? rect.left : rect.top;
    const initialSizes = [...sizes];
    const minPx = 120;
    const minFrac = Math.min(0.1, minPx / total);

    const onMove = (ev: PointerEvent) => {
      const pos = (direction === "h" ? ev.clientX : ev.clientY) - origin;
      const frac = pos / total;
      const sumBefore = initialSizes
        .slice(0, i)
        .reduce((a, b) => a + b, 0);
      let newSi = frac - sumBefore;
      const pairTotal = initialSizes[i] + initialSizes[i + 1];
      newSi = Math.max(minFrac, Math.min(pairTotal - minFrac, newSi));
      const newSizes = [...initialSizes];
      newSizes[i] = newSi;
      newSizes[i + 1] = pairTotal - newSi;
      onResize(newSizes);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={ref} className={`splitter splitter-${direction}`}>
      {children.map((child, i) => (
        <Fragment key={i}>
          <div
            className="splitter-pane"
            style={{ flexBasis: `${sizes[i] * 100}%` }}
          >
            {child}
          </div>
          {i < children.length - 1 && (
            <div
              className={`splitter-handle splitter-handle-${direction}`}
              onPointerDown={(e) => startDrag(i, e)}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
