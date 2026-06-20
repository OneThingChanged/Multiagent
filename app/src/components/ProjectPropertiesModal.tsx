import { useEffect } from "react";
import type { Agent, Project } from "../types";

function formatDate(ms: number | undefined) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

export function ProjectPropertiesModal({
  project,
  agents,
  onClose,
}: {
  project: Project;
  agents: Agent[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const projectAgents = agents.filter((a) => a.projectId === project.id);
  const activeCount = projectAgents.filter(
    (a) => a.status === "working" || a.status === "running"
  ).length;

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "이름", value: project.name },
    { label: "폴더", value: project.folder || "—", mono: true },
    { label: "세션 수", value: String(projectAgents.length) },
    { label: "활성 세션", value: String(activeCount) },
    { label: "생성 시각", value: formatDate(project.createdAt), mono: true },
    {
      label: "마지막 열람",
      value: formatDate(project.lastOpenedAt),
      mono: true,
    },
    { label: "Project ID", value: project.id, mono: true },
  ];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal session-props-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-settings-header">
          <h2 className="modal-title">프로젝트 속성</h2>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="session-props-table">
          {rows.map((r) => (
            <div className="session-props-row" key={r.label}>
              <span className="session-props-label">{r.label}</span>
              <span
                className={`session-props-value ${
                  r.mono ? "session-props-mono" : ""
                }`}
                title={r.value}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
