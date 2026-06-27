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
import { loadSshHosts, sshHostSummary } from "../lib/sshHosts";

const LS_EXPANDED_PROJECTS = "multiagent.expandedProjects.v1";
const LS_COLLAPSED_MACHINES = "multiagent.collapsedMachines.v1";
const LS_ACTIVE_ONLY = "multiagent.activeOnly.v1";

function loadActiveOnly(): boolean {
  try {
    return localStorage.getItem(LS_ACTIVE_ONLY) === "1";
  } catch {
    return false;
  }
}

// A session is "active" when its PTY is alive (spawned and not exited).
function isActiveStatus(status: string): boolean {
  return status === "running" || status === "working" || status === "starting";
}

type MachineGroup = {
  id: string; // "local" or "ssh:<hostId>"
  kind: "local" | "ssh";
  label: string;
  hostSummary?: string;
  projects: Project[];
};

function loadCollapsedMachines(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED_MACHINES);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

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
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onOpenNewWindow,
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
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onOpenNewWindow: () => void;
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
  const [searchQuery, setSearchQuery] = useState("");
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

  // Machines are expanded by default; we persist the set of *collapsed* ids so
  // a newly-appearing machine starts expanded without needing its id upfront.
  const [collapsedMachineIds, setCollapsedMachineIds] = useState<Set<string>>(
    () => loadCollapsedMachines()
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_COLLAPSED_MACHINES,
        JSON.stringify(Array.from(collapsedMachineIds))
      );
    } catch {}
  }, [collapsedMachineIds]);

  const toggleMachineExpanded = (machineId: string) => {
    setCollapsedMachineIds((current) => {
      const next = new Set(current);
      if (next.has(machineId)) next.delete(machineId);
      else next.add(machineId);
      return next;
    });
  };

  // "Active only" filter: show just running sessions and their projects.
  const [activeOnly, setActiveOnly] = useState<boolean>(() => loadActiveOnly());
  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_ONLY, activeOnly ? "1" : "0");
    } catch {}
  }, [activeOnly]);

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

  const searchTerm = searchQuery.trim().toLowerCase();

  // Filter sections by search (project-name match shows all its sessions,
  // otherwise only matching session names) and, when "active only" is on, by
  // live status. Returns null to hide the whole project.
  const filterSections = (
    projectId: string,
    projectName: string
  ): Section[] | null => {
    const sections = sectionsByProject.get(projectId) ?? [];
    const projectMatchesSearch =
      searchTerm.length > 0 && projectName.toLowerCase().includes(searchTerm);
    let result = sections;
    if (searchTerm && !projectMatchesSearch) {
      result = sections
        .map((s) => ({
          ...s,
          members: s.members.filter((m) =>
            m.name.toLowerCase().includes(searchTerm)
          ),
        }))
        .filter((s) => s.members.length > 0);
    }
    // "Active only" hides inactive sessions, but a search should reach them too:
    // while searching, skip the active-status filter so deactivated/exited
    // sessions matching the query still show up.
    if (activeOnly && !searchTerm) {
      result = result
        .map((s) => ({
          ...s,
          members: s.members.filter((m) => isActiveStatus(m.status)),
        }))
        .filter((s) => s.members.length > 0);
      return result.length > 0 ? result : null;
    }
    if (result.length > 0) return result;
    if (!searchTerm || projectMatchesSearch) return [];
    return null;
  };

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // Clicking a project row toggles expand/collapse (like the caret) and marks it
  // active (so the + button targets it / Docs scans its folder). It does NOT open
  // a session anymore — sessions open only when a session row is clicked.
  const selectProject = (projectId: string) => {
    toggleProjectExpanded(projectId);
    onSelectProject(projectId);
  };

  // Group projects by machine: local (no sshHostId) + one group per SSH host.
  const machineGroups = useMemo<MachineGroup[]>(() => {
    const hosts = loadSshHosts();
    const hostById = new Map(hosts.map((h) => [h.id, h]));
    const local: Project[] = [];
    const byHost = new Map<string, Project[]>();
    for (const project of projects) {
      if (project.sshHostId) {
        const list = byHost.get(project.sshHostId) ?? [];
        list.push(project);
        byHost.set(project.sshHostId, list);
      } else {
        local.push(project);
      }
    }
    const result: MachineGroup[] = [];
    if (local.length > 0) {
      result.push({ id: "local", kind: "local", label: "This PC", projects: local });
    }
    const hostIds = Array.from(byHost.keys()).sort((a, b) => {
      const la = hostById.get(a)?.label ?? a;
      const lb = hostById.get(b)?.label ?? b;
      return la.localeCompare(lb);
    });
    for (const hostId of hostIds) {
      const host = hostById.get(hostId);
      result.push({
        id: `ssh:${hostId}`,
        kind: "ssh",
        label: host?.label ?? "(unknown host)",
        hostSummary: host ? sshHostSummary(host) : undefined,
        projects: byHost.get(hostId)!,
      });
    }
    return result;
  }, [projects]);

  // Only show machine headers once at least one remote project exists; a
  // local-only setup stays flat as before.
  const groupByMachine = projects.some((p) => p.sshHostId);
  const machineExpanded = (machineId: string) =>
    searchTerm.length > 0 || activeOnly || !collapsedMachineIds.has(machineId);

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
    sessionLocked: boolean,
    compact: boolean
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
          compact ? "agent-item-compact" : "",
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
          <span
            className="agent-name"
            title={
              compact
                ? `${a.name} · ${
                    a.lastSessionId
                      ? `session ${a.lastSessionId.slice(0, 8)}`
                      : "new session"
                  } - 더블클릭으로 별명 변경`
                : `${a.name} - 더블클릭으로 별명 변경`
            }
          >
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
        {!compact && (
          <div className="agent-folder" title={a.lastSessionId ?? ""}>
            {a.lastSessionId
              ? `session ${a.lastSessionId.slice(0, 8)}`
              : "new session"}
          </div>
        )}
      </li>
    );
  };

  const renderProject = (project: Project) => {
    const sections = filterSections(project.id, project.name);
    if (sections === null) return null;
    const expanded =
      searchTerm.length > 0 || activeOnly || expandedProjectIds.has(project.id);
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
          e.dataTransfer.setData("application/x-multiagent-project", project.id);
          setDraggingProjectId(project.id);
        }}
        onDragOver={(e) => {
          if (
            !e.dataTransfer.types.includes("application/x-multiagent-project")
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
          setProjectDropTarget((cur) => (cur?.id === project.id ? null : cur));
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
            if (
              (e.target as HTMLElement).closest("button.project-caret-btn")
            ) {
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
            title={`${project.name}\n${
              project.sshHostId
                ? `SSH: ${project.remoteFolder || "(remote)"}`
                : project.folder
            }`}
          >
            <span className="project-name">{project.name}</span>
            {project.sshHostId && (
              <span className="project-ssh-badge">SSH</span>
            )}
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
                    section.sessionLocked,
                    true
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
            className={`always-on-top-btn ${
              alwaysOnTop ? "always-on-top-active" : ""
            }`}
            onClick={onToggleAlwaysOnTop}
            title={alwaysOnTop ? "상시 최상단 해제" : "상시 최상단 활성화"}
            aria-pressed={alwaysOnTop}
          >
            <span className="always-on-top-icon" aria-hidden="true" />
          </button>
          <button
            className="new-window-btn"
            onClick={onOpenNewWindow}
            title="새 창 열기"
          >
            <span className="new-window-icon" aria-hidden="true" />
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
            className={`section-action-btn active-only-btn ${
              activeOnly ? "active-only-on" : ""
            }`}
            onClick={() => setActiveOnly((v) => !v)}
            title={activeOnly ? "전체 세션 보기" : "활성 세션만 보기"}
            aria-pressed={activeOnly}
          >
            ●
          </button>
          <button
            className="section-action-btn"
            onClick={onNewProject}
            title="New project"
          >
            +
          </button>
        </div>
        <div className="sidebar-search">
          <input
            className="sidebar-search-input"
            value={searchQuery}
            placeholder="프로젝트 · 세션 검색"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="sidebar-search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
        {groupByMachine
          ? machineGroups.map((group) => {
              const visible = group.projects.filter(
                (p) => filterSections(p.id, p.name) !== null
              );
              if (visible.length === 0) return null;
              const mExpanded = machineExpanded(group.id);
              return (
                <div key={group.id} className="machine-node">
                  <div className="machine-row">
                    <button
                      className="machine-caret-btn"
                      onClick={() => toggleMachineExpanded(group.id)}
                      title={mExpanded ? "Collapse" : "Expand"}
                    >
                      {mExpanded ? "v" : ">"}
                    </button>
                    <div
                      className="machine-item"
                      title={group.hostSummary ?? group.label}
                    >
                      <span className="machine-icon" aria-hidden="true">
                        {group.kind === "local" ? "🖥️" : "☁️"}
                      </span>
                      <span className="machine-name">{group.label}</span>
                      {group.kind === "ssh" && (
                        <span className="project-ssh-badge">SSH</span>
                      )}
                    </div>
                  </div>
                  {mExpanded && (
                    <div className="machine-projects">
                      {visible.map((project) => renderProject(project))}
                    </div>
                  )}
                </div>
              );
            })
          : projects.map((project) => renderProject(project))}
        {projects.length === 0 && (
          <div className="empty-hint">Click + to add a project</div>
        )}
        {projects.length > 0 &&
          activeOnly &&
          !projects.some((p) => filterSections(p.id, p.name) !== null) && (
            <div className="empty-hint">실행 중인 세션이 없습니다</div>
          )}
      </div>
    </aside>
  );
}
