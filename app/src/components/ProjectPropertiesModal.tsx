import { useEffect } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import type { Agent, Project } from "../types";
import { findSshHost, sshHostSummary } from "../lib/sshHosts";
import { SessionStorageList } from "./SessionStorageList";
import { useAppLanguage } from "../lib/appLanguage";

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
  onSessionDeleted,
  onClose,
}: {
  project: Project;
  agents: Agent[];
  onSessionDeleted?: (aiToolId: string, sessionId: string) => void;
  onClose: () => void;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const projectAgents = agents.filter((a) => a.projectId === project.id);
  const activeCount = projectAgents.filter(
    (a) =>
      a.status === "working" ||
      a.status === "waiting" ||
      a.status === "blocked" ||
      a.status === "starting" ||
      a.status === "recovering" ||
      a.status === "running"
  ).length;

  const sshHost = project.sshHostId ? findSshHost(project.sshHostId) : null;
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: text("이름", "Name"), value: project.name },
    ...(sshHost
      ? [
          {
            label: text("원격 호스트", "Remote host"),
            value: sshHostSummary(sshHost),
            mono: true,
          },
          {
            label: text("원격 폴더", "Remote folder"),
            value: project.remoteFolder || "—",
            mono: true,
          },
        ]
      : [{ label: text("폴더", "Folder"), value: project.folder || "—", mono: true }]),
    { label: text("세션 수", "Sessions"), value: String(projectAgents.length) },
    { label: text("활성 세션", "Active sessions"), value: String(activeCount) },
    { label: text("생성 시각", "Created"), value: formatDate(project.createdAt), mono: true },
    {
      label: text("마지막 열람", "Last opened"),
      value: formatDate(project.lastOpenedAt),
      mono: true,
    },
    { label: "Project ID", value: project.id, mono: true },
  ];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal session-props-modal project-props-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-settings-header">
          <h2 className="modal-title">{text("프로젝트 속성", "Project properties")}</h2>
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
        <SessionStorageList
          folder={project.folder}
          agents={projectAgents}
          scope="project"
          onSessionDeleted={onSessionDeleted}
        />
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            {text("닫기", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
