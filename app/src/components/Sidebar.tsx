import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toolForId } from "../types";
import type { Agent, DragState, Group, Project } from "../types";
import { collectAgentIdsInOrder } from "../lib/layout";
import { folderTail } from "../lib/path";

const LS_EXPANDED_PROJECTS = "multiagent.expandedProjects.v1";

type Section = {
  groupId: string;
  multi: boolean;
  sessionLocked: boolean;
  members: Agent[];
};

type PendingSessionClick = {
  agentId: string;
  x: number;
  y: number;
  moved: boolean;
  dragging: boolean;
};

function loadExpandedProjects(projects: Project[]) {
  try {
    const raw = localStorage.getItem(LS_EXPANDED_PROJECTS);
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      return new Set(saved.filter((id) => projects.some((p) => p.id === id)));
    }
  } catch {}

  return new Set(projects.map((project) => project.id));
}

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
  onRenameSession,
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
  onReorderProject,
  onProjectContextMenu,
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
  onRenameSession: (id: string) => void;
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
  onReorderProject: (draggedId: string, targetId: string, before: boolean) => void;
  onProjectContextMenu: (projectId: string, x: number, y: number) => void;
}) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => loadExpandedProjects(projects)
  );
  const [projectDropTarget, setProjectDropTarget] = useState<{
    id: string;
    before: boolean;
  } | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const pendingSessionClickRef = useRef<PendingSessionClick | null>(null);

  useEffect(() => {
    setExpandedProjectIds((current) => {
      const validProjectIds = new Set(projects.map((project) => project.id));
      const next = new Set(
        Array.from(current).filter((id) => validProjectIds.has(id))
      );
      if (activeProjectId) next.add(activeProjectId);
      return next;
    });
  }, [activeProjectId, projects]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_EXPANDED_PROJECTS,
        JSON.stringify(Array.from(expandedProjectIds))
      );
    } catch {}
  }, [expandedProjectIds]);

  const projectSessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of agents) {
      counts.set(agent.projectId, (counts.get(agent.projectId) ?? 0) + 1);
    }
    return counts;
  }, [agents]);

  const sectionsByProject = useMemo(() => {
    const result = new Map<string, Section[]>();

    for (const project of projects) {
      const projectAgents = agents.filter(
        (agent) => agent.projectId === project.id
      );
      const agentById = new Map(projectAgents.map((agent) => [agent.id, agent]));
      const seen = new Set<string>();
      const sections: Section[] = [];

      for (const group of groups) {
        const ids = collectAgentIdsInOrder(group.layout);
        const members: Agent[] = [];
        for (const id of ids) {
          const agent = agentById.get(id);
          if (agent && !seen.has(id)) {
            members.push(agent);
            seen.add(id);
          }
        }
        if (members.length > 0) {
          sections.push({
            groupId: group.id,
            multi: ids.length > 1,
            sessionLocked: !!group.sessionLocked,
            members,
          });
        }
      }

      const orphans = projectAgents.filter((agent) => !seen.has(agent.id));
      if (orphans.length > 0) {
        sections.push({
          groupId: `${project.id}__orphans__`,
          multi: false,
          sessionLocked: false,
          members: orphans,
        });
      }

      result.set(project.id, sections);
    }

    return result;
  }, [agents, groups, projects]);

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const selectProject = (projectId: string) => {
    setExpandedProjectIds((current) => {
      if (current.has(projectId)) return current;
      const next = new Set(current);
      next.add(projectId);
      return next;
    });
    onSelectProject(projectId);
  };

  const startSessionPointer = (
    agentId: string,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    pendingSessionClickRef.current = {
      agentId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      dragging: false,
    };
  };

  const updateSessionPointer = (
    agentId: string,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    const pending = pendingSessionClickRef.current;
    if (!pending || pending.agentId !== agentId) return;
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 4) {
      pending.moved = true;
    }
  };

  const finishSessionPointer = (
    agentId: string,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const pending = pendingSessionClickRef.current;
    pendingSessionClickRef.current = null;
    if (!pending || pending.agentId !== agentId) return;
    if (!pending.moved && !pending.dragging) {
      onSelect(agentId);
    }
  };

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
          "agent-item-nested",
          activeAgentId === a.id ? "active" : "",
          inGroup ? "in-group" : "",
          isDragging ? "agent-dragging" : "",
          multi ? "agent-grouped" : "",
          multi && isActiveGroup ? "agent-grouped-active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        draggable
        onPointerDown={(e) => startSessionPointer(a.id, e)}
        onPointerMove={(e) => updateSessionPointer(a.id, e)}
        onPointerUp={(e) => finishSessionPointer(a.id, e)}
        onPointerCancel={() => {
          pendingSessionClickRef.current = null;
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          pendingSessionClickRef.current = null;
          e.preventDefault();
          e.stopPropagation();
          onRenameSession(a.id);
        }}
        onDragStart={(e) => {
          const pending = pendingSessionClickRef.current;
          if (pending?.agentId === a.id) {
            pending.dragging = true;
            pending.moved = true;
          }
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", a.id);
          e.dataTransfer.setData("application/x-multiagent-agent", a.id);
          onDragStart(a.id);
        }}
        onDragEnd={() => {
          pendingSessionClickRef.current = null;
          onDragEnd();
        }}
        onContextMenu={(e) => {
          pendingSessionClickRef.current = null;
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
          <span className="agent-name" title={`${a.name} - 더블클릭으로 별명 변경`}>
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
      <div className="project-tree">
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
        {projects.map((project) => {
          const expanded = expandedProjectIds.has(project.id);
          const sections = sectionsByProject.get(project.id) ?? [];
          const sessionCount = projectSessionCounts.get(project.id) ?? 0;

          const isDropTarget = projectDropTarget?.id === project.id;
          const dropBefore = isDropTarget && projectDropTarget?.before;
          const dropAfter = isDropTarget && !projectDropTarget?.before;
          const isDraggingThis = draggingProjectId === project.id;
          return (
            <div
              key={project.id}
              className={[
                "project-node",
                project.id === activeProjectId ? "project-node-active" : "",
                dropBefore ? "project-node-drop-before" : "",
                dropAfter ? "project-node-drop-after" : "",
                isDraggingThis ? "project-node-dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable
              onDragStart={(e) => {
                if ((e.target as HTMLElement).closest(".project-session-list")) {
                  return;
                }
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "application/x-multiagent-project",
                  project.id
                );
                setDraggingProjectId(project.id);
              }}
              onDragOver={(e) => {
                if (
                  !e.dataTransfer.types.includes(
                    "application/x-multiagent-project"
                  )
                ) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY - rect.top < rect.height / 2;
                setProjectDropTarget((cur) =>
                  cur?.id === project.id && cur.before === before
                    ? cur
                    : { id: project.id, before }
                );
              }}
              onDragLeave={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                setProjectDropTarget((cur) =>
                  cur?.id === project.id ? null : cur
                );
              }}
              onDrop={(e) => {
                const draggedId = e.dataTransfer.getData(
                  "application/x-multiagent-project"
                );
                if (!draggedId) return;
                e.preventDefault();
                const target = projectDropTarget;
                setProjectDropTarget(null);
                setDraggingProjectId(null);
                if (target && draggedId !== project.id) {
                  onReorderProject(draggedId, project.id, target.before);
                }
              }}
              onDragEnd={() => {
                setProjectDropTarget(null);
                setDraggingProjectId(null);
              }}
            >
              <div
                className="project-row"
                onContextMenu={(e) => {
                  if ((e.target as HTMLElement).closest("button.project-caret-btn")) {
                    return;
                  }
                  e.preventDefault();
                  onProjectContextMenu(project.id, e.clientX, e.clientY);
                }}
              >
                <button
                  className="project-caret-btn"
                  onClick={() => toggleProjectExpanded(project.id)}
                  title={expanded ? "Collapse project" : "Expand project"}
                >
                  {expanded ? "v" : ">"}
                </button>
                <button
                  className="project-item project-tree-project"
                  onClick={() => selectProject(project.id)}
                  title={project.folder}
                >
                  <span className="project-name">{project.name}</span>
                  <span className="project-meta">
                    {folderTail(project.folder)} · {sessionCount}
                  </span>
                </button>
              </div>
              {expanded && (
                <ul className="project-session-list">
                  {sections.map((section, idx) => (
                    <Fragment key={`${project.id}-${section.groupId}`}>
                      {idx > 0 && <li className="group-separator" />}
                      {section.members.map((agent) =>
                        renderItem(
                          agent,
                          section.groupId,
                          section.multi,
                          section.sessionLocked
                        )
                      )}
                    </Fragment>
                  ))}
                  {sessionCount === 0 && (
                    <li className="empty-hint project-empty-hint">
                      Select project, then click + to start a session
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="empty-hint">Click + to add a project</div>
        )}
      </div>
    </aside>
  );
}
