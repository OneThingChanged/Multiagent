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
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
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
  LayoutNode,
  NewAgentPayload,
  NewProjectPayload,
  Path,
  Project,
  ProjectContextMenuState,
  SessionContextAction,
  StoredAgent,
  StoredProject,
  TabCtxState,
  TerminalEntry,
  Toast,
} from "./types";
import {
  activeAgentInLeaf,
  collectAgentIds,
  getAt,
} from "./lib/layout";
import * as groupOps from "./lib/groupOps";
import { loadBootstrap, loadStoredView } from "./lib/persistence";
import type { Bootstrap } from "./lib/persistence";
import { applyTerminalTheme, createEntry } from "./lib/terminal";
import { playNotificationSound } from "./lib/notificationSound";
import { buildSpawnArgs } from "./lib/spawn";
import {
  clearScrollback,
  loadScrollback,
  pruneScrollback,
  saveScrollback,
} from "./lib/scrollback";
import { loadAppTheme, saveAppTheme } from "./lib/appTheme";
import type { AppThemeId } from "./lib/appTheme";
import { IS_COMPANY_BUILD } from "./lib/appInfo";
import {
  buildDesktopPetUpdate,
  completionForAgent,
  loadDesktopPetEnabled,
  saveDesktopPetEnabled,
  type DesktopPetCompletion,
} from "./lib/desktopPet";

import { Sidebar } from "./components/Sidebar";
import { TerminalArea } from "./components/TerminalArea";
import { NewAgentModal } from "./components/NewAgentModal";
import { NewProjectModal } from "./components/NewProjectModal";
import { ToastContainer } from "./components/Toast";
import { ContextMenu, ProjectContextMenu, TabContextMenu } from "./components/Menus";
import { DocsPanel } from "./components/DocsPanel";
import { SettingsModal } from "./components/SettingsModal";
import { RenameSessionModal } from "./components/RenameSessionModal";
import { RenameProjectModal } from "./components/RenameProjectModal";
import { ReopenSessionsModal } from "./components/ReopenSessionsModal";
import { SearchBar } from "./components/SearchBar";
import { ImageViewer } from "./components/ImageViewer";
import { SessionPropertiesModal } from "./components/SessionPropertiesModal";
import { ProjectPropertiesModal } from "./components/ProjectPropertiesModal";

const LS_DOCS_WIDTH = "multiagent.docsWidth.v1";
const LS_ALWAYS_ON_TOP = "multiagent.alwaysOnTop.v1";
const DEFAULT_DOCS_WIDTH = 640;
const MIN_DOCS_WIDTH = 360;
const MIN_WORKSPACE_WIDTH = 260;

type DocsRequest = {
  projectId: string;
  agentId: string | null;
  relativePath: string;
  key: number;
};

type TerminalPathResolution = {
  kind: "image" | "html" | "markdown" | "folder" | "file";
  path: string;
};

type RuntimeFlags = {
  secondary_window: boolean;
  open_agent_id?: string | null;
};

function readLocalStorageValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageIfChanged(
  lastValueRef: { current: string | null },
  key: string,
  value: string
) {
  if (lastValueRef.current === value) return;
  lastValueRef.current = value;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function parseStoredArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function storedProjectFromProject(project: Project): StoredProject {
  return {
    id: project.id,
    name: project.name,
    folder: project.folder,
    createdAt: project.createdAt,
    lastOpenedAt: project.lastOpenedAt,
    sshHostId: project.sshHostId,
    remoteFolder: project.remoteFolder,
  };
}

function storedAgentFromAgent(agent: Agent): StoredAgent {
  return {
    id: agent.id,
    projectId: agent.projectId,
    name: agent.name,
    folder: agent.folder,
    aiToolId: agent.aiToolId,
    dangerous: agent.dangerous,
    createdAt: agent.createdAt,
    lastSessionId: agent.lastSessionId,
  };
}

function mergeStoredByIdForWrite<T extends { id: string }>(
  local: T[],
  stored: T[],
  removedIds: Set<string>
) {
  const localIds = new Set(local.map((item) => item.id));
  const merged = local.filter((item) => !removedIds.has(item.id));
  for (const item of stored) {
    if (!item.id || localIds.has(item.id) || removedIds.has(item.id)) {
      continue;
    }
    merged.push(item);
  }
  return merged;
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function projectFromStored(
  stored: StoredProject,
  existing?: Project
): Project | null {
  if (!stored.id) return null;
  if (!stored.folder && !stored.sshHostId) return null;
  const folder = stored.folder || "";
  return {
    id: stored.id,
    name: stored.name || existing?.name || "Project",
    folder,
    createdAt: stored.createdAt || existing?.createdAt || Date.now(),
    lastOpenedAt: stored.lastOpenedAt ?? existing?.lastOpenedAt,
    sshHostId: stored.sshHostId || undefined,
    remoteFolder: stored.remoteFolder || undefined,
  };
}

function mergeProjectsFromStorage(
  current: Project[],
  stored: StoredProject[],
  removedIds: Set<string>
) {
  const currentById = new Map(current.map((project) => [project.id, project]));
  const seen = new Set<string>();
  const merged: Project[] = [];
  for (const item of stored) {
    if (!item.id || removedIds.has(item.id)) continue;
    const project = projectFromStored(item, currentById.get(item.id));
    if (!project) continue;
    seen.add(project.id);
    merged.push(project);
  }
  for (const project of current) {
    if (!seen.has(project.id) && !removedIds.has(project.id)) {
      merged.push(project);
    }
  }
  return sameJson(
    current.map(storedProjectFromProject),
    merged.map(storedProjectFromProject)
  )
    ? current
    : merged;
}

function agentFromStored(
  stored: StoredAgent,
  projects: Project[],
  existing?: Agent
): Agent | null {
  if (!stored.id) return null;
  const byId = new Map(projects.map((project) => [project.id, project]));
  const byFolder = new Map(projects.map((project) => [project.folder, project]));
  const project =
    (stored.projectId && byId.get(stored.projectId)) ||
    byFolder.get(stored.folder);
  if (!project) return null;
  const aiToolId = stored.aiToolId || existing?.aiToolId || "none";
  return {
    id: stored.id,
    projectId: project.id,
    name: stored.name || existing?.name || "Session",
    folder: project.folder,
    aiToolId,
    aiLabel: toolForId(aiToolId).label,
    dangerous: !!stored.dangerous,
    createdAt: stored.createdAt || existing?.createdAt || Date.now(),
    lastSessionId:
      stored.lastSessionId ??
      stored.lastClaudeSessionId ??
      stored.lastResumeToken ??
      existing?.lastSessionId,
    status: existing?.status ?? "idle",
    sshHostId: project.sshHostId,
    remoteFolder: project.remoteFolder,
  };
}

function mergeAgentsFromStorage(
  current: Agent[],
  stored: StoredAgent[],
  projects: Project[],
  removedIds: Set<string>
) {
  const currentById = new Map(current.map((agent) => [agent.id, agent]));
  const seen = new Set<string>();
  const merged: Agent[] = [];
  for (const item of stored) {
    if (!item.id || removedIds.has(item.id)) continue;
    const agent = agentFromStored(item, projects, currentById.get(item.id));
    if (!agent) continue;
    seen.add(agent.id);
    merged.push(agent);
  }
  for (const agent of current) {
    if (!seen.has(agent.id) && !removedIds.has(agent.id)) {
      merged.push(agent);
    }
  }
  return sameJson(
    current.map(storedAgentFromAgent),
    merged.map(storedAgentFromAgent)
  )
    ? current
    : merged;
}

function groupContainsRemovedAgent(group: Group, removedIds: Set<string>) {
  if (removedIds.size === 0) return false;
  try {
    const ids = collectAgentIds(group.layout);
    return Array.from(removedIds).some((id) => ids.has(id));
  } catch {
    return true;
  }
}

function mergeGroupsFromStorage(
  current: Group[],
  stored: Group[],
  removedAgentIds: Set<string>
) {
  const currentById = new Map(current.map((group) => [group.id, group]));
  const seen = new Set<string>();
  const merged: Group[] = [];
  for (const group of stored) {
    if (!group?.id || groupContainsRemovedAgent(group, removedAgentIds)) {
      continue;
    }
    seen.add(group.id);
    merged.push(group);
  }
  for (const group of current) {
    if (!seen.has(group.id) && !groupContainsRemovedAgent(group, removedAgentIds)) {
      merged.push(currentById.get(group.id) ?? group);
    }
  }
  return sameJson(current, merged) ? current : merged;
}

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

function loadAlwaysOnTop() {
  try {
    return localStorage.getItem(LS_ALWAYS_ON_TOP) === "true";
  } catch {
    return false;
  }
}

function isHtmlDocumentPath(path: string) {
  return /\.(?:html|htm)$/i.test(path.trim());
}

function isAbsoluteFsPath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function joinFsPath(folder: string, relativePath: string) {
  return `${folder.replace(/[\\/]+$/, "")}/${relativePath}`;
}

// Startup reopen prompt: the previously-active group (with sessions) is restored
// only after the user confirms, instead of auto-resuming on launch.
const LS_REOPEN_AGENTS = "multiagent.reopenAgents.v1";

type ReopenPending = {
  agentIds: string[];
  groupId: string | null;
  path: Path | null;
  projectId: string | null;
  count: number;
};

function computeInitialReopen(boot: Bootstrap): ReopenPending | null {
  // Reopen every session that was running at the last close (recorded in
  // LS_REOPEN_AGENTS), not just the previously-active group. loadBootstrap
  // starts with no active group, so read the saved view for which group to show.
  let remembered: string[] = [];
  try {
    const raw = localStorage.getItem(LS_REOPEN_AGENTS);
    if (raw) remembered = JSON.parse(raw) as string[];
  } catch {
    remembered = [];
  }
  const existing = new Set(boot.agents.map((a) => a.id));
  const agentIds = remembered.filter((id) => existing.has(id));
  if (agentIds.length === 0) return null;
  const view = loadStoredView(boot.groups);
  return {
    agentIds,
    groupId: view.activeGroupId,
    path: view.activePath,
    projectId: view.activeProjectId,
    count: agentIds.length,
  };
}

function App() {
  // One-shot bootstrap: read localStorage exactly once at mount.
  const bootstrapRef = useRef<Bootstrap | null>(null);
  if (!bootstrapRef.current) bootstrapRef.current = loadBootstrap();
  const boot = bootstrapRef.current;

  const [pendingReopen, setPendingReopen] = useState<ReopenPending | null>(() =>
    computeInitialReopen(boot)
  );

  const [projects, setProjects] = useState<Project[]>(boot.projects);
  const [agents, setAgents] = useState<Agent[]>(boot.agents);
  const [groups, setGroups] = useState<Group[]>(boot.groups);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    boot.activeProjectId
  );
  // When a reopen prompt is pending, don't restore the active group yet (that
  // would auto-spawn its sessions) — wait for the user's answer.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    pendingReopen ? null : boot.activeGroupId
  );
  const [activePath, setActivePath] = useState<Path | null>(
    pendingReopen ? null : boot.activePath
  );

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appTheme, setAppTheme] = useState<AppThemeId>(loadAppTheme);
  const [alwaysOnTop, setAlwaysOnTop] = useState(loadAlwaysOnTop);
  const [desktopPetEnabled, setDesktopPetEnabled] = useState(
    loadDesktopPetEnabled
  );
  const [desktopPetCompletions, setDesktopPetCompletions] = useState<
    DesktopPetCompletion[]
  >([]);
  const [desktopPetQuestions, setDesktopPetQuestions] = useState<
    Record<string, string>
  >({});
  const [docsWidth, setDocsWidth] = useState(loadDocsWidth);
  const [docsRequest, setDocsRequest] = useState<DocsRequest | null>(null);
  const [imageViewer, setImageViewer] = useState<{
    path: string;
    folder: string | null;
  } | null>(null);
  const [propertiesAgentId, setPropertiesAgentId] = useState<string | null>(
    null
  );
  const [propertiesProjectId, setPropertiesProjectId] = useState<
    string | null
  >(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [projectContextMenu, setProjectContextMenu] =
    useState<ProjectContextMenuState | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabCtxState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [runtimeFlags, setRuntimeFlags] = useState<RuntimeFlags | null>(null);
  const isSecondaryWindow = !!runtimeFlags?.secondary_window;

  const termsRef = useRef<Map<string, TerminalEntry>>(new Map());
  const agentsRef = useRef<Agent[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const activePathRef = useRef<Path | null>(null);
  const alwaysOnTopRef = useRef(alwaysOnTop);
  const storedProjectsJsonRef = useRef(readLocalStorageValue(LS_PROJECTS));
  const storedAgentsJsonRef = useRef(readLocalStorageValue(LS_AGENTS));
  const storedGroupsJsonRef = useRef(readLocalStorageValue(LS_GROUPS));
  const storedViewJsonRef = useRef(readLocalStorageValue(LS_VIEW));
  const remoteAgentsJsonRef = useRef<string | null>(null);
  const remoteViewJsonRef = useRef<string | null>(null);
  const monitorStateJsonRef = useRef<string | null>(null);
  const usageCatalogJsonRef = useRef<string | null>(null);
  const desktopPetJsonRef = useRef<string | null>(null);
  const desktopPetQuestionsRef = useRef<Record<string, string>>({});
  const removedProjectIdsRef = useRef<Set<string>>(new Set());
  const removedAgentIdsRef = useRef<Set<string>>(new Set());
  const openedInitialAgentRef = useRef<string | null>(null);

  const syncSharedStateFromStorage = useCallback(() => {
    const projectsRaw = readLocalStorageValue(LS_PROJECTS);
    const agentsRaw = readLocalStorageValue(LS_AGENTS);
    const groupsRaw = readLocalStorageValue(LS_GROUPS);

    let nextProjects = projectsRef.current;
    if (projectsRaw !== storedProjectsJsonRef.current) {
      const storedProjects = parseStoredArray<StoredProject>(projectsRaw);
      const merged = mergeProjectsFromStorage(
        projectsRef.current,
        storedProjects,
        removedProjectIdsRef.current
      );
      storedProjectsJsonRef.current = projectsRaw;
      if (merged !== projectsRef.current) {
        nextProjects = merged;
        projectsRef.current = merged;
        setProjects(merged);
      }
    }

    if (agentsRaw !== storedAgentsJsonRef.current) {
      const storedAgents = parseStoredArray<StoredAgent>(agentsRaw);
      const merged = mergeAgentsFromStorage(
        agentsRef.current,
        storedAgents,
        nextProjects,
        removedAgentIdsRef.current
      );
      storedAgentsJsonRef.current = agentsRaw;
      if (merged !== agentsRef.current) {
        agentsRef.current = merged;
        setAgents(merged);
      }
    }

    if (groupsRaw !== storedGroupsJsonRef.current) {
      const storedGroups = parseStoredArray<Group>(groupsRaw);
      const merged = mergeGroupsFromStorage(
        groupsRef.current,
        storedGroups,
        removedAgentIdsRef.current
      );
      storedGroupsJsonRef.current = groupsRaw;
      if (merged !== groupsRef.current) {
        groupsRef.current = merged;
        setGroups(merged);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    invoke<RuntimeFlags>("runtime_flags")
      .then((flags) => {
        if (!cancelled) setRuntimeFlags(flags);
      })
      .catch(() => {
        if (!cancelled) setRuntimeFlags({ secondary_window: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!runtimeFlags) return;
    syncSharedStateFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === LS_PROJECTS ||
        event.key === LS_AGENTS ||
        event.key === LS_GROUPS
      ) {
        syncSharedStateFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    const interval = window.setInterval(syncSharedStateFromStorage, 1000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [runtimeFlags, syncSharedStateFromStorage]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    invoke("show_main_window").catch(() => {});
  }, [isSecondaryWindow, runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    invoke("set_desktop_pet_enabled", { enabled: desktopPetEnabled }).catch(
      () => {}
    );
  }, [desktopPetEnabled, isSecondaryWindow, runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    const update = buildDesktopPetUpdate(
      agents,
      projects,
      desktopPetQuestions,
      desktopPetCompletions
    );
    const json = JSON.stringify(update);
    if (desktopPetJsonRef.current === json) return;
    desktopPetJsonRef.current = json;
    invoke("update_desktop_pet", { update }).catch(() => {});
  }, [
    agents,
    desktopPetCompletions,
    desktopPetQuestions,
    isSecondaryWindow,
    projects,
    runtimeFlags,
  ]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    pruneScrollback(new Set(agentsRef.current.map((agent) => agent.id)));
  }, [isSecondaryWindow, runtimeFlags]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Mirror agent metadata into the Rust remote hub so the remote web
  // client can list sessions and show live status.
  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow || IS_COMPANY_BUILD) return;
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const payload = {
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        project: projectNames.get(a.projectId) ?? "",
        status: a.status,
        tool: a.aiToolId,
      })),
    };
    const json = JSON.stringify(payload);
    if (remoteAgentsJsonRef.current === json) return;
    remoteAgentsJsonRef.current = json;
    invoke("sync_remote_agents", payload).catch(() => {});
  }, [agents, isSecondaryWindow, projects, runtimeFlags]);

  // Mirror projects + sessions so the remote web client can list them.
  // The web client is an independent viewer: it picks which session to
  // view locally, so desktop active/layout is intentionally not synced.
  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow || IS_COMPANY_BUILD) return;
    const payload = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        folder: p.folder,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        name: a.name,
        status: a.status,
        aiToolId: a.aiToolId,
      })),
    };
    const view = JSON.stringify(payload);
    if (remoteViewJsonRef.current === view) return;
    remoteViewJsonRef.current = view;
    invoke("sync_remote_view", { view }).catch(() => {});
  }, [projects, agents, isSecondaryWindow, runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    const payload = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        folder: p.folder,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        name: a.name,
        folder: a.folder,
        aiToolId: a.aiToolId,
        lastSessionId: a.lastSessionId ?? null,
      })),
    };
    const json = JSON.stringify(payload);
    if (usageCatalogJsonRef.current === json) return;
    usageCatalogJsonRef.current = json;
    invoke("sync_usage_catalog", payload).catch(() => {});
  }, [projects, agents, isSecondaryWindow, runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    const payload = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        folder: p.folder,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        name: a.name,
        folder: a.folder,
        aiToolId: a.aiToolId,
        status: a.status,
        lastSessionId: a.lastSessionId ?? null,
      })),
      groups,
      view: {
        activeProjectId,
        activeGroupId,
        activePath,
      },
    };
    const json = JSON.stringify(payload);
    if (monitorStateJsonRef.current === json) return;
    monitorStateJsonRef.current = json;
    invoke("sync_monitor_state", payload).catch(() => {});
  }, [
    projects,
    agents,
    groups,
    activeProjectId,
    activeGroupId,
    activePath,
    isSecondaryWindow,
    runtimeFlags,
  ]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    alwaysOnTopRef.current = alwaysOnTop;
  }, [alwaysOnTop]);

  // ---- Persistence

  useEffect(() => {
    const storedProjects = projects.map(storedProjectFromProject);
    const mergedProjects = mergeStoredByIdForWrite(
      storedProjects,
      parseStoredArray<StoredProject>(readLocalStorageValue(LS_PROJECTS)),
      removedProjectIdsRef.current
    );
    writeLocalStorageIfChanged(
      storedProjectsJsonRef,
      LS_PROJECTS,
      JSON.stringify(mergedProjects)
    );
  }, [projects]);

  useEffect(() => {
    const configs = agents.map(storedAgentFromAgent);
    const mergedConfigs = mergeStoredByIdForWrite(
      configs,
      parseStoredArray<StoredAgent>(readLocalStorageValue(LS_AGENTS)),
      removedAgentIdsRef.current
    );
    writeLocalStorageIfChanged(
      storedAgentsJsonRef,
      LS_AGENTS,
      JSON.stringify(mergedConfigs)
    );
  }, [agents]);

  useEffect(() => {
    const storedGroups = parseStoredArray<Group>(readLocalStorageValue(LS_GROUPS));
    const mergedGroups = mergeStoredByIdForWrite(
      groups,
      storedGroups.filter(
        (group) => !groupContainsRemovedAgent(group, removedAgentIdsRef.current)
      ),
      new Set()
    );
    writeLocalStorageIfChanged(
      storedGroupsJsonRef,
      LS_GROUPS,
      JSON.stringify(mergedGroups)
    );
  }, [groups]);

  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    // While the startup reopen prompt is open we deliberately hold activeGroupId
    // at null; don't persist that, or we'd lose the group to reopen.
    if (pendingReopen) return;
    writeLocalStorageIfChanged(
      storedViewJsonRef,
      LS_VIEW,
      JSON.stringify({ activeProjectId, activeGroupId, activePath })
    );
  }, [
    activeProjectId,
    activeGroupId,
    activePath,
    isSecondaryWindow,
    runtimeFlags,
    pendingReopen,
  ]);

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

  const closeTabRef = useRef<
    ((path: Path, agentId: string) => void) | null
  >(null);
  const selectAgentRef = useRef<((agentId: string) => void) | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        return;
      }
      if (event.key === "Escape" && docsOpen && !settingsOpen) {
        event.preventDefault();
        setDocsOpen(false);
        return;
      }
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        if (inField) return;
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (key === "t") {
        if (inField) return;
        event.preventDefault();
        if (activeProjectIdRef.current) setShowModal(true);
        else setShowProjectModal(true);
        return;
      }
      if (key === "w") {
        if (inField) return;
        event.preventDefault();
        const groupId = activeGroupIdRef.current;
        const path = activePathRef.current;
        if (!groupId || !path) return;
        const group = groupsRef.current.find((g) => g.id === groupId);
        if (!group) return;
        const node = getAt(group.layout, path);
        if (!node || node.type !== "leaf") return;
        const activeId = node.tabs[node.activeIndex];
        if (activeId) closeTabRef.current?.(path, activeId);
        return;
      }
      if (key >= "1" && key <= "9") {
        if (inField) return;
        const idx = parseInt(key, 10) - 1;
        const groupId = activeGroupIdRef.current;
        const path = activePathRef.current;
        if (!groupId || !path) return;
        const group = groupsRef.current.find((g) => g.id === groupId);
        if (!group) return;
        const node = getAt(group.layout, path);
        if (!node || node.type !== "leaf") return;
        if (idx < node.tabs.length) {
          event.preventDefault();
          selectAgentRef.current?.(node.tabs[idx]);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [docsOpen, searchOpen, settingsOpen]);

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
    setActiveProjectId(nextProjectId);
    setActiveGroupId(null);
    setActivePath(null);
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
    let cancelled = false;
    getCurrentWindow()
      .setAlwaysOnTop(alwaysOnTopRef.current)
      .catch((error) => {
        if (cancelled || !alwaysOnTopRef.current) return;
        console.warn("failed to restore always on top", error);
        alwaysOnTopRef.current = false;
        setAlwaysOnTop(false);
        try {
          localStorage.setItem(LS_ALWAYS_ON_TOP, "false");
        } catch {}
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAlwaysOnTop = useCallback(() => {
    const previous = alwaysOnTopRef.current;
    const next = !previous;
    alwaysOnTopRef.current = next;
    setAlwaysOnTop(next);
    try {
      localStorage.setItem(LS_ALWAYS_ON_TOP, String(next));
    } catch {}

    getCurrentWindow()
      .setAlwaysOnTop(next)
      .catch((error) => {
        alwaysOnTopRef.current = previous;
        setAlwaysOnTop(previous);
        try {
          localStorage.setItem(LS_ALWAYS_ON_TOP, String(previous));
        } catch {}
        pushToast("", "창 고정", `상시 최상단 설정 실패: ${String(error)}`);
      });
  }, [pushToast]);

  const handleDesktopPetEnabledChange = useCallback((enabled: boolean) => {
    saveDesktopPetEnabled(enabled);
    setDesktopPetEnabled(enabled);
  }, []);

  const resetDesktopPetPosition = useCallback(() => {
    invoke("reset_desktop_pet_position").catch((error) => {
      pushToast("", "Desktop Pet", `위치를 초기화할 수 없습니다: ${String(error)}`);
    });
  }, [pushToast]);

  const openNewAppWindow = useCallback((agentId?: string | null) => {
    invoke("open_new_app_window", { agentId: agentId ?? null }).catch((error) => {
      pushToast("", "새 창", `새 창을 열 수 없습니다: ${String(error)}`);
    });
  }, [pushToast]);

  // Clicking a completion surface focuses the app and jumps to the session.
  // The desktop pet itself is non-focusable, so it must explicitly focus main.
  useEffect(() => {
    if (!runtimeFlags || isSecondaryWindow) return;
    let cancelled = false;
    const unsubscribes: Array<() => void> = [];
    const activate = (agentId?: string) => {
      invoke("show_main_window").catch(() => {});
      if (agentId) selectAgentRef.current?.(agentId);
    };
    const track = (unsubscribe: () => void) => {
      if (cancelled) unsubscribe();
      else unsubscribes.push(unsubscribe);
    };
    listen<{ agentId?: string }>("desktop-pet:activate", (event) => {
      activate(event.payload?.agentId);
      setDesktopPetCompletions([]);
    }).then(track).catch(() => {});
    listen("desktop-pet:close-requested", () => {
      handleDesktopPetEnabledChange(false);
    }).then(track).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [handleDesktopPetEnabledChange, isSecondaryWindow, runtimeFlags]);

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
      const id = e.payload.id;
      const entry = termsRef.current.get(id);
      if (entry) {
        try {
          const data = entry.serialize.serialize({ scrollback: 1000 });
          saveScrollback(id, data);
        } catch {}
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "exited" } : a))
      );
    }).then(track);

    if (!IS_COMPANY_BUILD) {
      listen<{ login: string }>("remote:access-request", (e) => {
        if (cancelled) return;
        playNotificationSound();
        pushToast(
          "",
          "원격 접속 요청",
          `GitHub @${e.payload.login} — 설정 > Remote access에서 승인하세요`
        );
      }).then(track);
    }


    listen<void>("app:close-requested", async () => {
      if (cancelled) return;
      // Remember which sessions were running so the next launch can offer to
      // reopen them all (across every group), not just the active one. Snapshot
      // before /quit, which flips them to exited.
      try {
        const running = agentsRef.current
          .filter((a) => {
            if (a.status === "exited" || a.status === "idle") return false;
            const e = termsRef.current.get(a.id);
            return !!e && e.spawned;
          })
          .map((a) => a.id);
        localStorage.setItem(LS_REOPEN_AGENTS, JSON.stringify(running));
      } catch {
        // ignore
      }
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
      for (const [agentId, entry] of termsRef.current) {
        try {
          const data = entry.serialize.serialize({ scrollback: 1000 });
          saveScrollback(agentId, data);
        } catch (err) {
          console.warn("serialize failed", agentId, err);
        }
      }
      await invoke("confirm_close").catch(() => {});
    }).then(track);

    listen<{
      id: string;
      event: string;
      session_id?: string;
      prompt?: string;
    }>(
      "agent:hook-event",
      (e) => {
        if (cancelled) return;
        const { id, event, session_id, prompt } = e.payload;
        if (event === "working") {
          const workingAgent = agentsRef.current.find((agent) => agent.id === id);
          const sessionKey = workingAgent?.lastSessionId?.trim() || id;
          setDesktopPetCompletions((previous) =>
            previous.filter(
              (completion) =>
                completion.sessionKey !== sessionKey && completion.agentId !== id
            )
          );
          setDesktopPetQuestions((previous) => {
            const next = { ...previous };
            const question = prompt?.trim();
            if (question) next[id] = question;
            else delete next[id];
            desktopPetQuestionsRef.current = next;
            return next;
          });
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.status !== "exited"
                ? { ...a, status: "working" }
                : a
            )
          );
        } else if (event === "done") {
          const completedQuestion = desktopPetQuestionsRef.current[id];
          setDesktopPetQuestions((previous) => {
            if (!(id in previous)) return previous;
            const next = { ...previous };
            delete next[id];
            desktopPetQuestionsRef.current = next;
            return next;
          });
          const target = agentsRef.current.find((a) => a.id === id);
          if (target && target.status === "working") {
            const project = projectsRef.current.find(
              (candidate) => candidate.id === target.projectId
            );
            const projectName = project?.name || "Unknown project";
            const title = `${projectName} / ${target.name}`;
            const petCompletion = completionForAgent(
              target,
              projectsRef.current,
              completedQuestion
            );
            setDesktopPetCompletions((previous) => [
              ...previous
                .filter(
                  (completion) =>
                    completion.sessionKey !== petCompletion.sessionKey &&
                    completion.agentId !== petCompletion.agentId
                )
                .slice(-8),
              petCompletion,
            ]);
            playNotificationSound();
            pushToast(target.id, title, "작업이 끝났어요");
            // When the app isn't focused, flash the taskbar so the user notices
            // (clicking the taskbar brings the app forward, where the in-app
            // toast is clickable to jump to the session). The always-on-top
            // popup window was removed — on some Windows setups it grabbed focus
            // and froze terminal input.
            getCurrentWindow()
              .isFocused()
              .then((focused) => {
                if (focused) return;
                getCurrentWindow()
                  .requestUserAttention(UserAttentionType.Critical)
                  .catch(() => {});
              })
              .catch(() => {});
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

  const restartAgent = useCallback((id: string) => {
    const entry = termsRef.current.get(id);
    if (entry) {
      entry.term.dispose();
      termsRef.current.delete(id);
    }
    clearScrollback(id);
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "idle" } : a))
    );
  }, []);

  // Stop a running session's PTY process to free CPU/memory, but keep it
  // in the list (and its lastSessionId). Selecting it again respawns/resumes.
  const deactivateAgent = useCallback((id: string) => {
    invoke("kill_pty", { id }).catch(() => {});
    const entry = termsRef.current.get(id);
    if (entry) {
      try {
        entry.term.dispose();
      } catch {}
      termsRef.current.delete(id);
    }
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "idle" } : a))
    );
  }, []);

  const selectAgent = useCallback(
    (agentId: string) => {
      const agent = activateAgentProject(agentId);
      applyGroupOp((s) => groupOps.selectAgent(s, agentId, agent?.projectId));
      const current = agentsRef.current.find((a) => a.id === agentId);
      if (current?.status === "exited") {
        restartAgent(agentId);
      }
    },
    [activateAgentProject, applyGroupOp, restartAgent]
  );

  useEffect(() => {
    selectAgentRef.current = selectAgent;
  }, [selectAgent]);

  useEffect(() => {
    const agentId = runtimeFlags?.open_agent_id;
    if (!agentId || openedInitialAgentRef.current === agentId) return;
    if (!agents.some((agent) => agent.id === agentId)) return;
    openedInitialAgentRef.current = agentId;
    selectAgent(agentId);
  }, [agents, runtimeFlags, selectAgent]);

  // Selecting a project only marks it active (so the + button targets it and the
  // Docs panel scans its folder). It no longer auto-opens the project's first
  // session — sessions open only when a session row is clicked. The sidebar
  // toggles expand/collapse separately.
  const selectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, lastOpenedAt: Date.now() } : project
      )
    );
  }, []);

  // Startup reopen handlers are defined after the terminal-path handlers, which
  // they depend on (see spawnAgentInBackground / confirmReopen below).

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

  useEffect(() => {
    closeTabRef.current = closeTab;
  }, [closeTab]);

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
    const sshHostId = payload.sshHostId?.trim() || undefined;
    const project: Project = {
      id,
      name: payload.name.trim() || "Project",
      folder: payload.folder.trim(),
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      sshHostId,
      remoteFolder: sshHostId ? payload.remoteFolder?.trim() || undefined : undefined,
    };
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(id);
    setActiveGroupId(null);
    setActivePath(null);
  }, []);

  const reorderProject = useCallback(
    (draggedId: string, targetId: string, before: boolean) => {
      if (draggedId === targetId) return;
      setProjects((prev) => {
        const dragged = prev.find((p) => p.id === draggedId);
        if (!dragged) return prev;
        const without = prev.filter((p) => p.id !== draggedId);
        const targetIdx = without.findIndex((p) => p.id === targetId);
        if (targetIdx === -1) return prev;
        const insertIdx = before ? targetIdx : targetIdx + 1;
        return [
          ...without.slice(0, insertIdx),
          dragged,
          ...without.slice(insertIdx),
        ];
      });
    },
    []
  );

  const removeProject = useCallback(
    async (projectId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      if (!project) return;
      const members = agentsRef.current.filter(
        (a) => a.projectId === projectId
      );
      const sessionLine =
        members.length > 0
          ? `\n세션 ${members.length}개도 함께 삭제됩니다.`
          : "";
      const ok = window.confirm(
        `"${project.name}" 프로젝트를 삭제할까요?${sessionLine}\n이 동작은 되돌릴 수 없습니다.`
      );
      if (!ok) return;

      for (const a of members) {
        await invoke("kill_pty", { id: a.id }).catch(() => {});
        const entry = termsRef.current.get(a.id);
        entry?.term.dispose();
        termsRef.current.delete(a.id);
        clearScrollback(a.id);
      }

      const memberIds = new Set(members.map((m) => m.id));
      removedProjectIdsRef.current.add(projectId);
      for (const id of memberIds) {
        removedAgentIdsRef.current.add(id);
      }
      setAgents((prev) => prev.filter((a) => !memberIds.has(a.id)));
      for (const id of memberIds) {
        applyGroupOp((s) => groupOps.removeAgentFromLayout(s, id));
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (activeProjectIdRef.current === projectId) {
        setActiveProjectId(null);
        setActiveGroupId(null);
        setActivePath(null);
      }
    },
    [applyGroupOp]
  );

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
          sshHostId: project.sshHostId,
          remoteFolder: project.remoteFolder,
        },
      ]);
      applyGroupOp((s) => groupOps.addNewAgent(s, id, project.id));
    },
    [applyGroupOp]
  );

  const setAgentStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const setAgentSessionId = useCallback((id: string, sessionId: string | null) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === id
          ? { ...agent, lastSessionId: sessionId || undefined }
          : agent
      )
    );
  }, []);

  const removeAgent = useCallback(
    async (id: string) => {
      removedAgentIdsRef.current.add(id);
      await invoke("kill_pty", { id }).catch(() => {});
      const entry = termsRef.current.get(id);
      entry?.term.dispose();
      termsRef.current.delete(id);
      clearScrollback(id);
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

  const onSidebarProjectContextMenu = useCallback(
    (projectId: string, x: number, y: number) => {
      setProjectContextMenu({ projectId, x, y });
    },
    []
  );

  const renameProject = useCallback((id: string, name: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }, []);

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

  const relinkSession = useCallback(
    (agentId: string) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      if (!agent) return;
      const project = projectsRef.current.find(
        (p) => p.id === agent.projectId
      );
      const folder = agent.folder || project?.folder || "";
      if (!folder) {
        pushToast(agentId, agent.name, "폴더 정보가 없어 재등록할 수 없습니다.");
        return;
      }
      invoke<string | null>("relink_cli_session", {
        aiToolId: agent.aiToolId,
        folder,
        agentName: agent.name,
      })
        .then((sessionId) => {
          if (!sessionId) {
            pushToast(agentId, agent.name, "찾을 수 있는 최근 세션이 없습니다.");
            return;
          }
          setAgents((prev) =>
            prev.map((a) =>
              a.id === agentId ? { ...a, lastSessionId: sessionId } : a
            )
          );
          pushToast(
            agentId,
            agent.name,
            `세션 재등록: ${sessionId.slice(0, 8)} (다음 실행부터 적용)`
          );
        })
        .catch((err) => {
          pushToast(agentId, agent.name, `재등록 실패: ${String(err)}`);
        });
    },
    [pushToast]
  );

  const onContextAction = useCallback(
    (
      action: SessionContextAction
    ) => {
      if (!contextMenu) return;
      const id = contextMenu.agentId;
      setContextMenu(null);
      if (action === "open") selectAgent(id);
      else if (action === "open-new-window") openNewAppWindow(id);
      else if (action === "tab") openAsTab(id);
      else if (action === "split-h") splitWith(id, "h");
      else if (action === "split-v") splitWith(id, "v");
      else if (action === "rename") setRenameSessionId(id);
      else if (action === "pin-session") pinContextGroupSessions(id);
      else if (action === "clear-session-pin") clearContextGroupSessionPins(id);
      else if (action === "restart") {
        selectAgent(id);
        restartAgent(id);
      } else if (action === "deactivate") {
        deactivateAgent(id);
      } else if (action === "relink") {
        relinkSession(id);
      } else if (action === "properties") {
        setPropertiesAgentId(id);
      }
    },
    [
      contextMenu,
      selectAgent,
      openNewAppWindow,
      openAsTab,
      splitWith,
      pinContextGroupSessions,
      clearContextGroupSessionPins,
      restartAgent,
      deactivateAgent,
      relinkSession,
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
        if (isHtmlDocumentPath(relativePath)) {
          const fullPath = isAbsoluteFsPath(relativePath)
            ? relativePath
            : joinFsPath(project.folder, relativePath);
          await invoke("open_local_path", { path: fullPath });
          return;
        }
        setDocsOpen(true);
        setDocsRequest({
          projectId: project.id,
          agentId,
          relativePath,
          key: Date.now(),
        });
      } catch {
        pushToast(agentId, agent.name, "문서 파일을 열 수 없습니다.");
      }
    },
    [pushToast]
  );

  const handleOpenImagePath = useCallback((agentId: string, path: string) => {
    const agent = agentsRef.current.find((a) => a.id === agentId);
    const project = projectsRef.current.find(
      (candidate) => candidate.id === agent?.projectId
    );
    setImageViewer({ path, folder: project?.folder ?? null });
  }, []);

  const handleOpenFolderPath = useCallback(
    async (agentId: string, path: string) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      const project = projectsRef.current.find(
        (candidate) => candidate.id === agent?.projectId
      );
      if (!agent || !project?.folder) return;

      try {
        await invoke("open_folder_path", { folder: project.folder, path });
      } catch (error) {
        pushToast(agentId, agent.name, `폴더를 열 수 없습니다: ${String(error)}`);
      }
    },
    [pushToast]
  );

  const handleOpenTerminalPath = useCallback(
    async (agentId: string, path: string) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      const project = projectsRef.current.find(
        (candidate) => candidate.id === agent?.projectId
      );
      if (!agent || !project?.folder) return;

      try {
        const resolved = await invoke<TerminalPathResolution>(
          "resolve_terminal_path",
          {
            folder: project.folder,
            path,
          }
        );

        if (resolved.kind === "image") {
          setImageViewer({ path: resolved.path, folder: null });
          return;
        }

        if (resolved.kind === "html") {
          await invoke("open_local_path", { path: resolved.path });
          return;
        }

        if (resolved.kind === "markdown") {
          const relativePath = await invoke<string>("resolve_markdown_path", {
            folder: project.folder,
            path: resolved.path,
          });
          setDocsOpen(true);
          setDocsRequest({
            projectId: project.id,
            agentId,
            relativePath,
            key: Date.now(),
          });
          return;
        }

        if (resolved.kind === "folder") {
          await invoke("open_local_path", { path: resolved.path });
          return;
        }

        await invoke("reveal_local_path", { path: resolved.path });
      } catch (error) {
        pushToast(agentId, agent.name, `경로를 열 수 없습니다: ${String(error)}`);
      }
    },
    [pushToast]
  );

  // Spawn an agent's PTY without it being the visible pane — used to reopen
  // every previously-running session at startup, including ones in groups that
  // aren't currently shown. The terminal renders into its (detached) element at
  // a default size; when the user later opens it, PaneSlot reattaches the same
  // entry and resizes (it skips re-spawning because entry.spawned is already set).
  const spawnAgentInBackground = useCallback(
    async (agentId: string) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      if (!agent) return;
      let entry = termsRef.current.get(agentId);
      if (entry?.spawned) return; // already running
      if (!entry) {
        entry = createEntry(
          agentId,
          handleOpenMarkdownPath,
          handleOpenImagePath,
          handleOpenFolderPath,
          handleOpenTerminalPath,
          { normalizeSshCursorKeys: !!agent.sshHostId }
        );
        termsRef.current.set(agentId, entry);
      }
      if (!entry.opened) {
        // Don't call term.open() on a detached element — xterm's renderer needs
        // an attached, sized node. Writes still buffer and render when PaneSlot
        // opens it on first view. Restore scrollback here, since PaneSlot only
        // restores for entries it creates itself (this one already exists).
        const saved = loadScrollback(agentId);
        if (saved) {
          entry.term.write(saved);
          entry.term.write(
            "\r\n\x1b[2m--- restored from previous session ---\x1b[0m\r\n"
          );
        }
      }
      entry.spawned = true;
      setAgentStatus(agentId, "starting");
      try {
        const group = groupsRef.current.find((g) =>
          collectAgentIds(g.layout).has(agentId)
        );
        const { initCommand, ssh, cwd } = await buildSpawnArgs(
          agent,
          group?.sessionPins ?? null,
          setAgentSessionId
        );
        await invoke("spawn_pty", {
          id: agentId,
          shell: null,
          cwd,
          initCommand,
          aiToolId: agent.aiToolId,
          ssh,
          cols: 120,
          rows: 30,
        });
      } catch (err) {
        entry.term.write(`\r\n\x1b[31mspawn failed: ${err}\x1b[0m\r\n`);
        setAgentStatus(agentId, "exited");
      }
    },
    [
      handleOpenMarkdownPath,
      handleOpenImagePath,
      handleOpenFolderPath,
      handleOpenTerminalPath,
      setAgentStatus,
      setAgentSessionId,
    ]
  );

  // Startup reopen prompt answers.
  const confirmReopen = useCallback(() => {
    const pending = pendingReopen;
    setPendingReopen(null);
    if (!pending) return;
    if (pending.groupId) {
      setActiveGroupId(pending.groupId);
      setActivePath(pending.path);
    }
    if (pending.projectId) setActiveProjectId(pending.projectId);
    // Resume every session that was running at close, including ones in groups
    // that aren't currently visible. Setting entry.spawned synchronously here
    // means PaneSlot won't double-spawn the ones in the shown group.
    for (const id of pending.agentIds) {
      void spawnAgentInBackground(id);
    }
  }, [pendingReopen, spawnAgentInBackground]);

  const dismissReopen = useCallback(() => {
    try {
      localStorage.removeItem(LS_REOPEN_AGENTS);
    } catch {
      // ignore
    }
    setPendingReopen(null);
  }, []);

  // Secondary windows never prompt or auto-spawn (the main window owns the
  // PTYs); just hide the prompt there.
  useEffect(() => {
    if (runtimeFlags && isSecondaryWindow && pendingReopen) {
      setPendingReopen(null);
    }
  }, [runtimeFlags, isSecondaryWindow, pendingReopen]);

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

  // Sessions actually shown on screen right now: each leaf's active tab in
  // the active group. Used to block deactivating a visible session (its
  // pane would immediately respawn it).
  const visibleAgentIds = useMemo(() => {
    const set = new Set<string>();
    const walk = (node: LayoutNode | null) => {
      if (!node) return;
      if (node.type === "leaf") {
        const id = activeAgentInLeaf(node);
        if (id) set.add(id);
      } else {
        node.children.forEach(walk);
      }
    };
    walk(activeGroupLayout);
    return set;
  }, [activeGroupLayout]);

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
  const docsProject = useMemo(
    () =>
      docsRequest
        ? projects.find((project) => project.id === docsRequest.projectId) ??
          activeSessionProject
        : activeSessionProject,
    [activeSessionProject, docsRequest, projects]
  );
  const docsSession = useMemo(
    () =>
      docsRequest?.agentId
        ? agents.find((agent) => agent.id === docsRequest.agentId) ??
          activeAgent
        : activeAgent,
    [activeAgent, agents, docsRequest]
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
        onRenameSession={setRenameSessionId}
        onContextMenu={onSidebarContextMenu}
        onNewProject={() => setShowProjectModal(true)}
        onNewSession={() =>
          activeProject ? setShowModal(true) : setShowProjectModal(true)
        }
        docsOpen={docsOpen}
        onToggleDocs={() =>
          setDocsOpen((open) => {
            if (!open) setDocsRequest(null);
            return !open;
          })
        }
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={toggleAlwaysOnTop}
        desktopPetEnabled={desktopPetEnabled}
        desktopPetAvailable={!isSecondaryWindow}
        onToggleDesktopPet={() =>
          handleDesktopPetEnabledChange(!desktopPetEnabled)
        }
        onOpenNewWindow={openNewAppWindow}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onRemove={removeAgent}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onReorderProject={reorderProject}
        onProjectContextMenu={onSidebarProjectContextMenu}
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
        setAgentSessionId={setAgentSessionId}
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
        onOpenImagePath={handleOpenImagePath}
        onOpenFolderPath={handleOpenFolderPath}
        onOpenTerminalPath={handleOpenTerminalPath}
      />
      {docsOpen && (
        <div className="docs-overlay">
          <div className="docs-drawer-shell" style={{ width: docsWidth + 7 }}>
            <div
              className="docs-resizer"
              onPointerDown={handleDocsResizeStart}
              title="Resize docs"
            />
            <DocsPanel
              open={docsOpen}
              activeProject={docsProject}
              activeSession={docsSession}
              width={docsWidth}
              requestedPath={
                docsRequest && docsRequest.projectId === docsProject?.id
                  ? docsRequest.relativePath
                  : null
              }
              requestKey={docsRequest?.key ?? 0}
              theme={appTheme}
              onClose={() => setDocsOpen(false)}
            />
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
          theme={appTheme}
          onThemeChange={handleThemeChange}
          desktopPetEnabled={desktopPetEnabled}
          desktopPetAvailable={!isSecondaryWindow}
          onDesktopPetEnabledChange={handleDesktopPetEnabledChange}
          onResetDesktopPetPosition={resetDesktopPetPosition}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingReopen && !isSecondaryWindow && (
        <ReopenSessionsModal
          count={pendingReopen.count}
          onYes={confirmReopen}
          onNo={dismissReopen}
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
      {renameProjectId &&
        (() => {
          const target = projects.find((p) => p.id === renameProjectId);
          if (!target) return null;
          return (
            <RenameProjectModal
              currentName={target.name}
              onCancel={() => setRenameProjectId(null)}
              onRename={(name) => {
                renameProject(target.id, name);
                setRenameProjectId(null);
              }}
            />
          );
        })()}
      <ToastContainer
        toasts={toasts}
        onSelect={selectAgent}
        onDismiss={dismissToast}
      />
      {imageViewer && (
        <ImageViewer
          path={imageViewer.path}
          folder={imageViewer.folder}
          onClose={() => setImageViewer(null)}
        />
      )}
      {propertiesAgentId &&
        (() => {
          const target = agents.find((a) => a.id === propertiesAgentId);
          if (!target) return null;
          return (
            <SessionPropertiesModal
              agent={target}
              project={
                projects.find((p) => p.id === target.projectId) ?? null
              }
              onClose={() => setPropertiesAgentId(null)}
            />
          );
        })()}
      {propertiesProjectId &&
        (() => {
          const target = projects.find((p) => p.id === propertiesProjectId);
          if (!target) return null;
          return (
            <ProjectPropertiesModal
              project={target}
              agents={agents}
              onClose={() => setPropertiesProjectId(null)}
            />
          );
        })()}
      {searchOpen && (
        <SearchBar
          onFindNext={(q) => {
            const id = activeAgentId;
            if (!id || !q) return;
            const entry = termsRef.current.get(id);
            entry?.search.findNext(q, { incremental: false });
          }}
          onFindPrev={(q) => {
            const id = activeAgentId;
            if (!id || !q) return;
            const entry = termsRef.current.get(id);
            entry?.search.findPrevious(q, { incremental: false });
          }}
          onClose={() => {
            setSearchOpen(false);
            const id = activeAgentId;
            if (id) {
              const entry = termsRef.current.get(id);
              entry?.search.clearDecorations();
              entry?.term.focus();
            }
          }}
        />
      )}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          hasActive={!!activeGroupLayout && !!activePath}
          canPlaceInActive={canPlaceContextAgentInActiveGroup}
          isSessionLocked={!!contextGroup?.sessionLocked}
          canPinSession={canPinContextGroupSession}
          canRestart={
            agents.find((a) => a.id === contextMenu.agentId)?.status ===
            "exited"
          }
          canDeactivate={(() => {
            const s = agents.find(
              (a) => a.id === contextMenu.agentId
            )?.status;
            const running =
              s === "running" || s === "working" || s === "starting";
            // Only when not currently displayed, to avoid an immediate respawn.
            return running && !visibleAgentIds.has(contextMenu.agentId);
          })()}
          onClose={() => setContextMenu(null)}
          onAction={onContextAction}
        />
      )}
      {projectContextMenu && (
        <ProjectContextMenu
          state={projectContextMenu}
          onClose={() => setProjectContextMenu(null)}
          onAction={(action) => {
            if (action === "rename") {
              setRenameProjectId(projectContextMenu.projectId);
            } else if (action === "delete") {
              removeProject(projectContextMenu.projectId);
            } else if (action === "properties") {
              setPropertiesProjectId(projectContextMenu.projectId);
            }
            setProjectContextMenu(null);
          }}
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
