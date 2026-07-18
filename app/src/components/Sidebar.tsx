import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toolForId } from "../types";
import type {
  Agent,
  DragState,
  Group,
  LayoutNode,
  LeafNode,
  Project,
} from "../types";
import { collectAgentIdsInOrder } from "../lib/layout";
import { loadSshHosts, sshHostSummary } from "../lib/sshHosts";

const LS_EXPANDED_PROJECTS = "multiagent.expandedProjects.v1";
const LS_COLLAPSED_MACHINES = "multiagent.collapsedMachines.v1";
const LS_ACTIVE_ONLY = "multiagent.activeOnly.v1";

const SCREEN_COLORS = [
  "#58a6ff",
  "#bc8cff",
  "#39c5cf",
  "#f0883e",
  "#d2a8ff",
  "#4f9cf9",
];

function loadActiveOnly(): boolean {
  try {
    return localStorage.getItem(LS_ACTIVE_ONLY) === "1";
  } catch {
    return false;
  }
}

// A session is "active" when its PTY is alive (spawned and not exited).
function isActiveStatus(status: string): boolean {
  return (
    status === "running" ||
    status === "working" ||
    status === "waiting" ||
    status === "blocked" ||
    status === "starting"
  );
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

type ScreenSummary = {
  groupId: string;
  number: number;
  color: string;
  direction: "h" | "v";
  label: string;
  title: string;
  memberIds: string[];
  targetAgentId: string;
};

function collectLeaves(node: LayoutNode, out: LeafNode[] = []): LeafNode[] {
  if (node.type === "leaf") {
    out.push(node);
    return out;
  }
  for (const child of node.children) collectLeaves(child, out);
  return out;
}

type PendingSessionClick = {
  agentId: string;
  pointerId: number;
  x: number;
  y: number;
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
  onSelectScreen,
  onRenameSession,
  onContextMenu,
  onNewProject,
  onNewSessionForProject,
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
  onSelectScreen: (groupId: string, agentId: string) => void;
  onRenameSession: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onNewProject: () => void;
  onNewSessionForProject: (projectId: string) => void;
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

  const screens = useMemo<ScreenSummary[]>(() => {
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const projectById = new Map(
      projects.map((project) => [project.id, project])
    );
    const result: ScreenSummary[] = [];

    for (const group of groups) {
      if (group.layout.type !== "split") continue;
      const leaves = collectLeaves(group.layout);
      if (leaves.length < 2) continue;

      const memberIds = collectAgentIdsInOrder(group.layout).filter((id) =>
        agentById.has(id)
      );
      if (memberIds.length < 2) continue;

      const paneLabels = leaves.map((leaf) => {
        const knownTabs = leaf.tabs.filter((id) => agentById.has(id));
        const activeId = agentById.has(leaf.tabs[leaf.activeIndex])
          ? leaf.tabs[leaf.activeIndex]
          : knownTabs[0];
        const activeName = activeId
          ? agentById.get(activeId)?.name ?? activeId
          : "Empty";
        const extraTabs = Math.max(0, knownTabs.length - 1);
        return extraTabs > 0 ? `${activeName}(+${extraTabs})` : activeName;
      });
      const number = result.length + 1;
      const targetAgentId =
        activeAgentId && memberIds.includes(activeAgentId)
          ? activeAgentId
          : memberIds[0];
      const memberDescriptions = memberIds.map((id) => {
        const agent = agentById.get(id)!;
        const projectName = projectById.get(agent.projectId)?.name ?? "Unknown";
        return `${projectName} / ${agent.name}`;
      });

      result.push({
        groupId: group.id,
        number,
        color: SCREEN_COLORS[(number - 1) % SCREEN_COLORS.length],
        direction: group.layout.direction,
        label: `(${paneLabels.join(" + ")})`,
        title: [`Screen ${number}`, ...memberDescriptions].join("\n"),
        memberIds,
        targetAgentId,
      });
    }

    return result;
  }, [activeAgentId, agents, groups, projects]);

  const screenByAgentId = useMemo(() => {
    const result = new Map<string, ScreenSummary>();
    for (const screen of screens) {
      for (const agentId of screen.memberIds) result.set(agentId, screen);
    }
    return result;
  }, [screens]);

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
    const pending: PendingSessionClick = {
      agentId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    pendingSessionClickRef.current = pending;

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pending.pointerId) return;
      if (
        !pending.dragging &&
        Math.hypot(moveEvent.clientX - pending.x, moveEvent.clientY - pending.y) >
          4
      ) {
        pending.dragging = true;
        moveEvent.preventDefault();
        onDragStart(agentId);
      }
      if (pending.dragging) {
        moveEvent.preventDefault();
      }
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pending.pointerId) return;
      cleanup();
      pendingSessionClickRef.current = null;
      if (pending.dragging) {
        upEvent.preventDefault();
        return;
      }
      if ((upEvent.target as HTMLElement | null)?.closest("button")) return;
      onSelect(agentId);
    };

    const handleCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pending.pointerId) return;
      cleanup();
      pendingSessionClickRef.current = null;
      if (pending.dragging) onDragEnd();
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);
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
    const screen = screenByAgentId.get(a.id);
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
        style={
          screen
            ? ({ "--screen-color": screen.color } as CSSProperties)
            : undefined
        }
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => startSessionPointer(a.id, e)}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          pendingSessionClickRef.current = null;
          e.preventDefault();
          e.stopPropagation();
          onRenameSession(a.id);
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
          {screen && (
            <span
              className="agent-screen-badge"
              title={`Screen ${screen.number} 분할 그룹`}
            >
              S{screen.number}
            </span>
          )}
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
        draggable={false}
        onDragStart={(e) => {
          if ((e.target as HTMLElement).closest(".project-session-list")) {
            e.preventDefault();
            e.stopPropagation();
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
          draggable
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
          <button
            className="project-add-session-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNewSessionForProject(project.id);
            }}
            title={`${project.name}에 새 세션`}
          >
            +
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
                프로젝트 행의 + 버튼으로 세션을 시작하세요
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar">
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
        {screens.length > 0 && (
          <section className="screen-groups" aria-label="Split screens">
            <div className="screen-groups-heading">
              <span>SCREENS</span>
              <span className="screen-groups-count">{screens.length}</span>
            </div>
            <div className="screen-groups-list">
              {screens.map((screen) => (
                <button
                  key={screen.groupId}
                  className={`screen-group-row ${
                    screen.groupId === activeGroupId
                      ? "screen-group-row-active"
                      : ""
                  }`}
                  style={
                    { "--screen-color": screen.color } as CSSProperties
                  }
                  onClick={() =>
                    onSelectScreen(screen.groupId, screen.targetAgentId)
                  }
                  title={screen.title}
                >
                  <span className="screen-group-rail" aria-hidden="true" />
                  <span className="screen-group-name">
                    Screen {screen.number}
                  </span>
                  <span className="screen-group-members">{screen.label}</span>
                  <span
                    className="screen-group-direction"
                    title={
                      screen.direction === "h" ? "좌우 분할" : "상하 분할"
                    }
                    aria-label={
                      screen.direction === "h" ? "좌우 분할" : "상하 분할"
                    }
                  >
                    {screen.direction === "h" ? "↔" : "↕"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
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
