import { useState } from "react";
import { openDialog } from "../platform/plugins";
import { AI_TOOLS, toolForId, type NewProjectPayload } from "../types";
import { loadSshHosts } from "../lib/sshHosts";

export function NewProjectModal({
  defaultName,
  onCancel,
  onCreate,
  disabledTools = [],
}: {
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewProjectPayload) => void;
  disabledTools?: string[];
}) {
  const visibleTools = AI_TOOLS.filter(
    (tool) => tool.id === "none" || !disabledTools.includes(tool.id)
  );
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState("");
  const [aiToolId, setAiToolId] = useState("");
  const [dangerous, setDangerous] = useState(false);
  const [remote, setRemote] = useState(false);
  const [sshHosts] = useState(() => loadSshHosts());
  const [sshHostId, setSshHostId] = useState<string>("");
  const [remoteFolder, setRemoteFolder] = useState("");
  const selectedTool = toolForId(aiToolId);
  const supportsDangerous = !!aiToolId && !!selectedTool.dangerousFlag;

  const browse = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string") setFolder(selected);
    } catch {}
  };

  const canSubmit =
    name.trim().length > 0 &&
    visibleTools.some((tool) => tool.id === aiToolId) &&
    (remote ? sshHostId.length > 0 : folder.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    if (remote) {
      onCreate({
        name: name.trim(),
        folder: "",
        aiToolId,
        dangerous: dangerous && supportsDangerous,
        sshHostId,
        remoteFolder: remoteFolder.trim(),
      });
    } else {
      onCreate({
        name: name.trim(),
        folder: folder.trim(),
        aiToolId,
        dangerous: dangerous && supportsDangerous,
      });
    }
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
          <span className="field-label">First session tool</span>
          <select
            value={aiToolId}
            onChange={(event) => {
              const nextToolId = event.target.value;
              setAiToolId(nextToolId);
              if (!toolForId(nextToolId).dangerousFlag) {
                setDangerous(false);
              }
            }}
          >
            <option value="" disabled>
              Select a tool…
            </option>
            {visibleTools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.label}
              </option>
            ))}
          </select>
          <span className="check-hint">
            프로젝트를 만들면 선택한 도구로 Session 1이 바로 시작됩니다.
          </span>
        </label>

        {supportsDangerous && (
          <label className="field-check">
            <input
              type="checkbox"
              checked={dangerous}
              onChange={(event) => setDangerous(event.target.checked)}
            />
            <span>
              <span className="check-label">Dangerous mode</span>
              <span className="check-hint">
                {selectedTool.dangerousFlag} — 권한 확인을 생략합니다.
              </span>
            </span>
          </label>
        )}

        <label className="field-check">
          <input
            type="checkbox"
            checked={remote}
            onChange={(event) => setRemote(event.target.checked)}
          />
          <span>
            <span className="check-label">Run on remote host (SSH)</span>
            <span className="check-hint">
              Sessions of this project run on another machine over SSH
            </span>
          </span>
        </label>

        {!remote && (
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
        )}

        {remote && (
          <>
            <label className="field">
              <span className="field-label">SSH host</span>
              {sshHosts.length > 0 ? (
                <select
                  value={sshHostId}
                  onChange={(event) => setSshHostId(event.target.value)}
                >
                  <option value="">Select a host…</option>
                  {sshHosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label} ({h.user}@{h.host})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="check-hint">
                  Settings → SSH Hosts에서 먼저 호스트를 등록하세요.
                </span>
              )}
            </label>
            <label className="field">
              <span className="field-label">Remote folder</span>
              <input
                value={remoteFolder}
                onChange={(event) => setRemoteFolder(event.target.value)}
                placeholder="/home/user/project"
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") onCancel();
                }}
              />
            </label>
          </>
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
