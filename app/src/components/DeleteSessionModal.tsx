import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import { sessionDeletionMessage } from "../lib/sessionLifecycle";

export function DeleteSessionModal({ name, onConfirm, onCancel }: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  return (
    <div className="modal-backdrop" onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Tab") {
        const buttons = event.currentTarget.querySelectorAll("button");
        const target = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
        if (document.activeElement === target) {
          event.preventDefault();
          (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
        }
      }
    }}>
      <div className="modal" role="alertdialog" aria-modal="true"
        aria-labelledby="delete-session-title" aria-describedby="delete-session-message">
        <h2 className="modal-title" id="delete-session-title">{text("세션 삭제", "Delete session")}</h2>
        <p className="modal-text" id="delete-session-message" style={{ whiteSpace: "pre-line" }}>
          {text(sessionDeletionMessage(name), `Delete the “${name}” session?\nThis stops the running process and removes it from Acedia.\nThis cannot be undone.`)}
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" autoFocus onClick={onCancel}>{text("취소", "Cancel")}</button>
          <button className="btn-primary" onClick={onConfirm}>{text("삭제", "Delete")}</button>
        </div>
      </div>
    </div>
  );
}
