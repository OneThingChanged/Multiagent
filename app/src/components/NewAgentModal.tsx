import { useState } from "react";
import { AI_TOOLS, toolForId } from "../types";
import type { NewAgentPayload, Project } from "../types";
import { folderTail } from "../lib/path";
import { defaultAiToolId } from "../lib/projectCreation";
import { SessionWorkerFields } from "./SessionWorkerFields";
import type { SessionWorkerSettings } from "../types";

export function NewAgentModal({
  project,
  defaultName,
  onCancel,
  onCreate,
  disabledTools = [],
}: {
  project: Project | null;
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewAgentPayload) => void;
  disabledTools?: string[];
}) {
  // Only tools enabled in Settings → Agents ("none" always available).
  const visibleTools = AI_TOOLS.filter(
    (t) => t.id === "none" || !disabledTools.includes(t.id)
  );
  const [name, setName] = useState(defaultName);
  const [aiToolId, setAiToolId] = useState<string>(() =>
    defaultAiToolId(disabledTools)
  );
  const [dangerous, setDangerous] = useState(false);
  const [workerSettings, setWorkerSettings] = useState<
    SessionWorkerSettings | undefined
  >();
  const selectedTool = toolForId(aiToolId);
  const supportsDangerous = !!selectedTool.dangerousFlag;

  const canSubmit = !!project && name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      aiToolId,
      dangerous: dangerous && supportsDangerous,
      workerSettings: aiToolId === "codex" ? workerSettings : undefined,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">New Session</h2>

        <div className="session-project-summary">
          <span className="session-project-label">Project</span>
          <span className="session-project-name">
            {project ? project.name : "No project selected"}
          </span>
          {project && (
            <span className="session-project-folder" title={project.folder}>
              {folderTail(project.folder)}
            </span>
          )}
        </div>

        <label className="field">
          <span className="field-label">Session alias</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="e.g. Combat camera pass"
          />
        </label>

        <label className="field">
          <span className="field-label">AI tool</span>
          <select
            value={aiToolId}
            onChange={(e) => setAiToolId(e.target.value)}
          >
            {visibleTools.map((t) => (
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

        {aiToolId === "codex" && (
          <SessionWorkerFields
            settings={workerSettings}
            disabledTools={disabledTools}
            onChange={setWorkerSettings}
          />
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
