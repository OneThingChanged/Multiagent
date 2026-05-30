import { useState } from "react";

export function RenameProjectModal({
  currentName,
  onCancel,
  onRename,
}: {
  currentName: string;
  onCancel: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onRename(name.trim());
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">Rename Project</h2>

        <label className="field">
          <span className="field-label">Project name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
          />
        </label>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
