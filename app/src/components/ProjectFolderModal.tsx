import { useState } from "react";

export function ProjectFolderModal({
  title,
  defaultName = "",
  machineLabel,
  onCancel,
  onSave,
}: {
  title: string;
  defaultName?: string;
  machineLabel: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const trimmedName = name.trim();
  const submit = () => {
    if (trimmedName) onSave(trimmedName);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">{title}</h2>
        <label className="field">
          <span className="field-label">위치</span>
          <span className="check-hint">{machineLabel}</span>
        </label>
        <label className="field">
          <span className="field-label">폴더 이름</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder="예: 업무 프로젝트"
          />
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn-primary"
            disabled={!trimmedName}
            onClick={submit}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
