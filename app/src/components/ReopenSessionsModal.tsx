import { useEffect } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";

export function ReopenSessionsModal({
  count,
  onYes,
  onNo,
}: {
  count: number;
  onYes: () => void;
  onNo: () => void;
}) {
  useNativeViewOcclusion();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onYes();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onNo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onYes, onNo]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">이전 세션 다시 열기</h2>
        <p className="modal-text">
          직전에 열려 있던 세션 {count}개가 있어요. 다시 열까요?
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onNo}>
            아니오
          </button>
          <button className="btn-primary" autoFocus onClick={onYes}>
            예, 다시 열기
          </button>
        </div>
      </div>
    </div>
  );
}
