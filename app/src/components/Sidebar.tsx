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
  ProjectFolder,
} from "../types";
import { collectAgentIdsInOrder } from "../lib/layout";
import { isAgentRuntimeActive } from "../lib/agentActivity";
import { loadSshHosts, sshHostSummary } from "../lib/sshHosts";
import { useAppLanguage } from "../lib/appLanguage";

const LS_EXPANDED_PROJECTS = "multiagent.expandedProjects.v1";
const LS_COLLAPSED_MACHINES = "multiagent.collapsedMachines.v1";
const LS_COLLAPSED_PROJECT_FOLDERS =
  "multiagent.collapsedProjectFolders.v1";
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

function loadCollapsedProjectFolders(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED_PROJECT_FOLDERS);
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
  projectFolders,
  agents,
  groups,
  activeProjectId,
  activeGroupId,
  activeAgentId,
  inGroupAgentIds,
  detachedAgentIds,
  unreadCompletedAgentIds,
  dragState,
  browserHubActive = false,
  browserCount = 0,
  onOpenBrowserHub,
  onSelectProject,
  onSelect,
  onSelectScreen,
  onRenameSession,
  onContextMenu,
  onNewProject,
  onNewProjectFolder,
  onNewSessionForProject,
  onDeactivate,
  onDragStart,
  onDragEnd,
  onMoveProject,
  onReorderProjectFolder,
  onProjectContextMenu,
  onProjectFolderContextMenu,
  sessionPickerMode = false,
  detachedLabel = "다른 창",
}: {
  projects: Project[];
  projectFolders: ProjectFolder[];
  agents: Agent[];
  groups: Group[];
  activeProjectId: string | null;
  activeGroupId: string | null;
  activeAgentId: string | null;
  inGroupAgentIds: Set<string>;
  detachedAgentIds: Set<string>;
  unreadCompletedAgentIds: Set<string>;
  dragState: DragState | null;
  browserHubActive?: boolean;
  browserCount?: number;
  onOpenBrowserHub?: () => void;
  onSelectProject: (id: string) => void;
  onSelect: (id: string) => void;
  onSelectScreen: (groupId: string, agentId: string) => void;
  onRenameSession: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onNewProject: () => void;
  onNewProjectFolder: (machineKey: string) => void;
  onNewSessionForProject: (projectId: string) => void;
  onDeactivate: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMoveProject: (
    projectId: string,
    projectFolderId: string | null,
    targetProjectId?: string,
    before?: boolean
  ) => void;
  onReorderProjectFolder: (
    draggedId: string,
    targetId: string,
    before: boolean
  ) => void;
  onProjectContextMenu: (projectId: string, x: number, y: number) => void;
  onProjectFolderContextMenu: (
    projectFolderId: string,
    x: number,
    y: number
  ) => void;
  sessionPickerMode?: boolean;
  detachedLabel?: string;
}) {
  const { text } = useAppLanguage();
  const localizedDetachedLabel =
    detachedLabel === "다른 창" ? text("다른 창", "Other window") : detachedLabel;
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => loadExpandedProjects(projects)
  );
  const [projectDropTarget, setProjectDropTarget] = useState<{
    id: string;
    before: boolean;
  } | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [draggingProjectFolderId, setDraggingProjectFolderId] = useState<
    string | null
  >(null);
  const [projectFolderDropTarget, setProjectFolderDropTarget] = useState<{
    id: string;
    before: boolean;
  } | null>(null);
  const [projectIntoFolderTarget, setProjectIntoFolderTarget] = useState<
    string | null
  >(null);
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
  const [collapsedProjectFolderIds, setCollapsedProjectFolderIds] = useState<
    Set<string>
  >(() => loadCollapsedProjectFolders());

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_COLLAPSED_MACHINES,
        JSON.stringify(Array.from(collapsedMachineIds))
      );
    } catch {}
  }, [collapsedMachineIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_COLLAPSED_PROJECT_FOLDERS,
        JSON.stringify(Array.from(collapsedProjectFolderIds))
      );
    } catch {}
  }, [collapsedProjectFolderIds]);

  const toggleMachineExpanded = (machineId: string) => {
    setCollapsedMachineIds((current) => {
      const next = new Set(current);
      if (next.has(machineId)) next.delete(machineId);
      else next.add(machineId);
      return next;
    });
  };

  const toggleProjectFolderExpanded = (projectFolderId: string) => {
    setCollapsedProjectFolderIds((current) => {
      const next = new Set(current);
      if (next.has(projectFolderId)) next.delete(projectFolderId);
      else next.add(projectFolderId);
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
    projectName: string,
    ancestorMatchesSearch = false
  ): Section[] | null => {
    const sections = sectionsByProject.get(projectId) ?? [];
    const projectMatchesSearch =
      ancestorMatchesSearch ||
      (searchTerm.length > 0 && projectName.toLowerCase().includes(searchTerm));
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
          members: s.members.filter(isAgentRuntimeActive),
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
    if (
      local.length > 0 ||
      projectFolders.some((folder) => folder.machineKey === "local")
    ) {
      result.push({ id: "local", kind: "local", label: "This PC", projects: local });
    }
    const hostIds = Array.from(
      new Set([
        ...byHost.keys(),
        ...projectFolders
          .filter((folder) => folder.machineKey.startsWith("ssh:"))
          .map((folder) => folder.machineKey.slice(4)),
      ])
    ).sort((a, b) => {
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
        projects: byHost.get(hostId) ?? [],
      });
    }
    return result;
  }, [projectFolders, projects]);

  // Only show machine headers once at least one remote project exists; a
  // local-only setup stays flat as before.
  const groupByMachine =
    projects.some((p) => p.sshHostId) ||
    projectFolders.some((folder) => folder.machineKey.startsWith("ssh:"));
  const machineExpanded = (machineId: string) =>
    searchTerm.length > 0 || !collapsedMachineIds.has(machineId);

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
        !sessionPickerMode &&
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
    const isDetached = detachedAgentIds.has(a.id);
    const hasUnreadCompletion = unreadCompletedAgentIds.has(a.id);
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
          isDetached ? "agent-detached" : "",
          hasUnreadCompletion ? "agent-completion-unread" : "",
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
        onPointerDown={(e) => {
          if (isDetached) return;
          startSessionPointer(a.id, e);
        }}
        onDoubleClick={(e) => {
          if (isDetached || sessionPickerMode) return;
          if ((e.target as HTMLElement).closest("button")) return;
          pendingSessionClickRef.current = null;
          e.preventDefault();
          e.stopPropagation();
          onRenameSession(a.id);
        }}
        onContextMenu={(e) => {
          if (isDetached || sessionPickerMode) return;
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
                  } - ${text("더블클릭으로 별명 변경", "double-click to rename")}`
                : `${a.name} - ${text("더블클릭으로 별명 변경", "double-click to rename")}`
            }
          >
            {a.name}
          </span>
          {hasUnreadCompletion && (
            <span
              className="agent-completion-dot"
              title={text("작업 완료 · 클릭해서 확인", "Work completed · click to review")}
              aria-label={text("읽지 않은 작업 완료", "Unread completion")}
            />
          )}
          {screen && (
            <span
              className="agent-screen-badge"
              title={text(`Screen ${screen.number} 분할 그룹`, `Screen ${screen.number} split group`)}
            >
              S{screen.number}
            </span>
          )}
          {sessionLocked && (
            <span
              className="agent-session-pin"
              title={text("이 그룹은 고정된 세션으로 열립니다", "This group opens with pinned sessions")}
            >
              PIN
            </span>
          )}
          {isDetached && (
            <span
              className="agent-detached-badge"
              title={text("다른 창에서 사용 중", "In use in another window")}
            >
              {localizedDetachedLabel}
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
          {!isDetached && !sessionPickerMode && (
            <button
              className="deactivate-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeactivate(a.id);
              }}
              title={text("세션 비활성화", "Deactivate session")}
              aria-label={text(`${a.name} 세션 비활성화`, `Deactivate ${a.name} session`)}
            >
              x
            </button>
          )}
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

  const renderProject = (
    project: Project,
    effectiveProjectFolderId: string | null = null,
    ancestorMatchesSearch = false
  ) => {
    const sections = filterSections(
      project.id,
      project.name,
      ancestorMatchesSearch
    );
    if (sections === null) return null;
    const expanded =
      searchTerm.length > 0 || expandedProjectIds.has(project.id);
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
          if (sessionPickerMode) {
            e.preventDefault();
            return;
          }
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
            onMoveProject(
              draggedId,
              effectiveProjectFolderId,
              project.id,
              target.before
            );
          }
        }}
        onDragEnd={() => {
          setProjectDropTarget(null);
          setDraggingProjectId(null);
        }}
      >
        <div
          className="project-row"
          draggable={!sessionPickerMode}
          onContextMenu={(e) => {
            if (sessionPickerMode) return;
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
          {!sessionPickerMode && (
            <button
              className="project-add-session-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNewSessionForProject(project.id);
              }}
              title={text(`${project.name}에 새 세션`, `New session in ${project.name}`)}
            >
              +
            </button>
          )}
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
                {text("프로젝트 행의 + 버튼으로 세션을 시작하세요", "Use the + button on the project row to start a session")}
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  const renderMachineProjects = (machine: MachineGroup) => {
    const machineFolders = projectFolders.filter(
      (folder) => folder.machineKey === machine.id
    );
    if (machineFolders.length === 0) {
      return machine.projects.map((project) => renderProject(project));
    }

    const validFolderIds = new Set(machineFolders.map((folder) => folder.id));
    const buckets: Array<{
      key: string;
      folder: ProjectFolder | null;
      name: string;
      projects: Project[];
    }> = machineFolders.map((folder) => ({
      key: folder.id,
      folder,
      name: folder.name,
      projects: machine.projects.filter(
        (project) => project.projectFolderId === folder.id
      ),
    }));
    const uncategorized = machine.projects.filter(
      (project) =>
        !project.projectFolderId || !validFolderIds.has(project.projectFolderId)
    );
    if (uncategorized.length > 0) {
      buckets.push({
        key: `uncategorized:${machine.id}`,
        folder: null,
        name: text("미분류", "Uncategorized"),
        projects: uncategorized,
      });
    }

    return buckets.map((bucket) => {
      const folderMatchesSearch =
        searchTerm.length > 0 && bucket.name.toLowerCase().includes(searchTerm);
      const visibleProjects = bucket.projects.filter(
        (project) =>
          filterSections(
            project.id,
            project.name,
            folderMatchesSearch
          ) !== null
      );
      if (
        (searchTerm || activeOnly) &&
        visibleProjects.length === 0 &&
        !folderMatchesSearch
      ) {
        return null;
      }

      const expanded =
        searchTerm.length > 0 ||
        !collapsedProjectFolderIds.has(bucket.key);
      const isIntoTarget = projectIntoFolderTarget === bucket.key;
      const isFolderDropTarget =
        bucket.folder && projectFolderDropTarget?.id === bucket.folder.id;
      const dropBefore =
        isFolderDropTarget && projectFolderDropTarget?.before;
      const dropAfter =
        isFolderDropTarget && !projectFolderDropTarget?.before;

      return (
        <div
          key={bucket.key}
          className={[
            "project-folder-node",
            isIntoTarget ? "project-folder-drop-inside" : "",
            dropBefore ? "project-folder-drop-before" : "",
            dropAfter ? "project-folder-drop-after" : "",
            draggingProjectFolderId === bucket.folder?.id
              ? "project-folder-dragging"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div
            className="project-folder-row"
            draggable={!sessionPickerMode && !!bucket.folder}
            onDragStart={(event) => {
              if (!bucket.folder || sessionPickerMode) {
                event.preventDefault();
                return;
              }
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                "application/x-multiagent-project-folder",
                bucket.folder.id
              );
              setDraggingProjectFolderId(bucket.folder.id);
            }}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes(
                  "application/x-multiagent-project"
                )
              ) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                setProjectIntoFolderTarget(bucket.key);
                return;
              }
              if (
                bucket.folder &&
                event.dataTransfer.types.includes(
                  "application/x-multiagent-project-folder"
                )
              ) {
                event.preventDefault();
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                const before = event.clientY - rect.top < rect.height / 2;
                setProjectFolderDropTarget({
                  id: bucket.folder.id,
                  before,
                });
              }
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next && event.currentTarget.contains(next)) return;
              setProjectIntoFolderTarget((current) =>
                current === bucket.key ? null : current
              );
              if (bucket.folder) {
                setProjectFolderDropTarget((current) =>
                  current?.id === bucket.folder!.id ? null : current
                );
              }
            }}
            onDrop={(event) => {
              const draggedProjectId = event.dataTransfer.getData(
                "application/x-multiagent-project"
              );
              if (draggedProjectId) {
                event.preventDefault();
                event.stopPropagation();
                onMoveProject(
                  draggedProjectId,
                  bucket.folder?.id ?? null
                );
              } else if (bucket.folder) {
                const draggedFolderId = event.dataTransfer.getData(
                  "application/x-multiagent-project-folder"
                );
                if (draggedFolderId && draggedFolderId !== bucket.folder.id) {
                  event.preventDefault();
                  event.stopPropagation();
                  onReorderProjectFolder(
                    draggedFolderId,
                    bucket.folder.id,
                    projectFolderDropTarget?.before ?? true
                  );
                }
              }
              setProjectIntoFolderTarget(null);
              setProjectDropTarget(null);
              setProjectFolderDropTarget(null);
              setDraggingProjectId(null);
              setDraggingProjectFolderId(null);
            }}
            onDragEnd={() => {
              setProjectIntoFolderTarget(null);
              setProjectDropTarget(null);
              setProjectFolderDropTarget(null);
              setDraggingProjectFolderId(null);
            }}
            onContextMenu={(event) => {
              if (!bucket.folder || sessionPickerMode) return;
              event.preventDefault();
              onProjectFolderContextMenu(
                bucket.folder.id,
                event.clientX,
                event.clientY
              );
            }}
          >
            <button
              className="project-folder-caret-btn"
              onClick={() => toggleProjectFolderExpanded(bucket.key)}
              title={expanded ? text("폴더 접기", "Collapse folder") : text("폴더 펼치기", "Expand folder")}
            >
              {expanded ? "v" : ">"}
            </button>
            <button
              className="project-folder-item"
              onClick={() => toggleProjectFolderExpanded(bucket.key)}
              title={
                bucket.folder
                  ? text(`${bucket.name} · 우클릭으로 관리`, `${bucket.name} · right-click to manage`)
                  : text("폴더에 속하지 않은 프로젝트", "Projects not assigned to a folder")
              }
            >
              <span className="project-folder-icon" aria-hidden="true">
                {expanded ? "▾" : "▸"}
              </span>
              <span className="project-folder-name">{bucket.name}</span>
              <span className="project-folder-count">
                {bucket.projects.length}
              </span>
            </button>
          </div>
          {expanded && (
            <div className="project-folder-projects">
              {visibleProjects.map((project) =>
                renderProject(
                  project,
                  bucket.folder?.id ?? null,
                  folderMatchesSearch
                )
              )}
              {bucket.projects.length === 0 && (
                <div className="empty-hint project-folder-empty-hint">
                  {text("프로젝트를 여기로 끌어오세요", "Drag projects here")}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <aside className="sidebar">
      <div className="project-tree">
        {!sessionPickerMode && onOpenBrowserHub && (
          <div className="browser-hub-sidebar-slot">
            <button
              className={`browser-hub-sidebar-btn${browserHubActive ? " is-active" : ""}`}
              onClick={onOpenBrowserHub}
              aria-pressed={browserHubActive}
              title={text("이 프로그램에서 열려 있는 모든 브라우저 보기", "View every browser open in this app")}
            >
              <span className="browser-hub-sidebar-icon" aria-hidden="true">WEB</span>
              <span className="browser-hub-sidebar-label">{text("브라우저 모아보기", "Browser hub")}</span>
              <span className="browser-hub-sidebar-count">{browserCount}</span>
            </button>
          </div>
        )}
        <div className="sidebar-section-heading">
          <div className="sidebar-section-title">
            {sessionPickerMode ? text("Projects · 세션 선택", "Projects · Select session") : "Projects"}
          </div>
          <button
            className={`section-action-btn active-only-btn ${
              activeOnly ? "active-only-on" : ""
            }`}
            onClick={() => setActiveOnly((v) => !v)}
            title={activeOnly ? text("전체 세션 보기", "Show all sessions") : text("활성 세션만 보기", "Show active sessions only")}
            aria-pressed={activeOnly}
          >
            ●
          </button>
          <button
            className="section-action-btn project-folder-create-btn"
            onClick={() => onNewProjectFolder("local")}
            title={text("새 프로젝트 폴더", "New project folder")}
            aria-label={text("새 프로젝트 폴더", "New project folder")}
          >
            ▣
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
            placeholder={text("프로젝트 · 세션 검색", "Search projects and sessions")}
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
                      screen.direction === "h" ? text("좌우 분할", "Horizontal split") : text("상하 분할", "Vertical split")
                    }
                    aria-label={
                      screen.direction === "h" ? text("좌우 분할", "Horizontal split") : text("상하 분할", "Vertical split")
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
              const machineFolders = projectFolders.filter(
                (folder) => folder.machineKey === group.id
              );
              const folderById = new Map(
                machineFolders.map((folder) => [folder.id, folder])
              );
              const visible = group.projects.filter(
                (project) => {
                  const folder = project.projectFolderId
                    ? folderById.get(project.projectFolderId)
                    : null;
                  const folderMatches =
                    searchTerm.length > 0 &&
                    !!folder?.name.toLowerCase().includes(searchTerm);
                  return (
                    filterSections(
                      project.id,
                      project.name,
                      folderMatches
                    ) !== null
                  );
                }
              );
              const emptyFolderMatches = machineFolders.some(
                (folder) =>
                  searchTerm.length > 0 &&
                  folder.name.toLowerCase().includes(searchTerm)
              );
              if (
                visible.length === 0 &&
                !emptyFolderMatches &&
                (searchTerm.length > 0 || activeOnly || machineFolders.length === 0)
              ) {
                return null;
              }
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
                    {!sessionPickerMode && (
                      <button
                        className="machine-add-folder-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onNewProjectFolder(group.id);
                        }}
                        title={text(`${group.label}에 프로젝트 폴더 추가`, `Add a project folder to ${group.label}`)}
                        aria-label={text(`${group.label}에 프로젝트 폴더 추가`, `Add a project folder to ${group.label}`)}
                      >
                        +
                      </button>
                    )}
                  </div>
                  {mExpanded && (
                    <div className="machine-projects">
                      {renderMachineProjects(group)}
                    </div>
                  )}
                </div>
              );
            })
          : renderMachineProjects({
              id: "local",
              kind: "local",
              label: "This PC",
              projects,
            })}
        {projects.length === 0 && (
          <div className="empty-hint">Click + to add a project</div>
        )}
        {projects.length > 0 &&
          activeOnly &&
          !projects.some((p) => filterSections(p.id, p.name) !== null) && (
            <button
              type="button"
              className="empty-hint empty-hint-action"
              onClick={() => setActiveOnly(false)}
              title={text("전체 세션 보기로 전환", "Switch to all sessions")}
            >
              {text(
                `활성 세션 없음 · 숨겨진 프로젝트 ${projects.length}개`,
                `No active sessions · ${projects.length} hidden project${projects.length === 1 ? "" : "s"}`,
              )}
              <span className="empty-hint-cta">{text("클릭해서 전체 보기", "Click to show all")}</span>
            </button>
          )}
      </div>
    </aside>
  );
}
