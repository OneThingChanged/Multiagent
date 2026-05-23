import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { NewProjectPayload } from "../types";

export function NewProjectModal({
  defaultName,
  onCancel,
  onCreate,
}: {
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewProjectPayload) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState("");

  const browse = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string") setFolder(selected);
    } catch {}
  };

  const canSubmit = name.trim().length > 0 && folder.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      folder: folder.trim(),
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">New Project</h2>

        <label className="field">
          <span className="field-label">Project name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder="e.g. ProjectA"
          />
        </label>

        <label className="field">
          <span className="field-label">Project folder</span>
          <div className="folder-row">
            <input
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              placeholder="C:\\path\\to\\project"
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                if (event.key === "Escape") onCancel();
              }}
            />
            <button type="button" className="browse-btn" onClick={browse}>
              Browse...
            </button>
          </div>
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
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
