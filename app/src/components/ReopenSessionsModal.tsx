import { useEffect } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";

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
  const { text } = useAppLanguage();

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
        <h2 className="modal-title">{text("이전 세션 다시 열기", "Reopen previous sessions")}</h2>
        <p className="modal-text">
          {text(
            `직전에 열려 있던 세션 ${count}개가 있어요. 다시 열까요?`,
            `${count} session${count === 1 ? " was" : "s were"} open previously. Reopen ${count === 1 ? "it" : "them"}?`,
          )}
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onNo}>
            {text("아니오", "No")}
          </button>
          <button className="btn-primary" autoFocus onClick={onYes}>
            {text("예, 다시 열기", "Yes, reopen")}
          </button>
        </div>
      </div>
    </div>
  );
}
