import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AI_TOOLS, toolForId } from "../types";
import type { NewAgentPayload } from "../types";

export function NewAgentModal({
  defaultName,
  onCancel,
  onCreate,
}: {
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewAgentPayload) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState("");
  const [aiToolId, setAiToolId] = useState<string>(AI_TOOLS[0].id);
  const [dangerous, setDangerous] = useState(false);
  const selectedTool = toolForId(aiToolId);
  const supportsDangerous = !!selectedTool.dangerousFlag;

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
      aiToolId,
      dangerous: dangerous && supportsDangerous,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">New Agent</h2>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="e.g. WebCanvas"
          />
        </label>

        <label className="field">
          <span className="field-label">Folder</span>
          <div className="folder-row">
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="C:\path\to\project"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onCancel();
              }}
            />
            <button type="button" className="browse-btn" onClick={browse}>
              Browse…
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">AI tool</span>
          <select
            value={aiToolId}
            onChange={(e) => setAiToolId(e.target.value)}
          >
            {AI_TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {supportsDangerous && (
          <label className="field-check">
            <input
              type="checkbox"
              checked={dangerous}
              onChange={(e) => setDangerous(e.target.checked)}
            />
            <span>
              <span className="check-label">Dangerous mode</span>
              <span className="check-hint">
                Skip permission prompts — runs commands without confirmation
              </span>
            </span>
          </label>
        )}

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
