import { Fragment, useMemo } from "react";
import { toolForId } from "../types";
import type { Agent, DragState, Group, Project } from "../types";
import { collectAgentIdsInOrder } from "../lib/layout";
import { folderTail } from "../lib/path";

type Section = {
  groupId: string;
  multi: boolean;
  sessionLocked: boolean;
  members: Agent[];
};

export function Sidebar({
  projects,
  agents,
  groups,
  activeProjectId,
  activeGroupId,
  activeAgentId,
  inGroupAgentIds,
  dragState,
  onSelectProject,
  onSelect,
  onContextMenu,
  onNewProject,
  onNewSession,
  docsOpen,
  onToggleDocs,
  settingsOpen,
  onToggleSettings,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  projects: Project[];
  agents: Agent[];
  groups: Group[];
  activeProjectId: string | null;
  activeGroupId: string | null;
  activeAgentId: string | null;
  inGroupAgentIds: Set<string>;
  dragState: DragState | null;
  onSelectProject: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onNewProject: () => void;
  onNewSession: () => void;
  docsOpen: boolean;
  onToggleDocs: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const activeAgents = useMemo(
    () =>
      activeProjectId
        ? agents.filter((agent) => agent.projectId === activeProjectId)
        : [],
    [activeProjectId, agents]
  );

  const projectSessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of agents) {
      counts.set(agent.projectId, (counts.get(agent.projectId) ?? 0) + 1);
    }
    return counts;
  }, [agents]);

  const sections = useMemo<Section[]>(() => {
    const agentById = new Map(activeAgents.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: Section[] = [];
    for (const g of groups) {
      const ids = collectAgentIdsInOrder(g.layout);
      const members: Agent[] = [];
      for (const id of ids) {
        const a = agentById.get(id);
        if (a && !seen.has(id)) {
          members.push(a);
          seen.add(id);
        }
      }
      if (members.length > 0) {
        out.push({
          groupId: g.id,
          multi: members.length > 1,
          sessionLocked: !!g.sessionLocked,
          members,
        });
      }
    }
    const orphans = activeAgents.filter((a) => !seen.has(a.id));
    if (orphans.length > 0) {
      out.push({
        groupId: "__orphans__",
        multi: false,
        sessionLocked: false,
        members: orphans,
      });
    }
    return out;
  }, [activeAgents, groups]);

  const renderItem = (
    a: Agent,
    groupId: string,
    multi: boolean,
    sessionLocked: boolean
  ) => {
    const inGroup = inGroupAgentIds.has(a.id);
    const isDragging = dragState?.fromAgentId === a.id;
    const isActiveGroup = groupId === activeGroupId;
    return (
      <li
        key={a.id}
        className={[
          "agent-item",
          activeAgentId === a.id ? "active" : "",
          inGroup ? "in-group" : "",
          isDragging ? "agent-dragging" : "",
          multi ? "agent-grouped" : "",
          multi && isActiveGroup ? "agent-grouped-active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", a.id);
          onDragStart(a.id);
        }}
        onDragEnd={onDragEnd}
        onClick={() => onSelect(a.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(a.id, e.clientX, e.clientY);
        }}
      >
        <div className="agent-row-top">
          <span className={`status status-${a.status}`} />
          <span
            className="agent-tool-icon"
            style={{ color: toolForId(a.aiToolId).iconColor }}
            title={a.aiLabel}
          >
            {toolForId(a.aiToolId).icon}
          </span>
          <span className="agent-name" title={a.name}>
            {a.name}
          </span>
          {sessionLocked && (
            <span
              className="agent-session-pin"
              title="이 그룹은 고정된 세션으로 열립니다"
            >
              PIN
            </span>
          )}
          {a.dangerous && (
            <span
              className="agent-danger"
              title="Dangerous mode - running without permission prompts"
            >
              !
            </span>
          )}
          <button
            className="close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(a.id);
            }}
            title="Remove session"
          >
            x
          </button>
        </div>
        <div className="agent-folder" title={a.lastSessionId ?? ""}>
          {a.lastSessionId ? `session ${a.lastSessionId.slice(0, 8)}` : "new session"}
        </div>
      </li>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-actions">
          <button
            className={`docs-toggle-btn ${docsOpen ? "docs-toggle-active" : ""}`}
            onClick={onToggleDocs}
            title="Toggle docs"
          >
            MD
          </button>
          <button
            className={`settings-toggle-btn ${
              settingsOpen ? "settings-toggle-active" : ""
            }`}
            onClick={onToggleSettings}
            title="Settings"
          >
            설정
          </button>
          <button
            className="new-btn"
            onClick={onNewSession}
            title={activeProjectId ? "New session" : "New project"}
          >
            +
          </button>
        </div>
      </div>
      <div className="project-list">
        <div className="sidebar-section-heading">
          <div className="sidebar-section-title">Projects</div>
          <button
            className="section-action-btn"
            onClick={onNewProject}
            title="New project"
          >
            +
          </button>
        </div>
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-item ${
              project.id === activeProjectId ? "project-item-active" : ""
            }`}
            onClick={() => onSelectProject(project.id)}
            title={project.folder}
          >
            <span className="project-name">{project.name}</span>
            <span className="project-meta">
              {folderTail(project.folder)} · {projectSessionCounts.get(project.id) ?? 0}
            </span>
          </button>
        ))}
        {projects.length === 0 && (
          <div className="empty-hint">Click + to add a project</div>
        )}
      </div>
      <ul className="agent-list">
        <li className="sidebar-section-title sidebar-section-title-list">
          Sessions
        </li>
        {activeProjectId &&
          sections.map((section, idx) => (
            <Fragment key={section.groupId}>
              {idx > 0 && <li className="group-separator" />}
              {section.members.map((a) =>
                renderItem(
                  a,
                  section.groupId,
                  section.multi,
                  section.sessionLocked
                )
              )}
            </Fragment>
          ))}
        {activeProjectId && activeAgents.length === 0 && (
          <li className="empty-hint">Click + to start a session</li>
        )}
        {!activeProjectId && projects.length > 0 && (
          <li className="empty-hint">Select a project first</li>
        )}
      </ul>
    </aside>
  );
}
