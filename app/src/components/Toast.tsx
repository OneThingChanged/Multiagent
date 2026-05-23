import type { Toast } from "../types";

export function ToastContainer({
  toasts,
  onSelect,
  onDismiss,
}: {
  toasts: Toast[];
  onSelect: (agentId: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          onClick={() => {
            onSelect(t.agentId);
            onDismiss(t.id);
          }}
        >
          <div className="toast-title">{t.title}</div>
          <div className="toast-body">{t.body}</div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
