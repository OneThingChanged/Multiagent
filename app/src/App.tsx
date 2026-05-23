import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

import {
  LS_AGENTS,
  LS_GROUPS,
  LS_PROJECTS,
  LS_VIEW,
  toolForId,
} from "./types";
import type {
  Agent,
  AgentStatus,
  ContextMenuState,
  DragState,
  DropTargetState,
  DropZone,
  Group,
  NewAgentPayload,
  NewProjectPayload,
  Path,
  Project,
  StoredAgent,
  StoredProject,
  TabCtxState,
  TerminalEntry,
  Toast,
} from "./types";
import {
  activeAgentInLeaf,
  collectAgentIds,
  findLeafPath,
  getAt,
} from "./lib/layout";
import * as groupOps from "./lib/groupOps";
import { loadBootstrap } from "./lib/persistence";
import type { Bootstrap } from "./lib/persistence";
import { applyTerminalTheme, notifyDone } from "./lib/terminal";
import { loadAppTheme, saveAppTheme } from "./lib/appTheme";
import type { AppThemeId } from "./lib/appTheme";

import { Sidebar } from "./components/Sidebar";
import { TerminalArea } from "./components/TerminalArea";
import { NewAgentModal } from "./components/NewAgentModal";
import { NewProjectModal } from "./components/NewProjectModal";
import { ToastContainer } from "./components/Toast";
import { ContextMenu, TabContextMenu } from "./components/Menus";
import { DocsPanel } from "./components/DocsPanel";
import { SettingsModal } from "./components/SettingsModal";
import { RenameSessionModal } from "./components/RenameSessionModal";

const LS_DOCS_WIDTH = "multiagent.docsWidth.v1";
const DEFAULT_DOCS_WIDTH = 640;
const MIN_DOCS_WIDTH = 360;
const MIN_WORKSPACE_WIDTH = 260;

type DocsRequest = {
  projectId: string;
  relativePath: string;
  key: number;
};

function clampDocsWidth(width: number) {
  const viewportMax =
    typeof window === "undefined"
      ? DEFAULT_DOCS_WIDTH
      : Math.max(MIN_DOCS_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH);
  if (!Number.isFinite(width)) return DEFAULT_DOCS_WIDTH;
  return Math.min(viewportMax, Math.max(MIN_DOCS_WIDTH, Math.round(width)));
}

function loadDocsWidth() {
  try {
    const raw = localStorage.getItem(LS_DOCS_WIDTH);
    return raw ? clampDocsWidth(Number(raw)) : DEFAULT_DOCS_WIDTH;
  } catch {
    return DEFAULT_DOCS_WIDTH;
  }
}

function firstProjectSessionFocus(
  projectId: string,
  agents: Agent[],
  groups: Group[]
): { agentId: string; groupId: string; path: Path } | null {
  const projectAgentIds = agents
    .filter((agent) => agent.projectId === projectId)
    .map((agent) => agent.id);

  for (const group of groups) {
    for (const agentId of projectAgentIds) {
      const path = findLeafPath(group.layout, agentId);
      if (path) return { agentId, groupId: group.id, path };
    }
  }

  return null;
}

function App() {
  // One-shot bootstrap: read localStorage exactly once at mount.
  const bootstrapRef = useRef<Bootstrap | null>(null);
  if (!bootstrapRef.current) bootstrapRef.current = loadBootstrap();
  const boot = bootstrapRef.current;

  const [projects, setProjects] = useState<Project[]>(boot.projects);
  const [agents, setAgents] = useState<Agent[]>(boot.agents);
  const [groups, setGroups] = useState<Group[]>(boot.groups);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    boot.activeProjectId
  );
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    boot.activeGroupId
  );
  const [activePath, setActivePath] = useState<Path | null>(boot.activePath);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appTheme, setAppTheme] = useState<AppThemeId>(loadAppTheme);
  const [docsWidth, setDocsWidth] = useState(loadDocsWidth);
  const [docsRequest, setDocsRequest] = useState<DocsRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabCtxState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  const termsRef = useRef<Map<string, TerminalEntry>>(new Map());
  const agentsRef = useRef<Agent[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const activePathRef = useRef<Path | null>(null);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // ---- Persistence

  useEffect(() => {
    const storedProjects: StoredProject[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      folder: project.folder,
      createdAt: project.createdAt,
      lastOpenedAt: project.lastOpenedAt,
    }));
    try {
      localStorage.setItem(LS_PROJECTS, JSON.stringify(storedProjects));
    } catch {}
  }, [projects]);

  useEffect(() => {
    const configs: StoredAgent[] = agents.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      name: a.name,
      folder: a.folder,
      aiToolId: a.aiToolId,
      dangerous: a.dangerous,
      createdAt: a.createdAt,
      lastSessionId: a.lastSessionId,
    }));
    try {
      localStorage.setItem(LS_AGENTS, JSON.stringify(configs));
    } catch {}
  }, [agents]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_GROUPS, JSON.stringify(groups));
    } catch {}
  }, [groups]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_VIEW,
        JSON.stringify({ activeProjectId, activeGroupId, activePath })
      );
    } catch {}
  }, [activeProjectId, activeGroupId, activePath]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_DOCS_WIDTH, String(docsWidth));
    } catch {}
  }, [docsWidth]);

  useEffect(() => {
    for (const entry of termsRef.current.values()) {
      applyTerminalTheme(entry.term, appTheme);
    }
  }, [appTheme]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const handleThemeChange = useCallback((theme: AppThemeId) => {
    setAppTheme(theme);
    saveAppTheme(theme);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setDocsWidth((width) => clampDocsWidth(width));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      if (activeProjectId !== null) {
        setActiveProjectId(null);
        setActiveGroupId(null);
        setActivePath(null);
      }
      return;
    }

    if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
      return;
    }

    const nextProjectId = projects[0].id;
    const firstFocus = firstProjectSessionFocus(nextProjectId, agents, groups);
    setActiveProjectId(nextProjectId);
    setActiveGroupId(firstFocus?.groupId ?? null);
    setActivePath(firstFocus?.path ?? null);
  }, [activeProjectId, agents, groups, projects]);

  // ---- Notifications

  const pushToast = useCallback(
    (agentId: string, title: string, body: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, agentId, title, body }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    isPermissionGranted()
      .then((g) => {
        if (!g) return requestPermission();
      })
      .catch(() => {});
  }, []);

  // ---- PTY + hook event listeners

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const track = (u: () => void) => {
      if (cancelled) u();
      else unsubs.push(u);
    };

    listen<{ id: string; data: string }>("pty:data", (e) => {
      if (cancelled) return;
      const id = e.payload.id;
      const data = e.payload.data;
      const entry = termsRef.current.get(id);
      entry?.term.write(data);

      setAgents((cur) =>
        cur.map((a) =>
          a.id === id && (a.status === "idle" || a.status === "starting")
            ? { ...a, status: "running" }
            : a
        )
      );
    }).then(track);

    listen<{ id: string }>("pty:exit", (e) => {
      if (cancelled) return;
      setAgents((prev) =>
        prev.map((a) =>
          a.id === e.payload.id ? { ...a, status: "exited" } : a
        )
      );
    }).then(track);

    listen<void>("app:close-requested", async () => {
      if (cancelled) return;
      // Session IDs are already captured at SessionStart time; close path just
      // needs to send /quit so the tools shut down cleanly, then confirm.
      const targets = agentsRef.current.filter((a) => {
        if (a.status === "exited" || a.status === "idle") return false;
        if (a.aiToolId !== "codex" && a.aiToolId !== "claude") return false;
        const e = termsRef.current.get(a.id);
        return !!e && e.spawned;
      });
      await Promise.all(
        targets.map((a) =>
          invoke("write_pty", { id: a.id, data: "/quit\r" }).catch(() => {})
        )
      );
      await new Promise((r) =>
        setTimeout(r, targets.length > 0 ? 300 : 50)
      );
      await invoke("confirm_close").catch(() => {});
    }).then(track);

    listen<{ id: string; event: string; session_id?: string }>(
      "agent:hook-event",
      (e) => {
        if (cancelled) return;
        const { id, event, session_id } = e.payload;
        if (event === "working") {
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.status !== "exited"
                ? { ...a, status: "working" }
                : a
            )
          );
        } else if (event === "done") {
          const target = agentsRef.current.find((a) => a.id === id);
          if (target && target.status === "working") {
            notifyDone(target.name);
            pushToast(target.id, target.name, "작업이 끝났어요");
          }
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.status === "working"
                ? { ...a, status: "running" }
                : a
            )
          );
        } else if (event === "session-start" && session_id) {
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.lastSessionId !== session_id
                ? { ...a, lastSessionId: session_id }
                : a
            )
          );
        }
      }
    ).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pushToast]);

  // ---- Group operations (delegated to lib/groupOps as pure functions)

  const applyGroupOp = useCallback(
    (op: (state: groupOps.GroupState) => groupOps.GroupState) => {
      setGroups((prevGroups) => {
        const next = op({
          groups: prevGroups,
          activeGroupId: activeGroupIdRef.current,
          activePath: activePathRef.current,
        });
        setActiveGroupId(next.activeGroupId);
        setActivePath(next.activePath);
        return next.groups;
      });
    },
    []
  );

  const activateAgentProject = useCallback((agentId: string) => {
    const agent = agentsRef.current.find((candidate) => candidate.id === agentId);
    if (!agent) return null;
    setActiveProjectId(agent.projectId);
    setProjects((prev) =>
      prev.map((project) =>
        project.id === agent.projectId
          ? { ...project, lastOpenedAt: Date.now() }
          : project
      )
    );
    return agent;
  }, []);

  const selectAgent = useCallback(
    (agentId: string) => {
      const agent = activateAgentProject(agentId);
      applyGroupOp((s) => groupOps.selectAgent(s, agentId, agent?.projectId));
    },
    [activateAgentProject, applyGroupOp]
  );

  const selectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, lastOpenedAt: Date.now() } : project
      )
    );

    const firstFocus = firstProjectSessionFocus(projectId, agents, groups);
    if (firstFocus) {
      applyGroupOp((s) =>
        groupOps.selectAgent(s, firstFocus.agentId, projectId)
      );
      return;
    }
    setActiveGroupId(null);
    setActivePath(null);
  }, [agents, applyGroupOp, groups]);

  const openAsTab = useCallback(
    (agentId: string) => {
      const agent = activateAgentProject(agentId);
      applyGroupOp((s) =>
        groupOps.openAsTab(
          s,
          agentId,
          agent?.projectId
        )
      );
    },
    [activateAgentProject, applyGroupOp]
  );

  const splitWith = useCallback(
    (agentId: string, direction: "h" | "v") => {
      const agent = activateAgentProject(agentId);
      applyGroupOp((s) =>
        groupOps.splitWith(
          s,
          agentId,
          direction,
          agent?.projectId
        )
      );
    },
    [activateAgentProject, applyGroupOp]
  );

  const closeTab = useCallback(
    (path: Path, agentId: string) =>
      applyGroupOp((s) =>
        groupOps.closeTab(
          s,
          path,
          agentId,
          agentsRef.current.find((agent) => agent.id === agentId)?.projectId
        )
      ),
    [applyGroupOp]
  );

  const resizeAt = useCallback(
    (path: Path, sizes: number[]) =>
      applyGroupOp((s) => groupOps.resizeAt(s, path, sizes)),
    [applyGroupOp]
  );

  const setActiveTabInPane = useCallback(
    (path: Path, agentId: string) => {
      activateAgentProject(agentId);
      applyGroupOp((s) => groupOps.setActiveTabInPane(s, path, agentId));
    },
    [activateAgentProject, applyGroupOp]
  );

  const performDrop = useCallback(
    (fromAgentId: string, targetLeafId: string, zone: DropZone) => {
      activateAgentProject(fromAgentId);
      applyGroupOp((s) =>
        groupOps.performDrop(s, fromAgentId, targetLeafId, zone)
      );
    },
    [activateAgentProject, applyGroupOp]
  );

  // ---- Agent CRUD (side effects + layout via groupOps)

  const createProject = useCallback((payload: NewProjectPayload) => {
    const id = crypto.randomUUID();
    const project: Project = {
      id,
      name: payload.name.trim() || "Project",
      folder: payload.folder.trim(),
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    };
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(id);
    setActiveGroupId(null);
    setActivePath(null);
  }, []);

  const createAgent = useCallback(
    (payload: NewAgentPayload) => {
      const project = projectsRef.current.find(
        (candidate) => candidate.id === activeProjectIdRef.current
      );
      if (!project) return;
      const id = crypto.randomUUID();
      const tool = toolForId(payload.aiToolId);

      setAgents((prev) => [
        ...prev,
        {
          id,
          projectId: project.id,
          name: payload.name.trim() || `Session ${prev.length + 1}`,
          folder: project.folder,
          aiToolId: tool.id,
          aiLabel: tool.label,
          dangerous: payload.dangerous && !!tool.dangerousFlag,
          status: "starting",
          createdAt: Date.now(),
        },
      ]);
      applyGroupOp((s) => groupOps.addNewAgent(s, id, project.id));
    },
    [applyGroupOp]
  );

  const setAgentStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const removeAgent = useCallback(
    async (id: string) => {
      await invoke("kill_pty", { id }).catch(() => {});
      const entry = termsRef.current.get(id);
      entry?.term.dispose();
      termsRef.current.delete(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      applyGroupOp((s) => groupOps.removeAgentFromLayout(s, id));
    },
    [applyGroupOp]
  );

  const renameAgent = useCallback((id: string, name: string) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, name } : agent))
    );
  }, []);

  // ---- Context menu

  const onSidebarContextMenu = useCallback(
    (agentId: string, x: number, y: number) => {
      setContextMenu({ agentId, x, y });
    },
    []
  );

  const contextGroup = useMemo(() => {
    if (!contextMenu) return null;
    return (
      groups.find((g) => collectAgentIds(g.layout).has(contextMenu.agentId)) ??
      null
    );
  }, [contextMenu, groups]);

  const canPinContextGroupSession = useMemo(() => {
    if (!contextGroup) return false;
    const ids = collectAgentIds(contextGroup.layout);
    return agents.some(
      (agent) => ids.has(agent.id) && !!agent.lastSessionId
    );
  }, [agents, contextGroup]);

  const canPlaceContextAgentInActiveGroup = useMemo(() => {
    const active = activeGroupId
      ? groups.find((g) => g.id === activeGroupId) ?? null
      : null;
    if (!contextMenu || !active || !activePath) return false;
    const activeIds = collectAgentIds(active.layout);
    const alreadyInActiveGroup = activeIds.has(contextMenu.agentId);
    if (active.sessionLocked && !alreadyInActiveGroup) return false;
    if (contextGroup?.sessionLocked && contextGroup.id !== active.id) {
      return false;
    }
    return true;
  }, [activeGroupId, activePath, contextGroup, contextMenu, groups]);

  const pinContextGroupSessions = useCallback(
    (agentId: string) => {
      const group = groups.find((g) => collectAgentIds(g.layout).has(agentId));
      const targetAgent = agents.find((a) => a.id === agentId);
      if (!group || !targetAgent) return;

      const ids = collectAgentIds(group.layout);
      const pins: Record<string, string> = {};
      for (const agent of agents) {
        if (ids.has(agent.id) && agent.lastSessionId) {
          pins[agent.id] = agent.lastSessionId;
        }
      }

      const pinCount = Object.keys(pins).length;
      if (pinCount === 0) {
        pushToast(agentId, targetAgent.name, "저장된 세션 ID가 없습니다.");
        return;
      }

      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? { ...g, sessionPins: pins, sessionLocked: true }
            : g
        )
      );
      pushToast(
        agentId,
        targetAgent.name,
        `그룹 세션 ${pinCount}개를 고정했습니다.`
      );
    },
    [agents, groups, pushToast]
  );

  const clearContextGroupSessionPins = useCallback(
    (agentId: string) => {
      const group = groups.find((g) => collectAgentIds(g.layout).has(agentId));
      const targetAgent = agents.find((a) => a.id === agentId);
      if (!group || !targetAgent) return;

      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? { ...g, sessionPins: undefined, sessionLocked: undefined }
            : g
        )
      );
      pushToast(agentId, targetAgent.name, "그룹 세션 고정을 해제했습니다.");
    },
    [agents, groups, pushToast]
  );

  const onContextAction = useCallback(
    (
      action:
        | "open"
        | "tab"
        | "split-h"
        | "split-v"
        | "rename"
        | "pin-session"
        | "clear-session-pin"
    ) => {
      if (!contextMenu) return;
      const id = contextMenu.agentId;
      setContextMenu(null);
      if (action === "open") selectAgent(id);
      else if (action === "tab") openAsTab(id);
      else if (action === "split-h") splitWith(id, "h");
      else if (action === "split-v") splitWith(id, "v");
      else if (action === "rename") setRenameSessionId(id);
      else if (action === "pin-session") pinContextGroupSessions(id);
      else if (action === "clear-session-pin") clearContextGroupSessionPins(id);
    },
    [
      contextMenu,
      selectAgent,
      openAsTab,
      splitWith,
      pinContextGroupSessions,
      clearContextGroupSessionPins,
    ]
  );

  // ---- Stable drag callbacks

  const handleDragStart = useCallback((fromAgentId: string) => {
    setDragState({ fromAgentId });
  }, []);
  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
  }, []);

  const handleDocsResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      document.body.classList.add("docs-resizing");

      const handleMove = (moveEvent: PointerEvent) => {
        setDocsWidth(clampDocsWidth(window.innerWidth - moveEvent.clientX));
      };
      const handleEnd = () => {
        document.body.classList.remove("docs-resizing");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
        window.removeEventListener("pointercancel", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
      window.addEventListener("pointercancel", handleEnd);
    },
    []
  );

  const handleOpenMarkdownPath = useCallback(
    async (agentId: string, path: string) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      const project = projectsRef.current.find(
        (candidate) => candidate.id === agent?.projectId
      );
      if (!agent || !project?.folder) return;

      try {
        const relativePath = await invoke<string>("resolve_markdown_path", {
          folder: project.folder,
          path,
        });
        selectAgent(agentId);
        setDocsOpen(true);
        setDocsRequest({
          projectId: project.id,
          relativePath,
          key: Date.now(),
        });
      } catch {
        pushToast(agentId, agent.name, "Markdown 파일을 찾을 수 없습니다.");
      }
    },
    [pushToast, selectAgent]
  );

  const setActivePathForPane = useCallback(
    (path: Path | null) => {
      if (!path) {
        setActivePath(null);
        return;
      }

      const group = activeGroupIdRef.current
        ? groups.find((candidate) => candidate.id === activeGroupIdRef.current)
        : null;
      const leaf = group ? getAt(group.layout, path) : null;
      const agentId =
        leaf && leaf.type === "leaf" ? activeAgentInLeaf(leaf) : null;
      if (agentId) {
        activateAgentProject(agentId);
      }
      setActivePath(path);
    },
    [activateAgentProject, groups]
  );

  // ---- Derived

  const activeProject = useMemo(
    () =>
      activeProjectId
        ? projects.find((project) => project.id === activeProjectId) ?? null
        : null,
    [activeProjectId, projects]
  );

  const projectAgents = useMemo(
    () =>
      activeProjectId
        ? agents.filter((agent) => agent.projectId === activeProjectId)
        : [],
    [activeProjectId, agents]
  );

  const activeGroup = useMemo(
    () =>
      activeGroupId
        ? groups.find((g) => g.id === activeGroupId) ?? null
        : null,
    [activeGroupId, groups]
  );
  const activeGroupLayout = activeGroup ? activeGroup.layout : null;

  const inGroupAgentIds = useMemo(
    () => (activeGroupLayout ? collectAgentIds(activeGroupLayout) : new Set<string>()),
    [activeGroupLayout]
  );

  const activeAgentId = useMemo(() => {
    if (!activeGroupLayout || !activePath) return null;
    const leaf = getAt(activeGroupLayout, activePath);
    return leaf && leaf.type === "leaf" ? activeAgentInLeaf(leaf) : null;
  }, [activeGroupLayout, activePath]);

  const activeAgent = useMemo(
    () =>
      activeAgentId
        ? agents.find((a) => a.id === activeAgentId) ?? null
        : null,
    [activeAgentId, agents]
  );
  const activeSessionProject = useMemo(
    () =>
      activeAgent
        ? projects.find((project) => project.id === activeAgent.projectId) ??
          activeProject
        : activeProject,
    [activeAgent, activeProject, projects]
  );
  const renameSession = useMemo(
    () =>
      renameSessionId
        ? agents.find((agent) => agent.id === renameSessionId) ?? null
        : null,
    [agents, renameSessionId]
  );

  // ---- Render

  return (
    <div className={`app app-theme-${appTheme}`}>
      <Sidebar
        projects={projects}
        agents={agents}
        groups={groups}
        activeProjectId={activeProjectId}
        activeGroupId={activeGroupId}
        activeAgentId={activeAgentId}
        inGroupAgentIds={inGroupAgentIds}
        dragState={dragState}
        onSelectProject={selectProject}
        onSelect={selectAgent}
        onContextMenu={onSidebarContextMenu}
        onNewProject={() => setShowProjectModal(true)}
        onNewSession={() =>
          activeProject ? setShowModal(true) : setShowProjectModal(true)
        }
        docsOpen={docsOpen}
        onToggleDocs={() => setDocsOpen((open) => !open)}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onRemove={removeAgent}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
      <TerminalArea
        agents={agents}
        layout={activeGroupLayout}
        sessionPins={activeGroup?.sessionPins ?? null}
        activePath={activePath}
        dragState={dragState}
        dropTarget={dropTarget}
        termsRef={termsRef}
        setAgentStatus={setAgentStatus}
        setActivePath={setActivePathForPane}
        onCloseTab={closeTab}
        onSelectTab={setActiveTabInPane}
        onResizeAt={resizeAt}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDropTargetChange={setDropTarget}
        onDrop={performDrop}
        onDropToEmpty={selectAgent}
        onTabContextMenu={(path, agentId, x, y) =>
          setTabContextMenu({ path, agentId, x, y })
        }
        onOpenMarkdownPath={handleOpenMarkdownPath}
      />
      {docsOpen && (
        <div
          className="docs-resizer"
          onPointerDown={handleDocsResizeStart}
          title="Resize docs"
        />
      )}
      <DocsPanel
        open={docsOpen}
        activeProject={activeSessionProject}
        activeSession={activeAgent}
        width={docsWidth}
        requestedPath={
          docsRequest && docsRequest.projectId === activeSessionProject?.id
            ? docsRequest.relativePath
            : null
        }
        requestKey={docsRequest?.key ?? 0}
        theme={appTheme}
        onClose={() => setDocsOpen(false)}
      />
      {settingsOpen && (
        <SettingsModal
          theme={appTheme}
          onThemeChange={handleThemeChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {showProjectModal && (
        <NewProjectModal
          defaultName={`Project ${projects.length + 1}`}
          onCancel={() => setShowProjectModal(false)}
          onCreate={(payload) => {
            setShowProjectModal(false);
            createProject(payload);
          }}
        />
      )}
      {showModal && (
        <NewAgentModal
          project={activeProject}
          defaultName={`Session ${projectAgents.length + 1}`}
          onCancel={() => setShowModal(false)}
          onCreate={(payload) => {
            setShowModal(false);
            createAgent(payload);
          }}
        />
      )}
      {renameSession && (
        <RenameSessionModal
          currentName={renameSession.name}
          onCancel={() => setRenameSessionId(null)}
          onRename={(name) => {
            renameAgent(renameSession.id, name);
            setRenameSessionId(null);
          }}
        />
      )}
      <ToastContainer
        toasts={toasts}
        onSelect={selectAgent}
        onDismiss={dismissToast}
      />
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          hasActive={!!activeGroupLayout && !!activePath}
          canPlaceInActive={canPlaceContextAgentInActiveGroup}
          isSessionLocked={!!contextGroup?.sessionLocked}
          canPinSession={canPinContextGroupSession}
          onClose={() => setContextMenu(null)}
          onAction={onContextAction}
        />
      )}
      {tabContextMenu && (
        <TabContextMenu
          state={tabContextMenu}
          onClose={() => setTabContextMenu(null)}
          onCloseTab={() => {
            closeTab(tabContextMenu.path, tabContextMenu.agentId);
            setTabContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
