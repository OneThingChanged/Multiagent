import { useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";

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
  useNativeViewOcclusion();
  const { text } = useAppLanguage();

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
          <span className="field-label">{text("위치", "Location")}</span>
          <span className="check-hint">{machineLabel}</span>
        </label>
        <label className="field">
          <span className="field-label">{text("폴더 이름", "Folder name")}</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder={text("예: 업무 프로젝트", "e.g. Work projects")}
          />
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {text("취소", "Cancel")}
          </button>
          <button
            className="btn-primary"
            disabled={!trimmedName}
            onClick={submit}
          >
            {text("저장", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
