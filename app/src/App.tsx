import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  getCurrentWindow,
  invoke,
  listen,
  UserAttentionType,
} from "./platform/runtime";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

import {
  LS_AGENTS,
  LS_PROJECT_FOLDERS,
  LS_PROJECTS,
  AI_TOOLS,
  toolForId,
  toolSupportsChat,
} from "./types";
import type {
  Agent,
  ContextMenuState,
  DragState,
  DropTargetState,
  DropZone,
  Group,
  NewAgentPayload,
  NewProjectPayload,
  Path,
  Project,
  ProjectContextMenuState,
  ProjectFolder,
  ProjectFolderContextMenuState,
  SessionContextAction,
  StoredAgent,
  StoredProject,
  StoredProjectFolder,
  TabCtxState,
  TerminalEntry,
  Toast,
} from "./types";
import {
  activeAgentInLeaf,
  collectAgentIds,
  findLeafPath,
  getAt,
  setLeafActiveTab,
  updateGroup,
} from "./lib/layout";
import * as groupOps from "./lib/groupOps";
import {
  isBrowserTabId,
  layoutTabIdsForClosedBrowser,
  makeBrowserTabId,
  isDocTabId,
  makeDocTabId,
  parseBrowserTabId,
  parseDocTabId,
  stripDocTabs,
} from "./lib/docTabs";
import {
  isGitHistoryTabId,
  makeGitHistoryTabId,
  parseGitHistoryTabId,
} from "./lib/gitHistoryTabs";
import { loadBootstrap } from "./lib/persistence";
import type { Bootstrap } from "./lib/persistence";
import { applyTerminalTheme, createEntry, notifyDone } from "./lib/terminal";
import { playNotificationSound, loadNotificationSound, shouldSilenceOsNotification } from "./lib/notificationSound";
import { buildSpawnArgs } from "./lib/spawn";
import {
  defaultSessionWorkerSettings,
  normalizeSessionWorkerSettings,
} from "./lib/sessionWorkers";
import {
  AGENT_ACTIVITY_STALE_AFTER_MS,
  applyAgentHookEvent,
  applyAgentRuntimeStatus,
  deriveAgentStatus,
  isAgentActivelyWorking,
  isAgentCancellationHookEvent,
  isAgentRuntimeActive,
  runtimeStatusOf,
  type AgentHookEvent,
} from "./lib/agentActivity";
import {
  COMMAND_DEFINITIONS,
  commandForKeyboardEvent,
  loadCommandShortcuts,
  saveCommandShortcuts,
  type CommandId,
  type CommandShortcuts,
} from "./lib/commandRegistry";
import {
  type AttentionItem,
  type AttentionKind,
} from "./lib/attention";
import { useAttentionState } from "./hooks/useAttentionState";
import { useSessionLifecycleActions } from "./hooks/useSessionLifecycleActions";
import { useNativeViewOcclusion } from "./hooks/useNativeViewOcclusion";
import { scheduleActiveTerminalFocus } from "./lib/workspaceFocus";
import { isStandbySession, parseRememberedSessionIds, restoreStandbyEligibility } from "./lib/sessionStandby";
import type { QuickOpenItem } from "./lib/quickOpen";
import {
  clearScrollback,
  loadScrollback,
  pruneScrollback,
  saveScrollback,
} from "./lib/scrollback";
import { loadAppTheme, saveAppTheme } from "./lib/appTheme";
import type { AppThemeId } from "./lib/appTheme";
import { IS_COMPANY_BUILD } from "./lib/appInfo";
import { useAppLanguage } from "./lib/appLanguage";
import {
  LS_REOPEN_AGENTS,
  persistStorageSnapshot,
} from "./platform/storageMigration";
import { isElectronRuntime } from "./platform/electronBridge";
import type {
  DocumentBrowserCatalog,
  DocumentBrowserSnapshot,
  SpawnTerminalResult,
  TerminalDataPayload,
  TerminalReplay,
} from "./platform/ipcContract";
import {
  completeTerminalSync,
  deliverTerminalData,
} from "./lib/terminalDelivery";
import {
  scheduleStartupReadyFallback,
  type InitializingRuntimeStatus,
} from "./lib/startupReadiness";
import {
  buildDesktopPetUpdate,
  completionForAgent,
  loadDesktopPetEnabled,
  saveDesktopPetEnabled,
  type DesktopPetCompletion,
} from "./lib/desktopPet";
import {
  buildNewProjectWithFirstAgent,
} from "./lib/projectCreation";
import { loadSshHosts } from "./lib/sshHosts";
import {
  moveProjectToFolder as moveProjectToFolderInCatalog,
  reorderProjectFolders,
  unassignProjectFolder,
} from "./lib/projectFolders";
import {
  migrateLegacyWorkspaceStorage,
  workspaceWindowContext,
} from "./lib/workspaceWindow";

import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TerminalArea } from "./components/TerminalArea";
import { NewAgentModal } from "./components/NewAgentModal";
import { NewProjectModal } from "./components/NewProjectModal";
import { DeleteSessionModal } from "./components/DeleteSessionModal";
import { ToastContainer } from "./components/Toast";
import {
  ContextMenu,
  ProjectContextMenu,
  ProjectFolderContextMenu,
  TabContextMenu,
} from "./components/Menus";
import { FileTreePanel } from "./components/FileTreePanel";
import { SettingsModal } from "./components/SettingsModal";
import { RenameSessionModal } from "./components/RenameSessionModal";
import { RenameProjectModal } from "./components/RenameProjectModal";
import { SearchBar } from "./components/SearchBar";
import { ImageViewer } from "./components/ImageViewer";
import { SessionPropertiesModal } from "./components/SessionPropertiesModal";
import { ProjectPropertiesModal } from "./components/ProjectPropertiesModal";
import { ProjectFolderModal } from "./components/ProjectFolderModal";
import { QuickOpen } from "./components/QuickOpen";
import { AttentionCenter } from "./components/AttentionCenter";
import { UsageStatusBar } from "./components/UsageStatusBar";
import { BrowserHub } from "./components/BrowserHub";

const LS_FILES_WIDTH = "multiagent.filesWidth.v1";
const LS_FILES_OPEN = "multiagent.filesOpen.v1";
const LS_SIDEBAR_OPEN = "multiagent.sidebarOpen.v1";
const LS_ALWAYS_ON_TOP = "multiagent.alwaysOnTop.v1";
const DEFAULT_FILES_WIDTH = 300;
const MIN_FILES_WIDTH = 200;
const MIN_WORKSPACE_WIDTH = 260;
const MAX_RECENTLY_CLOSED_TABS = 20;

type QuickDocument = {
  projectId: string;
  projectName: string;
  relativePath: string;
  name: string;
};

type TerminalPathResolution = {
  kind: "image" | "html" | "markdown" | "folder" | "file";
  path: string;
};

type RuntimeFlags = {
  workspace_window: boolean;
  workspace_window_id: string | null;
  coordinator: boolean;
  open_agent_id?: string | null;
  build_variant?: "standard" | "company" | "store";
  remote_enabled?: boolean;
  update_provider?: "github" | "local-developer" | "microsoft-store";
  live_agent_ids?: string[];
};

type AgentWindowUsage = {
  in_use_agent_ids: string[];
  owned_agent_ids: string[];
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
    projectFolderId: project.projectFolderId,
  };
}

function storedProjectFolderFromProjectFolder(
  folder: ProjectFolder
): StoredProjectFolder {
  return {
    id: folder.id,
    name: folder.name,
    machineKey: folder.machineKey,
    createdAt: folder.createdAt,
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
    useAltScreen: agent.useAltScreen || undefined,
    workerSettings: normalizeSessionWorkerSettings(agent.workerSettings),
    pinned: agent.pinned || undefined,
    tabColor: agent.tabColor || undefined,
    createdAt: agent.createdAt,
    lastSessionId: agent.lastSessionId,
    resumeEligible: agent.resumeEligible ?? isAgentRuntimeActive(agent),
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
    projectFolderId: stored.projectFolderId || undefined,
  };
}

function projectFolderFromStored(
  stored: StoredProjectFolder,
  existing?: ProjectFolder
): ProjectFolder | null {
  if (!stored.id || !stored.name?.trim()) return null;
  return {
    id: stored.id,
    name: stored.name.trim(),
    machineKey: stored.machineKey || existing?.machineKey || "local",
    createdAt: stored.createdAt || existing?.createdAt || Date.now(),
  };
}

function mergeProjectFoldersFromStorage(
  current: ProjectFolder[],
  stored: StoredProjectFolder[],
  removedIds: Set<string>
) {
  const currentById = new Map(current.map((folder) => [folder.id, folder]));
  const merged = stored.flatMap((item) => {
    if (!item.id || removedIds.has(item.id)) return [];
    const folder = projectFolderFromStored(item, currentById.get(item.id));
    return folder ? [folder] : [];
  });
  return sameJson(
    current.map(storedProjectFolderFromProjectFolder),
    merged.map(storedProjectFolderFromProjectFolder)
  )
    ? current
    : merged;
}

function mergeProjectsFromStorage(
  current: Project[],
  stored: StoredProject[],
  removedIds: Set<string>
) {
  const currentById = new Map(current.map((project) => [project.id, project]));
  const merged: Project[] = [];
  for (const item of stored) {
    if (!item.id || removedIds.has(item.id)) continue;
    const project = projectFromStored(item, currentById.get(item.id));
    if (!project) continue;
    merged.push(project);
  }
  // A storage event comes from a peer workspace after its synchronous write,
  // so the stored catalog is authoritative here. Re-appending missing local
  // rows would resurrect projects deleted in another window.
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
    useAltScreen: stored.useAltScreen || undefined,
    workerSettings: normalizeSessionWorkerSettings(stored.workerSettings),
    pinned: stored.pinned || undefined,
    tabColor: stored.tabColor || undefined,
    createdAt: stored.createdAt || existing?.createdAt || Date.now(),
    lastSessionId:
      stored.lastSessionId ??
      stored.lastClaudeSessionId ??
      stored.lastResumeToken ??
      existing?.lastSessionId,
    status: existing?.status ?? "idle",
    runtimeStatus: existing?.runtimeStatus ?? "idle",
    deferredStart: existing?.deferredStart ?? (existing ? undefined : true),
    resumeEligible: typeof stored.resumeEligible === "boolean"
      ? stored.resumeEligible : existing?.resumeEligible ?? false,
    activity: existing?.activity,
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
  const merged: Agent[] = [];
  for (const item of stored) {
    if (!item.id || removedIds.has(item.id)) continue;
    const agent = agentFromStored(item, projects, currentById.get(item.id));
    if (!agent) continue;
    merged.push(agent);
  }
  // As with projects, absence in the peer-written catalog represents deletion.
  return sameJson(
    current.map(storedAgentFromAgent),
    merged.map(storedAgentFromAgent)
  )
    ? current
    : merged;
}

function clampFilesWidth(width: number) {
  const viewportMax =
    typeof window === "undefined"
      ? DEFAULT_FILES_WIDTH
      : Math.max(MIN_FILES_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH);
  if (!Number.isFinite(width)) return DEFAULT_FILES_WIDTH;
  return Math.min(viewportMax, Math.max(MIN_FILES_WIDTH, Math.round(width)));
}

function loadFilesWidth() {
  try {
    const raw = localStorage.getItem(LS_FILES_WIDTH);
    return raw ? clampFilesWidth(Number(raw)) : DEFAULT_FILES_WIDTH;
  } catch {
    return DEFAULT_FILES_WIDTH;
  }
}

function loadFilesOpen() {
  try {
    return localStorage.getItem(LS_FILES_OPEN) === "true";
  } catch {
    return false;
  }
}

function loadSidebarOpen() {
  try {
    return localStorage.getItem(LS_SIDEBAR_OPEN) !== "false";
  } catch {
    return true;
  }
}

function loadAlwaysOnTop() {
  try {
    return localStorage.getItem(LS_ALWAYS_ON_TOP) === "true";
  } catch {
    return false;
  }
}

function isAbsoluteFsPath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function joinFsPath(folder: string, relativePath: string) {
  return `${folder.replace(/[\\/]+$/, "")}/${relativePath}`;
}

// Returns the project-relative path when absolutePath is inside folder,
// otherwise null. Case-insensitive to match Windows path semantics.
function relativeIfInside(folder: string, absolutePath: string): string | null {
  const normFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  const normPath = absolutePath.replace(/\\/g, "/");
  if (!normFolder) return null;
  if (
    normPath.toLowerCase().startsWith(`${normFolder.toLowerCase()}/`) &&
    normPath.length > normFolder.length + 1
  ) {
    return normPath.slice(normFolder.length + 1);
  }
  return null;
}

function App() {
  const { language, text } = useAppLanguage();
  const workspace = workspaceWindowContext();
  migrateLegacyWorkspaceStorage(workspace);
  // One-shot bootstrap: read localStorage exactly once at mount.
  const bootstrapRef = useRef<Bootstrap | null>(null);
  if (!bootstrapRef.current) {
    bootstrapRef.current = loadBootstrap({
      groupsKey: workspace.groupsKey,
      viewKey: workspace.viewKey,
      migrateLegacyLayout: workspace.restore,
    });
  }
  const boot = bootstrapRef.current;

  const startupReadyTimersRef = useRef<Map<string, number>>(new Map());
  const clearAgentStartupReadyTimer = useCallback((agentId: string) => {
    const timer = startupReadyTimersRef.current.get(agentId);
    if (timer !== undefined) window.clearTimeout(timer);
    startupReadyTimersRef.current.delete(agentId);
  }, []);

  useEffect(() => () => {
    for (const timer of startupReadyTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    startupReadyTimersRef.current.clear();
  }, []);

  const [projects, setProjects] = useState<Project[]>(boot.projects);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>(
    boot.projectFolders
  );
  const [agents, setAgents] = useState<Agent[]>(() => {
    const remembered = parseRememberedSessionIds(readLocalStorageValue(LS_REOPEN_AGENTS));
    return boot.agents.map((agent) => ({
      ...agent,
      deferredStart: true,
      resumeEligible: restoreStandbyEligibility(agent, remembered),
    }));
  });
  const [groups, setGroups] = useState<Group[]>(boot.groups);
  // A document tab may be dragged into its own split, where its leaf no longer
  // contains the terminal that opened it. Keep the source session association
  // outside the layout so browser annotations still return to that session.
  const documentOwnerByTabRef = useRef<Map<string, string>>(new Map());
  const getDocumentOwner = useCallback(
    (docId: string) => documentOwnerByTabRef.current.get(docId) ?? null,
    []
  );
  // Sessions detached to other windows — kept visible but unavailable here.
  const [detachedAgentIds, setDetachedAgentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [inUseAgentIds, setInUseAgentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [ownedAgentIds, setOwnedAgentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    boot.activeProjectId
  );
  // Restore the layout immediately; cold-start sessions remain placeholders.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    workspace.restore || workspace.resumeLive ? boot.activeGroupId : null
  );
  const [activePath, setActivePath] = useState<Path | null>(
    workspace.restore || workspace.resumeLive ? boot.activePath : null
  );
  const [workspaceMode, setWorkspaceMode] = useState<"sessions" | "browser-hub">(
    "sessions"
  );
  const [browserCatalog, setBrowserCatalog] = useState<DocumentBrowserSnapshot[]>([]);
  const [browserHubSelectedId, setBrowserHubSelectedId] = useState<string | null>(null);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(loadFilesOpen);
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useNativeViewOcclusion(settingsOpen);
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
  const [filesWidth, setFilesWidth] = useState(loadFilesWidth);
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
  // Per-session preference: view a session as a chat transcript vs the terminal.
  const [chatModeAgents, setChatModeAgents] = useState<Set<string>>(
    () => new Set()
  );
  // Tools hidden from the new-session picker (Settings → Agents). Default: none.
  const [disabledTools, setDisabledTools] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("multiagent.disabledTools.v1") || "[]");
      return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  const handleToggleTool = useCallback((toolId: string, enabled: boolean) => {
    setDisabledTools((prev) => {
      const next = enabled ? prev.filter((id) => id !== toolId) : [...new Set([...prev, toolId])];
      try {
        localStorage.setItem("multiagent.disabledTools.v1", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  // Bottom usage bar visibility (Settings → Agents).
  const [showUsageBar, setShowUsageBar] = useState<boolean>(
    () => localStorage.getItem("multiagent.showUsageBar.v1") !== "0"
  );
  const handleShowUsageBarChange = useCallback((show: boolean) => {
    setShowUsageBar(show);
    try {
      localStorage.setItem("multiagent.showUsageBar.v1", show ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleChatMode = useCallback((agentId: string) => {
    setChatModeAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);
  const [projectContextMenu, setProjectContextMenu] =
    useState<ProjectContextMenuState | null>(null);
  const [projectFolderContextMenu, setProjectFolderContextMenu] =
    useState<ProjectFolderContextMenuState | null>(null);
  const [projectFolderEditor, setProjectFolderEditor] = useState<
    | { mode: "create"; machineKey: string }
    | { mode: "rename"; projectFolderId: string }
    | null
  >(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabCtxState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDocuments, setQuickDocuments] = useState<QuickDocument[]>([]);
  const [quickDocumentsLoading, setQuickDocumentsLoading] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const {
    items: attentionItems,
    push: pushAttention,
    acknowledgeCompletion: acknowledgeAgentCompletion,
    acknowledgeAgent: acknowledgeAgentAttention,
    acknowledgeItem: acknowledgeAttentionItem,
    acknowledgeAll: acknowledgeAllAttention,
    clearRead: clearReadAttention,
    beginAgentWork,
    resolveSession: resolveSessionAttention,
    unreadCount: attentionUnreadCount,
    unreadCompletionAgentIds,
  } = useAttentionState(agents);
  const [commandShortcuts, setCommandShortcuts] = useState<CommandShortcuts>(
    loadCommandShortcuts
  );
  const [runtimeFlags, setRuntimeFlags] = useState<RuntimeFlags | null>(null);
  const isCoordinatorWindow = runtimeFlags?.coordinator ?? workspace.restore;
  const remoteEnabled = runtimeFlags?.remote_enabled ?? !IS_COMPANY_BUILD;

  const termsRef = useRef<Map<string, TerminalEntry>>(new Map());
  const agentsRef = useRef<Agent[]>([]);
  const catalogAgentIdsRef = useRef<Set<string>>(
    new Set(boot.agents.map((agent) => agent.id))
  );
  const detachedAgentIdsRef = useRef<Set<string>>(new Set());
  const ownedAgentIdsRef = useRef<Set<string>>(new Set());
  const projectsRef = useRef<Project[]>([]);
  const projectFoldersRef = useRef<ProjectFolder[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const activePathRef = useRef<Path | null>(null);
  const alwaysOnTopRef = useRef(alwaysOnTop);
  const storedProjectsJsonRef = useRef(readLocalStorageValue(LS_PROJECTS));
  const storedProjectFoldersJsonRef = useRef(
    readLocalStorageValue(LS_PROJECT_FOLDERS)
  );
  const storedAgentsJsonRef = useRef(readLocalStorageValue(LS_AGENTS));
  const storedGroupsJsonRef = useRef(
    readLocalStorageValue(workspace.groupsKey)
  );
  const storedViewJsonRef = useRef(readLocalStorageValue(workspace.viewKey));
  const remoteAgentsJsonRef = useRef<string | null>(null);
  const remoteViewJsonRef = useRef<string | null>(null);
  const monitorStateJsonRef = useRef<string | null>(null);
  const usageCatalogJsonRef = useRef<string | null>(null);
  const desktopPetJsonRef = useRef<string | null>(null);
  const desktopPetQuestionsRef = useRef<Record<string, string>>({});
  const removedProjectIdsRef = useRef<Set<string>>(new Set());
  const removedProjectFolderIdsRef = useRef<Set<string>>(new Set());
  const removedAgentIdsRef = useRef<Set<string>>(new Set());
  const openedInitialAgentRef = useRef<string | null>(null);
  const executeCommandRef = useRef<((commandId: CommandId) => void) | null>(null);
  const recentlyClosedTabsRef = useRef<groupOps.ClosedTabHistoryEntry[]>([]);

  const syncSharedStateFromStorage = useCallback(() => {
    const projectsRaw = readLocalStorageValue(LS_PROJECTS);
    const projectFoldersRaw = readLocalStorageValue(LS_PROJECT_FOLDERS);
    const agentsRaw = readLocalStorageValue(LS_AGENTS);

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

    if (projectFoldersRaw !== storedProjectFoldersJsonRef.current) {
      const storedFolders = parseStoredArray<StoredProjectFolder>(
        projectFoldersRaw
      );
      const merged = mergeProjectFoldersFromStorage(
        projectFoldersRef.current,
        storedFolders,
        removedProjectFolderIdsRef.current
      );
      storedProjectFoldersJsonRef.current = projectFoldersRaw;
      if (merged !== projectFoldersRef.current) {
        projectFoldersRef.current = merged;
        setProjectFolders(merged);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    invoke<RuntimeFlags>("runtime_flags")
      .then((flags) => {
        if (cancelled) return;
        // Reattach only processes that survived in the tray. Dormant sessions
        // must not start just because another session is still running.
        const liveIds = new Set(flags.live_agent_ids ?? []);
        setAgents((current) => current.map((agent) => liveIds.has(agent.id)
          ? applyAgentRuntimeStatus(agent, "running") : agent));
        setRuntimeFlags(flags);
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeFlags({
            workspace_window: true,
            workspace_window_id: workspace.id,
            coordinator: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    listen<{ coordinator?: boolean }>(
      "workspace:coordinator-changed",
      (event) => {
        if (cancelled) return;
        setRuntimeFlags((current) =>
          current
            ? { ...current, coordinator: !!event.payload?.coordinator }
            : current
        );
      }
    )
      .then((remove) => {
        if (cancelled) remove();
        else unsubscribe = remove;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!runtimeFlags) return;
    invoke("renderer_ready").catch(() => {});
    if (!isCoordinatorWindow) return;
    const persist = () => persistStorageSnapshot().catch(() => {});
    persist();
    const interval = window.setInterval(persist, 3000);
    window.addEventListener("beforeunload", persist);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", persist);
    };
  }, [isCoordinatorWindow, runtimeFlags]);

  // Track sessions detached to other windows so the sidebar can label them
  // unavailable and prevent double-opening.
  useEffect(() => {
    if (!runtimeFlags) return;
    let cancelled = false;
    invoke<Record<string, number>>("get_detached_agents")
      .then((map) => {
        if (cancelled) return;
        setDetachedAgentIds(new Set(Object.keys(map)));
      })
      .catch(() => {});
    const unsubs: Array<() => void> = [];
    listen<{ agentId: string }>("session-detached", (e) => {
      setDetachedAgentIds((prev) => {
        const next = new Set(prev);
        next.add(e.payload.agentId);
        return next;
      });
      setOwnedAgentIds((current) => {
        if (!current.has(e.payload.agentId)) return current;
        const next = new Set(current);
        next.delete(e.payload.agentId);
        ownedAgentIdsRef.current = next;
        return next;
      });
    }).then((fn) => { if (cancelled) fn(); else unsubs.push(fn); });
    listen<{ agentIds: string[] }>("sessions-reattached", (e) => {
      setDetachedAgentIds((prev) => {
        const next = new Set(prev);
        for (const id of e.payload.agentIds) next.delete(id);
        return next;
      });
    }).then((fn) => { if (cancelled) fn(); else unsubs.push(fn); });
    return () => { cancelled = true; unsubs.forEach((fn) => fn()); };
  }, [runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags) return;
    let cancelled = false;
    const refresh = () => {
      invoke<AgentWindowUsage>("get_agent_window_usage")
        .then((usage) => {
          if (!cancelled) {
            setInUseAgentIds(new Set(usage.in_use_agent_ids ?? []));
            const owned = new Set(usage.owned_agent_ids ?? []);
            ownedAgentIdsRef.current = owned;
            setOwnedAgentIds(owned);
          }
        })
        .catch(() => {});
    };
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags) return;
    syncSharedStateFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === LS_PROJECTS ||
        event.key === LS_PROJECT_FOLDERS ||
        event.key === LS_AGENTS
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
    projectFoldersRef.current = projectFolders;
  }, [projectFolders]);

  useEffect(() => {
    agentsRef.current = agents;
    const nextIds = new Set(agents.map((agent) => agent.id));
    const removedIds = [...catalogAgentIdsRef.current].filter(
      (agentId) => !nextIds.has(agentId)
    );
    catalogAgentIdsRef.current = nextIds;
    if (removedIds.length === 0) return;
    setGroups((previous) => {
      let state: groupOps.GroupState = {
        groups: previous,
        activeGroupId: activeGroupIdRef.current,
        activePath: activePathRef.current,
      };
      for (const agentId of removedIds) {
        state = groupOps.removeAgentFromLayout(state, agentId);
      }
      activeGroupIdRef.current = state.activeGroupId;
      activePathRef.current = state.activePath;
      setActiveGroupId(state.activeGroupId);
      setActivePath(state.activePath);
      return state.groups;
    });
  }, [agents]);

  useEffect(() => {
    detachedAgentIdsRef.current = detachedAgentIds;
  }, [detachedAgentIds]);

  // Prune detached agents from groups so they don't linger in the terminal
  // area after being opened in another window.
  useEffect(() => {
    if (detachedAgentIds.size === 0) return;
    setGroups((prev) => {
      let changed = false;
      let next = prev;
      for (const id of detachedAgentIds) {
        const pruned = groupOps.removeAgentFromLayout(
          { groups: next, activeGroupId: activeGroupIdRef.current, activePath: activePathRef.current },
          id
        );
        if (pruned.groups !== next) {
          changed = true;
          next = pruned.groups;
          activeGroupIdRef.current = pruned.activeGroupId;
          activePathRef.current = pruned.activePath;
          setActiveGroupId(pruned.activeGroupId);
          setActivePath(pruned.activePath);
        }
      }
      return changed ? next : prev;
    });
  }, [detachedAgentIds]);

  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow) return;
    // Showing the always-on-top pet can move the main window behind the current
    // foreground app on some Windows setups. Make the main window the final
    // startup action so launching MultiAgent never appears to open only the pet.
    invoke("set_desktop_pet_enabled", { enabled: desktopPetEnabled })
      .catch(() => {})
      .finally(() => invoke("show_main_window").catch(() => {}));
  }, [desktopPetEnabled, isCoordinatorWindow, runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow) return;
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
    isCoordinatorWindow,
    projects,
    runtimeFlags,
  ]);

  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow) return;
    pruneScrollback(new Set(agentsRef.current.map((agent) => agent.id)));
  }, [isCoordinatorWindow, runtimeFlags]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Mirror agent metadata into the Rust remote hub so the remote web
  // client can list sessions and show live status.
  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow || !remoteEnabled) return;
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
  }, [agents, isCoordinatorWindow, projects, remoteEnabled, runtimeFlags]);

  // Mirror projects, sessions, and the read-only Screen layout so the remote
  // client can offer the same Screen/session navigation as the desktop app.
  // Remote selection remains independent and never changes the desktop view.
  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow || !remoteEnabled) return;
    const payload = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        folder: p.folder,
        sshHostId: p.sshHostId,
        projectFolderId: p.projectFolderId,
      })),
      projectFolders: projectFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        machineKey: folder.machineKey,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        name: a.name,
        folder: a.folder,
        status: a.status,
        aiToolId: a.aiToolId,
        dangerous: a.dangerous,
      })),
      availableTools: AI_TOOLS.filter(
        (tool) => tool.id === "none" || !disabledTools.includes(tool.id)
      ).map((tool) => ({
        id: tool.id,
        label: tool.label,
        supportsDangerous: Boolean(tool.dangerousFlag),
      })),
      groups: groups.flatMap((group) => {
        // Remote clients only understand agent ids — hide doc tabs.
        const layout = stripDocTabs(group.layout);
        if (!layout) return [];
        return [{ id: group.id, projectId: group.projectId, layout }];
      }),
      activeGroupId,
    };
    const view = JSON.stringify(payload);
    if (remoteViewJsonRef.current === view) return;
    remoteViewJsonRef.current = view;
    invoke("sync_remote_view", { view }).catch(() => {});
  }, [
    projects,
    projectFolders,
    agents,
    groups,
    activeGroupId,
    isCoordinatorWindow,
    remoteEnabled,
    runtimeFlags,
    disabledTools,
  ]);

  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow) return;
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
        runtimeStatus: runtimeStatusOf(a),
      })),
    };
    const json = JSON.stringify(payload);
    if (usageCatalogJsonRef.current === json) return;
    usageCatalogJsonRef.current = json;
    invoke("sync_usage_catalog", payload).catch(() => {});
  }, [projects, agents, isCoordinatorWindow, runtimeFlags]);

  useEffect(() => {
    if (!runtimeFlags || !isCoordinatorWindow) return;
    const payload = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        folder: p.folder,
        sshHostId: p.sshHostId,
      })),
      agents: agents.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        name: a.name,
        folder: a.folder,
        aiToolId: a.aiToolId,
        status: a.status,
        lastSessionId: a.lastSessionId ?? null,
        sshHostId: a.sshHostId ?? null,
      })),
      availableTools: AI_TOOLS.filter(
        (tool) => tool.id === "none" || !disabledTools.includes(tool.id)
      ).map((tool) => ({
        id: tool.id,
        label: tool.label,
        supportsDangerous: Boolean(tool.dangerousFlag),
      })),
      // Monitor clients only understand agent ids — hide doc tabs.
      groups: groups.flatMap((group) => {
        const layout = stripDocTabs(group.layout);
        if (!layout) return [];
        return [{ ...group, layout }];
      }),
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
    isCoordinatorWindow,
    runtimeFlags,
    disabledTools,
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
    const storedFolders = projectFolders.map(
      storedProjectFolderFromProjectFolder
    );
    const mergedFolders = mergeStoredByIdForWrite(
      storedFolders,
      parseStoredArray<StoredProjectFolder>(
        readLocalStorageValue(LS_PROJECT_FOLDERS)
      ),
      removedProjectFolderIdsRef.current
    );
    writeLocalStorageIfChanged(
      storedProjectFoldersJsonRef,
      LS_PROJECT_FOLDERS,
      JSON.stringify(mergedFolders)
    );
  }, [projectFolders]);

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
    writeLocalStorageIfChanged(
      storedGroupsJsonRef,
      workspace.groupsKey,
      JSON.stringify(groups)
    );
  }, [groups, workspace.groupsKey]);

  useEffect(() => {
    if (!runtimeFlags) return;
    writeLocalStorageIfChanged(
      storedViewJsonRef,
      workspace.viewKey,
      JSON.stringify({ activeProjectId, activeGroupId, activePath })
    );
  }, [
    activeProjectId,
    activeGroupId,
    activePath,
    runtimeFlags,
    workspace.viewKey,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_FILES_WIDTH, String(filesWidth));
    } catch {}
  }, [filesWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_FILES_OPEN, String(filesOpen));
    } catch {}
  }, [filesOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SIDEBAR_OPEN, String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  // Keep the native window-control overlay colors in sync with the theme.
  useEffect(() => {
    if (!isElectronRuntime()) return;
    const el = document.querySelector(".app");
    if (!el) return;
    const styles = getComputedStyle(el);
    const hex = (name: string) => {
      const value = styles.getPropertyValue(name).trim();
      return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
    };
    invoke("set_titlebar_overlay", {
      color: hex("--app-panel") ?? "#0b0f15",
      symbolColor: hex("--app-muted") ?? "#8b949e",
    }).catch(() => {});
  }, [appTheme]);

  useEffect(() => {
    saveCommandShortcuts(commandShortcuts);
  }, [commandShortcuts]);

  useEffect(() => {
    if (!quickOpen) return;
    let cancelled = false;
    setQuickDocumentsLoading(true);
    void Promise.all(
      projects
        .filter((project) => !project.sshHostId)
        .map(async (project) => {
          try {
            const files = await invoke<Array<{ name: string; relative_path: string }>>(
              "list_markdown_files",
              { folder: project.folder }
            );
            return files.map((file) => ({
              projectId: project.id,
              projectName: project.name,
              relativePath: file.relative_path,
              name: file.name,
            }));
          } catch {
            return [];
          }
        })
    ).then((groups) => {
      if (!cancelled) setQuickDocuments(groups.flat());
    }).finally(() => {
      if (!cancelled) setQuickDocumentsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projects, quickOpen]);

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
      if (event.key === "Escape" && quickOpen) {
        event.preventDefault();
        setQuickOpen(false);
        return;
      }
      if (event.key === "Escape" && attentionOpen) {
        event.preventDefault();
        setAttentionOpen(false);
        return;
      }
      const commandId = commandForKeyboardEvent(event, commandShortcuts);
      if (
        commandId &&
        (!inField || commandId === "quick-open" || commandId === "attention-center")
      ) {
        event.preventDefault();
        executeCommandRef.current?.(commandId);
        return;
      }
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
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
  }, [attentionOpen, commandShortcuts, quickOpen, searchOpen, settingsOpen]);

  const handleThemeChange = useCallback((theme: AppThemeId) => {
    setAppTheme(theme);
    saveAppTheme(theme);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setFilesWidth((width) => clampFilesWidth(width));
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
        pushToast("", text("창 고정", "Always on top"), text(`상시 최상단 설정 실패: ${String(error)}`, `Could not change always-on-top: ${String(error)}`));
      });
  }, [pushToast, text]);

  const handleDesktopPetEnabledChange = useCallback((enabled: boolean) => {
    saveDesktopPetEnabled(enabled);
    setDesktopPetEnabled(enabled);
  }, []);

  const resetDesktopPetPosition = useCallback(() => {
    invoke("reset_desktop_pet_position").catch((error) => {
      pushToast("", "Desktop Pet", text(`위치를 초기화할 수 없습니다: ${String(error)}`, `Could not reset the position: ${String(error)}`));
    });
  }, [pushToast, text]);

  const openNewAppWindow = useCallback((agentId?: string | null) => {
    const id = agentId ?? null;
    // Remove the session from this window's groups so it doesn't appear in
    // two windows at once.
    if (id) {
      setGroups((prev) => {
        const next = groupOps.removeAgentFromLayout(
          {
            groups: prev,
            activeGroupId: activeGroupIdRef.current,
            activePath: activePathRef.current,
          },
          id
        );
        activeGroupIdRef.current = next.activeGroupId;
        activePathRef.current = next.activePath;
        setActiveGroupId(next.activeGroupId);
        setActivePath(next.activePath);
        return next.groups;
      });
    }
    invoke("open_new_app_window", { agentId: id }).catch((error) => {
      pushToast("", text("새 창", "New window"), text(`새 창을 열 수 없습니다: ${String(error)}`, `Could not open a new window: ${String(error)}`));
    });
  }, [pushToast, text]);

  // Clicking a completion surface focuses the app and jumps to the session.
  // The desktop pet itself is non-focusable, so it must explicitly focus main.
  useEffect(() => {
    if (!runtimeFlags) return;
    let cancelled = false;
    const unsubscribes: Array<() => void> = [];
    const activate = (agentId?: string) => {
      invoke("show_main_window", { agentId: agentId ?? null }).catch(() => {});
      if (agentId) selectAgentRef.current?.(agentId);
    };
    const track = (unsubscribe: () => void) => {
      if (cancelled) unsubscribe();
      else unsubscribes.push(unsubscribe);
    };
    listen<{ agentId?: string }>("desktop-pet:activate", (event) => {
      activate(event.payload?.agentId);
      setDesktopPetCompletions([]);
      if (event.payload?.agentId) {
        acknowledgeAgentAttention(event.payload.agentId);
      }
    }).then(track).catch(() => {});
    listen("desktop-pet:close-requested", () => {
      handleDesktopPetEnabledChange(false);
    }).then(track).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    acknowledgeAgentAttention,
    handleDesktopPetEnabledChange,
    runtimeFlags,
  ]);

  // ---- PTY + hook event listeners

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const track = (u: () => void) => {
      if (cancelled) u();
      else unsubs.push(u);
    };

    listen<TerminalDataPayload>("pty:data", (e) => {
      if (cancelled) return;
      const id = e.payload.id;
      const entry = termsRef.current.get(id);
      if (entry) {
        const result = deliverTerminalData(
          entry,
          e.payload,
          (data) => entry.term.write(data)
        );
        if (result === "gap" && isElectronRuntime()) {
          const resync = async () => {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const replay = await invoke<TerminalReplay>("attach_terminal", {
                id,
                afterSequence: entry.lastSequence,
              });
              if (termsRef.current.get(id) !== entry) {
                await invoke("detach_terminal", { id }).catch(() => {});
                return;
              }
              const syncResult = completeTerminalSync(
                entry,
                replay,
                (data) => entry.term.write(data)
              );
              if (syncResult !== "gap") return;
            }
          };
          void resync().catch(() => {});
        }
      }

      setAgents((cur) =>
        cur.map((a) =>
          a.id === id && (a.status === "idle" || a.status === "starting")
            ? applyAgentRuntimeStatus(a, "running")
            : a
        )
      );
    }).then(track);

    listen<{ id: string }>("pty:exit", (e) => {
      if (cancelled) return;
      const id = e.payload.id;
      clearAgentStartupReadyTimer(id);
      const exitingAgent = agentsRef.current.find((agent) => agent.id === id);
      if (exitingAgent && isAgentActivelyWorking(exitingAgent)) {
        const sessionKey =
          exitingAgent.activity?.providerSessionId?.trim() ||
          exitingAgent.lastSessionId?.trim() ||
          id;
        const projectName =
          projectsRef.current.find((project) => project.id === exitingAgent.projectId)
            ?.name || "Unknown project";
        pushAttention({
          dedupeKey: `stale:${sessionKey}`,
          kind: "stale",
          agentId: id,
          sessionKey,
          title: `${projectName} / ${exitingAgent.name}`,
          body: text("작업 중 PTY가 종료되었습니다. 세션 상태를 확인해 주세요.", "The PTY exited while work was in progress. Check the session status."),
          createdAt: Date.now(),
        });
      }
      const entry = termsRef.current.get(id);
      if (entry) {
        entry.spawned = false;
        entry.spawnPromise = null;
        entry.attached = false;
        entry.syncing = false;
        entry.pendingOutput = [];
        try {
          const data = entry.serialize.serialize({ scrollback: 1000 });
          saveScrollback(id, data);
        } catch {}
      }
      setAgents((prev) =>
        prev.map((a) =>
          a.id === id ? applyAgentRuntimeStatus(a, "exited") : a
        )
      );
    }).then(track);

    if (remoteEnabled && isCoordinatorWindow) {
      listen<{ login: string }>("remote:access-request", (e) => {
        if (cancelled) return;
        playNotificationSound();
        pushToast(
          "",
          text("원격 접속 요청", "Remote access request"),
          text(`GitHub @${e.payload.login} — 설정 > Remote access에서 승인하세요`, `GitHub @${e.payload.login} — approve this request in Settings > Remote access`)
        );
      }).then(track);
    }


    listen<AgentHookEvent>(
      "agent:hook-event",
      (e) => {
        if (cancelled) return;
        const payload = e.payload;
        const { id, event } = payload;
        clearAgentStartupReadyTimer(id);
        const currentAgent = agentsRef.current.find((agent) => agent.id === id);
        const nextAgent = currentAgent
          ? applyAgentHookEvent(currentAgent, payload)
          : null;
        const nextWorkStatus = nextAgent?.activity?.workStatus;
        const isActiveWork =
          nextWorkStatus === "working" ||
          nextWorkStatus === "waiting" ||
          nextWorkStatus === "blocked";

        if (isActiveWork && nextAgent) {
          const sessionKey =
            nextAgent.activity?.providerSessionId?.trim() ||
            nextAgent.lastSessionId?.trim() ||
            id;
          const projectName =
            projectsRef.current.find((project) => project.id === nextAgent.projectId)
              ?.name || "Unknown project";
          beginAgentWork(id, sessionKey);
          if (nextWorkStatus === "waiting" || nextWorkStatus === "blocked") {
            const kind: AttentionKind = nextWorkStatus;
            const body =
              nextAgent.activity?.interactiveQuestion?.trim() ||
              nextAgent.activity?.lastPrompt?.trim() ||
              (kind === "waiting"
                ? text("사용자 응답 또는 권한 승인을 기다리고 있습니다.", "Waiting for a user response or permission approval.")
                : text("작업이 차단되었습니다. 세션을 확인해 주세요.", "Work is blocked. Check the session."));
            pushAttention({
              dedupeKey: `${kind}:${sessionKey}`,
              kind,
              agentId: id,
              sessionKey,
              title: `${projectName} / ${nextAgent.name}`,
              body,
              createdAt: nextAgent.activity?.receivedAt || Date.now(),
            });
          }
          setDesktopPetCompletions((previous) =>
            previous.filter(
              (completion) =>
                completion.sessionKey !== sessionKey && completion.agentId !== id
            )
          );
          setDesktopPetQuestions((previous) => {
            const next = { ...previous };
            const question =
              payload.interactive_question?.trim() ||
              (payload.tool_name?.toLowerCase() === "askuserquestion"
                ? payload.tool_input?.trim()
                : undefined) ||
              payload.prompt?.trim();
            if (question) next[id] = question;
            desktopPetQuestionsRef.current = next;
            return next;
          });
        } else if (isAgentCancellationHookEvent(payload) && nextAgent) {
          const sessionKey =
            currentAgent?.activity?.providerSessionId?.trim() ||
            currentAgent?.lastSessionId?.trim() ||
            id;
          resolveSessionAttention(sessionKey);
          setDesktopPetQuestions((previous) => {
            if (!(id in previous)) return previous;
            const next = { ...previous };
            delete next[id];
            desktopPetQuestionsRef.current = next;
            return next;
          });
          setDesktopPetCompletions((previous) =>
            previous.filter(
              (completion) =>
                completion.sessionKey !== sessionKey && completion.agentId !== id
            )
          );
        } else if (event === "done" && nextAgent) {
          const completedQuestion =
            desktopPetQuestionsRef.current[id] ||
            currentAgent?.activity?.interactiveQuestion ||
            currentAgent?.activity?.lastPrompt;
          setDesktopPetQuestions((previous) => {
            if (!(id in previous)) return previous;
            const next = { ...previous };
            delete next[id];
            desktopPetQuestionsRef.current = next;
            return next;
          });
          const hadActiveWork =
            currentAgent &&
            (isAgentActivelyWorking(currentAgent) ||
              currentAgent.activity?.workStatus === "working" ||
              currentAgent.activity?.workStatus === "waiting" ||
              currentAgent.activity?.workStatus === "blocked");
          if (currentAgent && hadActiveWork) {
            const project = projectsRef.current.find(
              (candidate) => candidate.id === currentAgent.projectId
            );
            const projectName = project?.name || "Unknown project";
            const title = `${projectName} / ${currentAgent.name}`;
            const petCompletion = completionForAgent(
              nextAgent,
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
            const sessionKey = petCompletion.sessionKey;
            resolveSessionAttention(sessionKey);
            pushAttention({
              dedupeKey: `completed:${sessionKey}`,
              kind: "completed",
              agentId: currentAgent.id,
              sessionKey,
              title,
              body: completedQuestion?.trim()
                ? text(`완료 · ${completedQuestion.trim()}`, `Completed · ${completedQuestion.trim()}`)
                : text("작업이 끝났습니다.", "Work completed."),
              createdAt: nextAgent.activity?.receivedAt || Date.now(),
            });
            // Hook events are process-wide, but completion sounds/toasts belong
            // only to the workspace that owns the session. Every peer still
            // receives the unread sidebar marker through AttentionItems.
            if (
              !isElectronRuntime() ||
              ownedAgentIdsRef.current.has(currentAgent.id)
            ) {
              playNotificationSound(
                loadNotificationSound(),
                text(`${projectName} ${currentAgent.name} 작업이 끝났어요`, `${projectName} ${currentAgent.name} completed its work`)
              );
              pushToast(currentAgent.id, title, text("작업이 끝났어요", "Work completed"));
              // When the owning workspace isn't focused, flash its taskbar icon
              // and route the native notification back to the owner.
              const soundConfig = loadNotificationSound();
              if (soundConfig.osNotification !== false) {
                getCurrentWindow()
                  .isFocused()
                  .then((focused) => {
                    if (focused) return;
                    getCurrentWindow()
                      .requestUserAttention(UserAttentionType.Critical)
                      .catch(() => {});
                    notifyDone({
                      agentId: currentAgent.id,
                      projectName,
                      sessionName: currentAgent.name,
                      silent: shouldSilenceOsNotification(soundConfig),
                      onActivate: () =>
                        selectAgentRef.current?.(currentAgent.id),
                    }).catch(() => {});
                  })
                  .catch(() => {});
              }
            }
          }
        }
        setAgents((cur) =>
          cur.map((agent) =>
            agent.id === id ? applyAgentHookEvent(agent, payload) : agent
          )
        );
      }
    ).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [
    beginAgentWork,
    clearAgentStartupReadyTimer,
    isCoordinatorWindow,
    pushAttention,
    pushToast,
    remoteEnabled,
    resolveSessionAttention,
    text,
  ]);

  // A lost Stop hook must not leave the UI and desktop pet spinning forever.
  // Keep the detailed activity for diagnostics, but degrade stale work to the
  // live process state until a new hook event arrives.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const agent of agentsRef.current) {
        const activity = agent.activity;
        if (
          !activity ||
          now - activity.receivedAt <= AGENT_ACTIVITY_STALE_AFTER_MS ||
          !["working", "waiting", "blocked"].includes(activity.workStatus)
        ) continue;
        const sessionKey =
          activity.providerSessionId?.trim() ||
          agent.lastSessionId?.trim() ||
          agent.id;
        const projectName =
          projectsRef.current.find((project) => project.id === agent.projectId)?.name ||
          "Unknown project";
        pushAttention({
          dedupeKey: `stale:${sessionKey}`,
          kind: "stale",
          agentId: agent.id,
          sessionKey,
          title: `${projectName} / ${agent.name}`,
          body: text("Hook 상태가 오래되어 현재 작업 상태를 다시 확인해야 합니다.", "The hook status is stale. Check the current work status again."),
          createdAt: activity.receivedAt,
        });
      }
      setAgents((current) =>
        current.map((agent) => {
          const status = deriveAgentStatus(
            runtimeStatusOf(agent),
            agent.activity,
            now
          );
          return status === agent.status ? agent : { ...agent, status };
        })
      );
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [pushAttention, text]);

  // Keep the close handshake isolated from the frequently-changing PTY/hook
  // listeners. That prevents an effect cleanup race from leaving Electron to
  // wait for its fallback timeout during shutdown.
  useEffect(() => {
    if (!runtimeFlags) return;
    let closing = false;
    let unsubscribe: (() => void) | null = null;
    let cancelUnsubscribe: (() => void) | null = null;
    listen<void>("app:close-requested", async () => {
      if (closing) return;
      closing = true;
      try {
        const running = agentsRef.current
          .filter((agent) => {
            if (isStandbySession(agent)) return true;
            if (agent.status === "exited" || agent.status === "idle") return false;
            return Boolean(termsRef.current.get(agent.id)?.spawned);
          })
          .map((agent) => agent.id);
        localStorage.setItem(LS_REOPEN_AGENTS, JSON.stringify(running));
        await persistStorageSnapshot().catch(() => {});

        const targets = agentsRef.current.filter((agent) => {
          if (agent.status === "exited" || agent.status === "idle") return false;
          if (agent.aiToolId !== "codex" && agent.aiToolId !== "claude") return false;
          return Boolean(termsRef.current.get(agent.id)?.spawned);
        });
        await Promise.all(
          targets.map((agent) =>
            isElectronRuntime()
              ? invoke("terminal_session_action", {
                  id: agent.id,
                  action: "quit",
                }).catch(() => {})
              : invoke("write_pty", {
                  id: agent.id,
                  data: "/quit\r",
                }).catch(() => {})
          )
        );
        await new Promise((resolve) =>
          window.setTimeout(resolve, targets.length > 0 ? 300 : 20)
        );
        for (const [agentId, entry] of termsRef.current) {
          try {
            saveScrollback(
              agentId,
              entry.serialize.serialize({ scrollback: 1000 })
            );
          } catch (error) {
            console.warn("serialize failed", agentId, error);
          }
        }
        await persistStorageSnapshot().catch(() => {});
      } finally {
        await invoke("confirm_close").catch(() => {});
      }
    })
      .then((remove) => {
        unsubscribe = remove;
      })
      .catch(() => {});
    listen<{ action?: string; message?: string }>(
      "app:close-cancelled",
      (event) => {
        closing = false;
        pushToast(
          "",
          text("종료 취소", "Close cancelled"),
          event.payload?.message
            ? text(`저장 후 종료를 완료하지 못했습니다: ${event.payload.message}`, `Could not save and close: ${event.payload.message}`)
            : text("저장 후 종료를 완료하지 못했습니다.", "Could not save and close.")
        );
      }
    )
      .then((remove) => {
        cancelUnsubscribe = remove;
      })
      .catch(() => {});
    return () => {
      unsubscribe?.();
      cancelUnsubscribe?.();
    };
  }, [pushToast, remoteEnabled, runtimeFlags, text]);

  const dismissTransientMenus = useCallback(() => {
    setContextMenu(null);
    setProjectContextMenu(null);
    setProjectFolderContextMenu(null);
    setTabContextMenu(null);
  }, []);

  const clearTransientInteractionState = useCallback(() => {
    dismissTransientMenus();
    setDragState(null);
    setDropTarget(null);
  }, [dismissTransientMenus]);

  const flushTransientInteractionState = useCallback(() => {
    // Commit menu removal before showing confirmation or restoring focus.
    flushSync(clearTransientInteractionState);
  }, [clearTransientInteractionState]);

  const restoreWorkspaceFocus = useCallback(() => {
    scheduleActiveTerminalFocus({
      getState: () => ({
        groups: groupsRef.current,
        activeGroupId: activeGroupIdRef.current,
        activePath: activePathRef.current,
      }),
      getTarget: (agentId) => termsRef.current.get(agentId)?.term,
      requestFrame: window.requestAnimationFrame.bind(window),
      cancelFrame: window.cancelAnimationFrame.bind(window),
      shouldFocus: () => !document.querySelector(".modal-backdrop") &&
        !(document.activeElement instanceof HTMLElement &&
          document.activeElement.closest('input, select, textarea:not(.xterm-helper-textarea), [contenteditable="true"]')),
    });
  }, []);

  const settleSessionDeletionUi = useCallback(() => {
    flushTransientInteractionState();
    restoreWorkspaceFocus();
  }, [flushTransientInteractionState, restoreWorkspaceFocus]);

  // ---- Group operations (delegated to lib/groupOps as pure functions)

  const applyGroupOp = useCallback(
    (op: (state: groupOps.GroupState) => groupOps.GroupState) => {
      setGroups((prevGroups) => {
        const next = op({
          groups: prevGroups,
          activeGroupId: activeGroupIdRef.current,
          activePath: activePathRef.current,
        });
        // Keep imperative readers in lockstep with the React state update.
        // Session deletion immediately uses these refs to focus the surviving
        // pane, so waiting for a later effect would expose stale layout state.
        groupsRef.current = next.groups;
        activeGroupIdRef.current = next.activeGroupId;
        activePathRef.current = next.activePath;
        setActiveGroupId(next.activeGroupId);
        setActivePath(next.activePath);
        return next.groups;
      });
    },
    []
  );

  const {
    recoverExitedAgent,
    deactivateAgent,
    setAgentStatus,
    setAgentSessionId,
    removeAgent,
    pendingDeletion,
    confirmDeletion,
    cancelDeletion,
  } = useSessionLifecycleActions({
    agentsRef,
    detachedAgentIdsRef,
    removedAgentIdsRef,
    termsRef,
    setAgents,
    applyGroupOp,
    beforeDeleteConfirm: flushTransientInteractionState,
    afterDeleteSettled: settleSessionDeletionUi,
  });

  const commitGroupState = useCallback((next: groupOps.GroupState) => {
    groupsRef.current = next.groups;
    activeGroupIdRef.current = next.activeGroupId;
    activePathRef.current = next.activePath;
    setGroups(next.groups);
    setActiveGroupId(next.activeGroupId);
    setActivePath(next.activePath);
  }, []);

  const activateAgentProject = useCallback((agentId: string) => {
    const agent = agentsRef.current.find((candidate) => candidate.id === agentId);
    if (!agent) return null;
    setWorkspaceMode("sessions");
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

  const activateDeferredAgent = useCallback((agentId: string) => {
    const next = agentsRef.current.map((agent) =>
      agent.id === agentId && agent.deferredStart
        ? { ...agent, deferredStart: undefined, resumeEligible: true }
        : agent
    );
    if (!next.some((agent, index) => agent !== agentsRef.current[index])) return;
    agentsRef.current = next;
    setAgents(next);
  }, []);

  const selectAgent = useCallback(
    (agentId: string) => {
      // Block opening a session that is detached to another window.
      if (detachedAgentIdsRef.current.has(agentId)) return;
      activateDeferredAgent(agentId);
      acknowledgeAgentCompletion(agentId);
      const agent = activateAgentProject(agentId);
      const current = agentsRef.current.find((a) => a.id === agentId);
      if (current?.status === "exited") {
        void recoverExitedAgent(agentId).then(() => {
          applyGroupOp((s) => groupOps.selectAgent(s, agentId, agent?.projectId));
        });
        return;
      }
      applyGroupOp((s) => groupOps.selectAgent(s, agentId, agent?.projectId));
    },
    [
      acknowledgeAgentCompletion,
      activateDeferredAgent,
      activateAgentProject,
      applyGroupOp,
      recoverExitedAgent,
    ]
  );

  const requestSelectAgent = useCallback(
    (agentId: string) => {
      if (!isElectronRuntime()) {
        selectAgent(agentId);
        return;
      }
      void invoke<{ claimed: boolean }>("claim_agent_for_window", { agentId })
        .then(({ claimed }) => {
          if (!claimed) {
            setInUseAgentIds((current) => new Set(current).add(agentId));
            const agent = agentsRef.current.find((item) => item.id === agentId);
            pushToast(
              agentId,
              agent?.name ?? text("세션", "Session"),
              text("이미 다른 창에서 사용 중입니다.", "This session is already in use in another window.")
            );
            return;
          }
          const nextDetached = new Set(detachedAgentIdsRef.current);
          nextDetached.delete(agentId);
          detachedAgentIdsRef.current = nextDetached;
          setDetachedAgentIds(nextDetached);
          setInUseAgentIds((current) => {
            const next = new Set(current);
            next.delete(agentId);
            return next;
          });
          setOwnedAgentIds((current) => {
            const next = new Set(current).add(agentId);
            ownedAgentIdsRef.current = next;
            return next;
          });
          selectAgent(agentId);
        })
        .catch((error) => {
          const agent = agentsRef.current.find((item) => item.id === agentId);
          pushToast(
            agentId,
            agent?.name ?? text("세션", "Session"),
            text(`세션을 열 수 없습니다: ${String(error)}`, `Could not open the session: ${String(error)}`)
          );
        });
    },
    [pushToast, selectAgent, text]
  );

  const selectScreen = useCallback(
    (groupId: string, agentId: string) => {
      if (detachedAgentIdsRef.current.has(agentId)) return;
      activateDeferredAgent(agentId);
      activateAgentProject(agentId);
      applyGroupOp((state) =>
        groupOps.selectGroup(state, groupId, agentId)
      );
      const current = agentsRef.current.find((agent) => agent.id === agentId);
      if (current?.status === "exited") recoverExitedAgent(agentId);
    },
    [activateAgentProject, activateDeferredAgent, applyGroupOp, recoverExitedAgent]
  );

  useEffect(() => {
    selectAgentRef.current = requestSelectAgent;
  }, [requestSelectAgent]);

  useEffect(() => {
    const agentId = runtimeFlags?.open_agent_id;
    if (!agentId || openedInitialAgentRef.current === agentId) return;
    if (!agents.some((agent) => agent.id === agentId)) return;
    openedInitialAgentRef.current = agentId;
    requestSelectAgent(agentId);
  }, [agents, requestSelectAgent, runtimeFlags]);

  // Selecting a project only marks it active (so the + button targets it and the
  // Docs panel scans its folder). It no longer auto-opens the project's first
  // session — sessions open only when a session row is clicked. The sidebar
  // toggles expand/collapse separately.
  const selectProject = useCallback((projectId: string) => {
    setWorkspaceMode("sessions");
    setActiveProjectId(projectId);
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, lastOpenedAt: Date.now() } : project
      )
    );
  }, []);


  const openAsTab = useCallback(
    (agentId: string) => {
      if (detachedAgentIdsRef.current.has(agentId)) return;
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
      if (detachedAgentIdsRef.current.has(agentId)) return;
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

  const closeTab = useCallback((path: Path, agentId: string) => {
    if (isDocTabId(agentId) || isGitHistoryTabId(agentId)) {
      // Doc and git-history tabs are simply discarded (no detached solo group,
      // no reopen history in v1).
      if (isBrowserTabId(agentId)) {
        const browserId = parseBrowserTabId(agentId);
        documentOwnerByTabRef.current.delete(agentId);
        if (browserId && isElectronRuntime()) {
          // A browser component can be transiently unmounted while panes are
          // moved or React reconciles the layout. Native browser lifetime must
          // therefore follow an explicit tab close, not component unmount.
          void invoke("document_browser_close", { browserId }).catch(() => {});
        }
      }
      const next = groupOps.closeDocTab(
        {
          groups: groupsRef.current,
          activeGroupId: activeGroupIdRef.current,
          activePath: activePathRef.current,
        },
        path,
        agentId
      );
      commitGroupState(next);
      return;
    }
    const result = groupOps.closeTabWithHistory(
      {
        groups: groupsRef.current,
        activeGroupId: activeGroupIdRef.current,
        activePath: activePathRef.current,
      },
      path,
      agentId,
      agentsRef.current.find((agent) => agent.id === agentId)?.projectId
    );
    if (!result.closed) return;
    recentlyClosedTabsRef.current = [
      ...recentlyClosedTabsRef.current.slice(-(MAX_RECENTLY_CLOSED_TABS - 1)),
      result.closed,
    ];
    commitGroupState(result.state);
  }, [commitGroupState]);

  // Tab context-menu batch closers. Compute the target tab ids from the leaf
  // up front (so shifting indices don't matter), skip pinned tabs, then close
  // each. Closing detaches the session to its own group (it is not killed).
  const closeTabsInLeaf = useCallback(
    (path: Path, keep: (agentId: string, index: number) => boolean) => {
      const group = groupsRef.current.find(
        (g) => g.id === activeGroupIdRef.current
      );
      const leaf = group ? getAt(group.layout, path) : null;
      if (!leaf || leaf.type !== "leaf") return;
      const pinnedIds = new Set(
        agentsRef.current.filter((a) => a.pinned).map((a) => a.id)
      );
      const toClose = leaf.tabs.filter(
        (id, index) => !keep(id, index) && !pinnedIds.has(id)
      );
      for (const id of toClose) closeTabRef.current?.(path, id);
    },
    []
  );

  const closeOtherTabs = useCallback(
    (path: Path, agentId: string) =>
      closeTabsInLeaf(path, (id) => id === agentId),
    [closeTabsInLeaf]
  );

  const closeTabsToRight = useCallback(
    (path: Path, agentId: string) => {
      const group = groupsRef.current.find(
        (g) => g.id === activeGroupIdRef.current
      );
      const leaf = group ? getAt(group.layout, path) : null;
      if (!leaf || leaf.type !== "leaf") return;
      const anchor = leaf.tabs.indexOf(agentId);
      if (anchor < 0) return;
      closeTabsInLeaf(path, (_id, index) => index <= anchor);
    },
    [closeTabsInLeaf]
  );

  const setAgentPinned = useCallback((agentId: string, pinned: boolean) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId ? { ...a, pinned: pinned || undefined } : a
      )
    );
  }, []);

  const setAgentTabColor = useCallback(
    (agentId: string, color: string | null) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, tabColor: color || undefined } : a
        )
      );
    },
    []
  );

  const reopenClosedTab = useCallback(() => {
    while (recentlyClosedTabsRef.current.length > 0) {
      const closed = recentlyClosedTabsRef.current.pop()!;
      if (!agentsRef.current.some((agent) => agent.id === closed.agentId)) {
        continue;
      }
      const result = groupOps.reopenClosedTab(
        {
          groups: groupsRef.current,
          activeGroupId: activeGroupIdRef.current,
          activePath: activePathRef.current,
        },
        closed
      );
      if (!result.restored) continue;
      commitGroupState(result.state);
      activateAgentProject(closed.agentId);
      return;
    }
  }, [activateAgentProject, commitGroupState]);

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
      activateDeferredAgent(agentId);
      acknowledgeAgentCompletion(agentId);
      activateAgentProject(agentId);
      applyGroupOp((s) => groupOps.setActiveTabInPane(s, path, agentId));
    },
    [acknowledgeAgentCompletion, activateAgentProject, activateDeferredAgent, applyGroupOp]
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
    const machineKey = payload.sshHostId
      ? `ssh:${payload.sshHostId}`
      : "local";
    const validFolder = projectFoldersRef.current.find(
      (folder) =>
        folder.id === payload.projectFolderId &&
        folder.machineKey === machineKey
    );
    const { project, agent } = buildNewProjectWithFirstAgent({
      ...payload,
      projectFolderId: validFolder?.id,
    });
    const addProject = () => {
      setProjects((prev) => [project, ...prev]);
      setAgents((prev) => [...prev, agent]);
      setActiveProjectId(project.id);
      applyGroupOp((state) =>
        groupOps.addNewAgent(state, agent.id, project.id)
      );
    };

    if (!isElectronRuntime()) {
      addProject();
      return;
    }

    // A project immediately creates a live first session, so claim it for this
    // peer window before TerminalArea can spawn the PTY.
    void invoke<{ claimed: boolean }>("claim_agent_for_window", {
      agentId: agent.id,
    })
      .then(({ claimed }) => {
        if (!claimed) {
          pushToast(
            "",
            project.name,
            text("새 프로젝트의 첫 세션 소유권을 확보하지 못했습니다.", "Could not claim the first session for the new project.")
          );
          return;
        }
        setOwnedAgentIds((current) => {
          const next = new Set(current).add(agent.id);
          ownedAgentIdsRef.current = next;
          return next;
        });
        addProject();
      })
      .catch((error) => {
        pushToast(
          "",
          project.name,
          text(`새 프로젝트를 만들 수 없습니다: ${String(error)}`, `Could not create the new project: ${String(error)}`)
        );
      });
  }, [
    applyGroupOp,
    pushToast,
    text,
  ]);

  const createProjectFolder = useCallback((machineKey: string, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    setProjectFolders((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: normalizedName,
        machineKey,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const renameProjectFolder = useCallback((id: string, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    setProjectFolders((current) =>
      current.map((folder) =>
        folder.id === id ? { ...folder, name: normalizedName } : folder
      )
    );
  }, []);

  const removeProjectFolder = useCallback((id: string) => {
    const folder = projectFoldersRef.current.find((item) => item.id === id);
    if (!folder) return;
    const childCount = projectsRef.current.filter(
      (project) => project.projectFolderId === id
    ).length;
    const childLine = childCount
      ? text(`\n포함된 프로젝트 ${childCount}개는 미분류로 이동합니다.`, `\n${childCount} contained projects will be moved to Uncategorized.`)
      : "";
    if (!window.confirm(text(`"${folder.name}" 폴더를 삭제할까요?${childLine}`, `Delete the “${folder.name}” folder?${childLine}`))) {
      return;
    }
    removedProjectFolderIdsRef.current.add(id);
    setProjectFolders((current) => current.filter((item) => item.id !== id));
    setProjects((current) => unassignProjectFolder(current, id));
  }, [text]);

  const reorderProjectFolder = useCallback(
    (draggedId: string, targetId: string, before: boolean) => {
      setProjectFolders((current) =>
        reorderProjectFolders(current, draggedId, targetId, before)
      );
    },
    []
  );

  const moveProjectToFolder = useCallback(
    (
      projectId: string,
      projectFolderId: string | null,
      targetProjectId?: string,
      before = false
    ) => {
      setProjects((current) =>
        moveProjectToFolderInCatalog(
          current,
          projectFoldersRef.current,
          projectId,
          projectFolderId,
          targetProjectId,
          before
        )
      );
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
      const foreignMembers = members.filter((agent) =>
        detachedAgentIdsRef.current.has(agent.id)
      );
      if (foreignMembers.length > 0) {
        window.alert(
          text(`다른 작업창에서 사용 중인 세션 ${foreignMembers.length}개가 있습니다. 해당 창에서 세션을 닫거나 비활성화한 뒤 프로젝트를 삭제해 주세요.`, `${foreignMembers.length} sessions are in use in another window. Close or deactivate them there before deleting the project.`)
        );
        return;
      }
      const sessionLine =
        members.length > 0
          ? text(`\n세션 ${members.length}개도 함께 삭제됩니다.`, `\n${members.length} sessions will also be deleted.`)
          : "";
      const ok = window.confirm(
        text(`"${project.name}" 프로젝트를 삭제할까요?${sessionLine}\n이 동작은 되돌릴 수 없습니다.`, `Delete the “${project.name}” project?${sessionLine}\nThis action cannot be undone.`)
      );
      if (!ok) return;

      for (const a of members) {
        await invoke(
          isElectronRuntime() ? "terminal_session_action" : "kill_pty",
          isElectronRuntime()
            ? { id: a.id, action: "close" }
            : { id: a.id }
        ).catch(() => {});
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
      // Also prune this project's doc and git-history tabs from every layout.
      applyGroupOp((s) => {
        let state = s;
        for (const group of s.groups) {
          for (const tabId of collectAgentIds(group.layout)) {
            if (
              (isDocTabId(tabId) &&
                parseDocTabId(tabId)?.projectId === projectId) ||
              (isGitHistoryTabId(tabId) &&
                parseGitHistoryTabId(tabId)?.projectId === projectId)
            ) {
              state = groupOps.removeAgentFromLayout(state, tabId);
            }
          }
        }
        return state;
      });
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (activeProjectIdRef.current === projectId) {
        setActiveProjectId(null);
        setActiveGroupId(null);
        setActivePath(null);
      }
    },
    [applyGroupOp, text]
  );

  const createAgent = useCallback(
    async (
      payload: NewAgentPayload,
      options: { projectId?: string; agentId?: string } = {}
    ) => {
      const project = projectsRef.current.find(
        (candidate) => candidate.id === (options.projectId ?? activeProjectIdRef.current)
      );
      if (!project) {
        return { created: false, error: text("세션을 생성할 프로젝트를 찾을 수 없습니다.", "Could not find a project for the new session.") };
      }
      const id = options.agentId ?? crypto.randomUUID();
      const tool = toolForId(payload.aiToolId);
      const hasExplicitWorkerSettings = Object.prototype.hasOwnProperty.call(
        payload,
        "workerSettings"
      );
      const addAgent = () => {
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
            workerSettings:
              tool.id === "codex"
                ? hasExplicitWorkerSettings
                  ? normalizeSessionWorkerSettings(payload.workerSettings)
                  : defaultSessionWorkerSettings(tool.id)
                : undefined,
            status: "starting",
            runtimeStatus: "starting",
            createdAt: Date.now(),
            sshHostId: project.sshHostId,
            remoteFolder: project.remoteFolder,
          },
        ]);
        applyGroupOp((s) => groupOps.addNewAgent(s, id, project.id));
      };
      if (!isElectronRuntime()) {
        addAgent();
        return { created: true, id };
      }
      try {
        const { claimed } = await invoke<{ claimed: boolean }>("claim_agent_for_window", {
          agentId: id,
        });
        if (!claimed) {
          const error = text("새 세션 소유권을 확보하지 못했습니다.", "Could not claim the new session.");
          pushToast("", project.name, error);
          return { created: false, error };
        }
        setOwnedAgentIds((current) => {
          const next = new Set(current).add(id);
          ownedAgentIdsRef.current = next;
          return next;
        });
        addAgent();
        return { created: true, id };
      } catch (reason) {
        const error = text(`새 세션을 만들 수 없습니다: ${String(reason)}`, `Could not create the new session: ${String(reason)}`);
        pushToast("", project.name, error);
        return { created: false, error };
      }
    },
    [applyGroupOp, pushToast, text]
  );

  const renameAgent = useCallback((id: string, name: string) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, name } : agent))
    );
  }, []);

  // ---- Context menu

  const onSidebarContextMenu = useCallback(
    (agentId: string, x: number, y: number) => {
      dismissTransientMenus();
      setContextMenu({ agentId, x, y });
    },
    [dismissTransientMenus]
  );

  const onSidebarProjectContextMenu = useCallback(
    (projectId: string, x: number, y: number) => {
      dismissTransientMenus();
      setProjectContextMenu({ projectId, x, y });
    },
    [dismissTransientMenus]
  );

  const onSidebarProjectFolderContextMenu = useCallback(
    (projectFolderId: string, x: number, y: number) => {
      dismissTransientMenus();
      setProjectFolderContextMenu({ projectFolderId, x, y });
    },
    [dismissTransientMenus]
  );

  const onPaneTabContextMenu = useCallback(
    (path: Path, agentId: string, x: number, y: number) => {
      dismissTransientMenus();
      setTabContextMenu({ path, agentId, x, y });
    },
    [dismissTransientMenus]
  );

  const openNewSessionModal = useCallback(
    (projectId?: string) => {
      // Context-menu backdrops cover the entire window. Dismiss every
      // transient menu first so a stale transparent backdrop cannot intercept
      // the new-session form after a session was deleted.
      dismissTransientMenus();
      if (projectId) selectProject(projectId);
      setShowModal(true);
    },
    [dismissTransientMenus, selectProject]
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
        pushToast(agentId, targetAgent.name, text("저장된 세션 ID가 없습니다.", "There is no saved session ID."));
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
        text(`그룹 세션 ${pinCount}개를 고정했습니다.`, `Pinned ${pinCount} group sessions.`)
      );
    },
    [agents, groups, pushToast, text]
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
      pushToast(agentId, targetAgent.name, text("그룹 세션 고정을 해제했습니다.", "Unpinned the group sessions."));
    },
    [agents, groups, pushToast, text]
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
        pushToast(agentId, agent.name, text("폴더 정보가 없어 재등록할 수 없습니다.", "The session cannot be relinked because folder information is missing."));
        return;
      }
      invoke<string | null>("relink_cli_session", {
        aiToolId: agent.aiToolId,
        folder,
        agentName: agent.name,
      })
        .then((sessionId) => {
          if (!sessionId) {
            pushToast(agentId, agent.name, text("찾을 수 있는 최근 세션이 없습니다.", "No recent session could be found."));
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
            text(`세션 재등록: ${sessionId.slice(0, 8)} (다음 실행부터 적용)`, `Session relinked: ${sessionId.slice(0, 8)} (applies on next launch)`)
          );
        })
        .catch((err) => {
          pushToast(agentId, agent.name, text(`재등록 실패: ${String(err)}`, `Relink failed: ${String(err)}`));
        });
    },
    [pushToast, text]
  );

  const onContextAction = useCallback(
    (
      action: SessionContextAction
    ) => {
      if (!contextMenu) return;
      const id = contextMenu.agentId;
      if (action === "delete") {
        void removeAgent(id);
        return;
      }
      dismissTransientMenus();
      if (action === "open") requestSelectAgent(id);
      else if (action === "open-new-window") openNewAppWindow(id);
      else if (action === "tab") openAsTab(id);
      else if (action === "split-h") splitWith(id, "h");
      else if (action === "split-v") splitWith(id, "v");
      else if (action === "rename") setRenameSessionId(id);
      else if (action === "pin-session") pinContextGroupSessions(id);
      else if (action === "clear-session-pin") clearContextGroupSessionPins(id);
      else if (action === "deactivate") {
        void deactivateAgent(id);
      } else if (action === "relink") {
        relinkSession(id);
      } else if (action === "properties") {
        setPropertiesAgentId(id);
      }
    },
    [
      contextMenu,
      requestSelectAgent,
      openNewAppWindow,
      openAsTab,
      splitWith,
      pinContextGroupSessions,
      clearContextGroupSessionPins,
      deactivateAgent,
      dismissTransientMenus,
      removeAgent,
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

  const handleFilesResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      document.body.classList.add("files-resizing");

      const handleMove = (moveEvent: PointerEvent) => {
        setFilesWidth(clampFilesWidth(window.innerWidth - moveEvent.clientX));
      };
      const handleEnd = () => {
        document.body.classList.remove("files-resizing");
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

  // Open a project file as a document tab in the main workspace.
  // Re-clicking an already-open file focuses its existing tab: first in the
  // active Screen, otherwise openAsTab moves it here from any other group.
  const openDocTab = useCallback(
    (projectId: string, relativePath: string, ownerAgentId?: string | null) => {
      setWorkspaceMode("sessions");
      const docId = makeDocTabId(projectId, relativePath);
      if (ownerAgentId) documentOwnerByTabRef.current.set(docId, ownerAgentId);
      applyGroupOp((s) => {
        const group = s.groups.find((g) => g.id === s.activeGroupId);
        // Already open in the active screen → just focus it.
        if (group && s.activePath) {
          const existingPath = findLeafPath(group.layout, docId);
          if (existingPath) {
            const layout = setLeafActiveTab(group.layout, existingPath, docId);
            return {
              groups: updateGroup(s.groups, group.id, layout),
              activeGroupId: s.activeGroupId,
              activePath: existingPath,
            };
          }
        }
        // openAsTab appends to the active leaf, or — when no screen is open —
        // creates a new solo group for the doc, so a document can open even
        // before any terminal session exists.
        return groupOps.openAsTab(s, docId, projectId);
      });
    },
    [applyGroupOp]
  );

  const openGitHistoryTab = useCallback(
    (
      projectId: string,
      relativePath?: string | null,
      repositoryPath?: string | null
    ) => {
      setWorkspaceMode("sessions");
      const gitId = makeGitHistoryTabId(
        projectId,
        relativePath ?? null,
        repositoryPath ?? null
      );
      applyGroupOp((s) => {
        const group = s.groups.find((g) => g.id === s.activeGroupId);
        // Already open in the active screen → just focus it.
        if (group && s.activePath) {
          const existingPath = findLeafPath(group.layout, gitId);
          if (existingPath) {
            const layout = setLeafActiveTab(group.layout, existingPath, gitId);
            return {
              groups: updateGroup(s.groups, group.id, layout),
              activeGroupId: s.activeGroupId,
              activePath: existingPath,
            };
          }
        }
        return groupOps.openAsTab(s, gitId, projectId);
      });
    },
    [applyGroupOp]
  );

  const showBrowserTab = useCallback(
    (browserId: string, ownerAgentId: string | null, preferredPath?: Path) => {
      const tabId = makeBrowserTabId(browserId);
      if (ownerAgentId) {
        documentOwnerByTabRef.current.set(tabId, ownerAgentId);
      }
      applyGroupOp((state) => {
        // Preserve a browser tab that the user deliberately moved to another
        // split; subsequent MCP actions should focus it, not move it back.
        for (const group of state.groups) {
          const existingPath = findLeafPath(group.layout, tabId);
          if (!existingPath) continue;
          return {
            groups: updateGroup(
              state.groups,
              group.id,
              setLeafActiveTab(group.layout, existingPath, tabId)
            ),
            activeGroupId: group.id,
            activePath: existingPath,
          };
        }

        let targetGroup = state.groups.find((group) => group.id === state.activeGroupId) ?? null;
        let targetPath = preferredPath ?? state.activePath;
        if (ownerAgentId) {
          const ownerGroup = state.groups.find((group) =>
            findLeafPath(group.layout, ownerAgentId) !== null
          );
          if (ownerGroup) {
            targetGroup = ownerGroup;
            targetPath = findLeafPath(ownerGroup.layout, ownerAgentId);
          }
        }
        if (!targetGroup || !targetPath || !getAt(targetGroup.layout, targetPath)) {
          return state;
        }
        const projectId = ownerAgentId
          ? agentsRef.current.find((agent) => agent.id === ownerAgentId)?.projectId
          : activeProjectIdRef.current ?? undefined;
        return groupOps.openAsTab(
          {
            ...state,
            activeGroupId: targetGroup.id,
            activePath: targetPath,
          },
          tabId,
          projectId
        );
      });
    },
    [applyGroupOp]
  );

  const applyBrowserCatalog = useCallback(
    (catalog: DocumentBrowserCatalog) => {
      const tabs = Array.isArray(catalog.tabs) ? catalog.tabs : [];
      setBrowserCatalog(tabs);
      setBrowserHubSelectedId((current) =>
        current && tabs.some((browser) => browser.browserId === current)
          ? current
          : tabs[0]?.browserId ?? null
      );
      const closedBrowserId = catalog.closedBrowserId?.trim();
      if (closedBrowserId) {
        const tabIds = layoutTabIdsForClosedBrowser(
          closedBrowserId,
          catalog.closedSourceTabId
        );
        for (const tabId of tabIds) documentOwnerByTabRef.current.delete(tabId);
        applyGroupOp((state) =>
          tabIds.reduce(
            (next, tabId) => groupOps.removeAgentFromLayout(next, tabId),
            state
          )
        );
      }
    },
    [applyGroupOp]
  );

  useEffect(() => {
    if (!isElectronRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const remove = await listen<DocumentBrowserCatalog>(
          "document-browser:catalog-updated",
          (event) => {
            if (!disposed) applyBrowserCatalog(event.payload);
          }
        );
        if (disposed) {
          remove();
          return;
        }
        unlisten = remove;
        const catalog = await invoke<DocumentBrowserCatalog>("document_browser_list", {});
        if (!disposed) applyBrowserCatalog(catalog);
      } catch {
        // Browser integration is desktop-only and may still be starting while
        // the renderer mounts. Later catalog events will populate the hub.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [applyBrowserCatalog]);

  const createBrowserFromHub = useCallback(async () => {
    const result = await invoke<{ browserId: string }>("document_browser_open", {
      folder: "",
      relativePath: "",
      initialUrl: "https://www.google.com/",
    });
    setBrowserHubSelectedId(result.browserId);
    const catalog = await invoke<DocumentBrowserCatalog>("document_browser_list", {});
    applyBrowserCatalog(catalog);
  }, [applyBrowserCatalog]);

  const closeBrowserFromHub = useCallback(async (browserId: string) => {
    await invoke("document_browser_hub_close", { browserId });
  }, []);

  const openBrowserTab = useCallback(
    async (path: Path, ownerAgentId: string | null) => {
      if (!isElectronRuntime()) return;
      try {
        const result = await invoke<{ browserId: string }>("document_browser_open", {
          folder: "",
          relativePath: "",
          initialUrl: "https://www.google.com/",
          ...(ownerAgentId ? { agentId: ownerAgentId } : {}),
        });
        showBrowserTab(result.browserId, ownerAgentId, path);
      } catch (error) {
        pushToast("", text("브라우저 열기 실패", "Could not open browser"), String(error));
      }
    },
    [pushToast, showBrowserTab, text]
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    listen<{ browserId: string; agentId?: string | null }>(
      "document-browser:show-tab",
      (event) => {
        const browserId = event.payload?.browserId?.trim();
        if (!browserId) return;
        showBrowserTab(browserId, event.payload.agentId?.trim() || null);
      }
    ).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [showBrowserTab]);

  const handleOpenMarkdownPath = useCallback(
    async (agentId: string, path: string, external = false) => {
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
        // Ctrl/Cmd+click → open with the OS default app (browser for .html)
        // instead of the in-app doc tab.
        if (external) {
          const fullPath = isAbsoluteFsPath(relativePath)
            ? relativePath
            : joinFsPath(project.folder, relativePath);
          await invoke("open_local_path", { path: fullPath });
          return;
        }
        // resolve_markdown_path returns an absolute path only for docs living
        // outside the project root — those still open externally.
        if (isAbsoluteFsPath(relativePath)) {
          const inside = relativeIfInside(project.folder, relativePath);
          if (inside) {
            openDocTab(project.id, inside, agentId);
          } else {
            await invoke("open_local_path", { path: relativePath });
          }
          return;
        }
        openDocTab(project.id, relativePath, agentId);
      } catch {
        pushToast(agentId, agent.name, text("문서 파일을 열 수 없습니다.", "Could not open the document file."));
      }
    },
    [openDocTab, pushToast, text]
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
        pushToast(agentId, agent.name, text(`폴더를 열 수 없습니다: ${String(error)}`, `Could not open the folder: ${String(error)}`));
      }
    },
    [pushToast, text]
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
          const inside = relativeIfInside(project.folder, resolved.path);
          if (inside) {
            openDocTab(project.id, inside, agentId);
          } else {
            await invoke("open_local_path", { path: resolved.path });
          }
          return;
        }

        if (resolved.kind === "markdown") {
          const relativePath = await invoke<string>("resolve_markdown_path", {
            folder: project.folder,
            path: resolved.path,
          });
          if (isAbsoluteFsPath(relativePath)) {
            const inside = relativeIfInside(project.folder, relativePath);
            if (inside) openDocTab(project.id, inside, agentId);
            else await invoke("open_local_path", { path: relativePath });
          } else {
            openDocTab(project.id, relativePath, agentId);
          }
          return;
        }

        if (resolved.kind === "folder") {
          await invoke("open_local_path", { path: resolved.path });
          return;
        }

        await invoke("reveal_local_path", { path: resolved.path });
      } catch (error) {
        pushToast(agentId, agent.name, text(`경로를 열 수 없습니다: ${String(error)}`, `Could not open the path: ${String(error)}`));
      }
    },
    [openDocTab, pushToast, text]
  );

  // Explicit Remote activation can start a session without making it visible.
  // The terminal renders into its (detached) element at
  // a default size; when the user later opens it, PaneSlot reattaches the same
  // entry and resizes (it skips re-spawning because entry.spawned is already set).
  const spawnAgentInBackground = useCallback(
    async (
      agentId: string,
      options: { recovering?: boolean; verifyActive?: boolean } = {}
    ) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      if (!agent) {
        return { ok: false, error: text("세션을 찾을 수 없습니다.", "Session not found."), statusCode: 404 as const };
      }
      let entry = termsRef.current.get(agentId);
      if (entry?.spawned && entry.spawnPromise) {
        try {
          const result = await entry.spawnPromise;
          return result.cancelled
            ? { ok: false, error: text("세션 활성화가 취소되었습니다.", "Session activation was cancelled."), statusCode: 409 as const }
            : { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: text(`세션을 활성화하지 못했습니다: ${String(error)}`, `Could not activate the session: ${String(error)}`),
            statusCode: 500 as const,
          };
        }
      }
      if (entry?.spawned && !options.verifyActive) return { ok: true }; // already running
      if (!entry) {
        entry = createEntry(
          agentId,
          handleOpenMarkdownPath,
          handleOpenImagePath,
          handleOpenFolderPath,
          handleOpenTerminalPath,
          {
            normalizeSshCursorKeys: !!agent.sshHostId,
          }
        );
        termsRef.current.set(agentId, entry);
      }
      if (!entry.opened && !isElectronRuntime()) {
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
      clearAgentStartupReadyTimer(agentId);
      const initializingStatus: InitializingRuntimeStatus = options.recovering
        ? "recovering"
        : "starting";
      setAgentStatus(agentId, initializingStatus);
      const timer = scheduleStartupReadyFallback({
        expectedStatus: initializingStatus,
        getRuntimeStatus: () =>
          agentsRef.current.find((candidate) => candidate.id === agentId)
            ?.runtimeStatus,
        onReady: () => {
          startupReadyTimersRef.current.delete(agentId);
          console.warn(
            `[startup] SessionStart hook timeout; allowing input for ${agentId}`
          );
          setAgentStatus(agentId, "running");
        },
      });
      startupReadyTimersRef.current.set(agentId, timer);
      try {
        entry.spawnPromise = (async () => {
          const group = groupsRef.current.find((g) =>
            collectAgentIds(g.layout).has(agentId)
          );
          const { initCommand, ssh, cwd } = await buildSpawnArgs(
            agent,
            group?.sessionPins ?? null,
            setAgentSessionId
          );
          return invoke<SpawnTerminalResult>("spawn_pty", {
            id: agentId,
            shell: null,
            cwd,
            initCommand,
            aiToolId: agent.aiToolId,
            ssh,
            cols: 120,
            rows: 30,
          });
        })();
        const pendingSpawn = entry.spawnPromise;
        const result = await pendingSpawn;
        if (entry.spawnPromise === pendingSpawn) entry.spawnPromise = null;
        if (isElectronRuntime()) {
          entry.restoreScrollbackOnAttach = !result.reattached;
          if (result.cancelled) {
            entry.spawned = false;
            clearAgentStartupReadyTimer(agentId);
            setAgentStatus(agentId, "idle");
            return {
              ok: false,
              error: text("세션 활성화가 취소되었습니다.", "Session activation was cancelled."),
              statusCode: 409 as const,
            };
          }
        }
        return { ok: true };
      } catch (err) {
        clearAgentStartupReadyTimer(agentId);
        entry.spawnPromise = null;
        entry.term.write(`\r\n\x1b[31mspawn failed: ${err}\x1b[0m\r\n`);
        setAgentStatus(agentId, "exited");
        return {
          ok: false,
          error: text(`세션을 활성화하지 못했습니다: ${String(err)}`, `Could not activate the session: ${String(err)}`),
          statusCode: 500 as const,
        };
      }
    },
    [
      handleOpenMarkdownPath,
      handleOpenImagePath,
      handleOpenFolderPath,
      handleOpenTerminalPath,
      clearAgentStartupReadyTimer,
      setAgentStatus,
      setAgentSessionId,
      text,
    ]
  );

  // Remote session management is handled only by the coordinator renderer so
  // multiple workspace windows cannot activate, create, or rename a session twice.
  useEffect(() => {
    if (!remoteEnabled || !isCoordinatorWindow) return;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const track = (unlisten: () => void) => {
      if (cancelled) unlisten();
      else unlisteners.push(unlisten);
    };

    listen<{ requestId: string; id: string }>("remote:restart-session", (event) => {
      if (cancelled) return;
      const payload = event.payload;
      if (!payload.requestId || !payload.id) return;
      const complete = (result: {
        ok: boolean;
        error?: string;
        statusCode?: 400 | 404 | 409 | 500 | 503;
      }) => invoke("complete_remote_session_activation", {
        requestId: payload.requestId,
        id: payload.id,
        ...result,
      }).catch(() => false);
      if (!agentsRef.current.some((agent) => agent.id === payload.id)) {
        void complete({
          ok: false,
          error: text("세션을 찾을 수 없습니다.", "Session not found."),
          statusCode: 404,
        });
        return;
      }
      void spawnAgentInBackground(payload.id, { verifyActive: true })
        .then(complete)
        .catch((reason) => complete({
          ok: false,
          error: text(`세션 활성화 결과를 처리하지 못했습니다: ${String(reason)}`, `Could not process the session activation result: ${String(reason)}`),
          statusCode: 500,
        }));
    }).then(track);

    listen<{
      requestId: string;
      id: string;
      projectId: string;
      name: string;
      aiToolId: string;
      dangerous: boolean;
    }>("remote:create-session", (event) => {
      if (cancelled) return;
      const payload = event.payload;
      if (!payload.requestId || !payload.id) return;
      const complete = (result: {
        ok: boolean;
        error?: string;
        statusCode?: 400 | 404 | 409 | 500 | 503;
      }) => invoke("complete_remote_session_create", {
        requestId: payload.requestId,
        id: payload.id,
        ...result,
      }).catch(() => false);
      const projectExists = projectsRef.current.some(
        (project) => project.id === payload.projectId
      );
      const toolAllowed = AI_TOOLS.some(
        (tool) => tool.id === payload.aiToolId
          && (tool.id === "none" || !disabledTools.includes(tool.id))
      );
      if (!projectExists) {
        void complete({
          ok: false,
          error: text("세션을 생성할 프로젝트가 더 이상 존재하지 않습니다.", "The project for this session no longer exists."),
          statusCode: 409,
        });
        return;
      }
      if (!toolAllowed) {
        void complete({
          ok: false,
          error: text("선택한 AI 도구가 비활성화되어 있습니다.", "The selected AI tool is disabled."),
          statusCode: 409,
        });
        return;
      }
      const name = payload.name?.trim();
      if (!name) {
        void complete({ ok: false, error: text("세션 이름이 비어 있습니다.", "The session name is empty."), statusCode: 400 });
        return;
      }
      void createAgent(
        {
          name,
          aiToolId: payload.aiToolId,
          dangerous: Boolean(payload.dangerous),
        },
        { projectId: payload.projectId, agentId: payload.id }
      ).then((result) => complete(result.created
        ? { ok: true }
        : { ok: false, error: result.error, statusCode: 409 }
      )).catch((reason) => complete({
        ok: false,
        error: text(`세션 생성 결과를 처리하지 못했습니다: ${String(reason)}`, `Could not process the session creation result: ${String(reason)}`),
        statusCode: 500,
      }));
    }).then(track);

    listen<{ id: string; name: string }>("remote:rename-session", (event) => {
      if (cancelled) return;
      const id = event.payload?.id;
      const name = event.payload?.name?.trim();
      if (!id || !name || !agentsRef.current.some((agent) => agent.id === id)) return;
      renameAgent(id, name);
    }).then(track);

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [
    createAgent,
    disabledTools,
    isCoordinatorWindow,
    remoteEnabled,
    renameAgent,
    spawnAgentInBackground,
    text,
  ]);

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
        activateDeferredAgent(agentId);
        activateAgentProject(agentId);
      }
      setActivePath(path);
    },
    [activateAgentProject, activateDeferredAgent, groups]
  );

  const executeCommand = useCallback((commandId: CommandId) => {
    switch (commandId) {
      case "quick-open":
        setQuickOpen(true);
        break;
      case "attention-center":
        setAttentionOpen(true);
        break;
      case "terminal-search":
        setSearchOpen(true);
        break;
      case "new-session":
        if (activeProjectIdRef.current) openNewSessionModal();
        else setShowProjectModal(true);
        break;
      case "new-project":
        setShowProjectModal(true);
        break;
      case "close-pane": {
        const groupId = activeGroupIdRef.current;
        const path = activePathRef.current;
        const group = groupsRef.current.find((candidate) => candidate.id === groupId);
        const node = group && path ? getAt(group.layout, path) : null;
        if (node?.type === "leaf") {
          const agentId = node.tabs[node.activeIndex];
          if (agentId) closeTab(path!, agentId);
        }
        break;
      }
      case "reopen-closed-tab":
        reopenClosedTab();
        break;
      case "toggle-docs":
        setFilesOpen((open) => !open);
        break;
      case "toggle-pet":
        handleDesktopPetEnabledChange(!desktopPetEnabled);
        break;
      case "toggle-always-on-top":
        toggleAlwaysOnTop();
        break;
      case "open-new-window":
        openNewAppWindow();
        break;
      case "settings":
        setSettingsOpen(true);
        break;
    }
  }, [closeTab, desktopPetEnabled, handleDesktopPetEnabledChange, openNewAppWindow, openNewSessionModal, reopenClosedTab, toggleAlwaysOnTop]);

  useEffect(() => {
    executeCommandRef.current = executeCommand;
  }, [executeCommand]);

  const quickOpenItems = useMemo<QuickOpenItem[]>(() => {
    const projectNames = new Map(projects.map((project) => [project.id, project.name]));
    const projectItems: QuickOpenItem[] = projects.map((project) => ({
      id: `project:${project.id}`,
      kind: "project",
      title: project.name,
      subtitle: project.folder,
      searchText: `${project.folder} project`,
      projectId: project.id,
    }));
    const sessionItems: QuickOpenItem[] = agents.map((agent) => ({
      id: `session:${agent.id}`,
      kind: "session",
      title: agent.name,
      subtitle: `${projectNames.get(agent.projectId) || "Unknown project"} · ${agent.aiLabel} · ${agent.status}`,
      searchText: `${agent.folder} ${agent.aiToolId} ${agent.lastSessionId || ""}`,
      projectId: agent.projectId,
      agentId: agent.id,
    }));
    const screenItems: QuickOpenItem[] = groups.flatMap((group, index) => {
      const memberIds = [...collectAgentIds(group.layout)].filter(
        (id) => !isDocTabId(id) && !isGitHistoryTabId(id)
      );
      const memberNames = memberIds
        .map((id) => agents.find((agent) => agent.id === id)?.name)
        .filter(Boolean) as string[];
      const targetAgentId = memberIds[0];
      if (!targetAgentId) return [];
      return [{
        id: `screen:${group.id}`,
        kind: "screen" as const,
        title: `Screen ${index + 1}`,
        subtitle: memberNames.join(" + "),
        searchText: memberNames.join(" "),
        groupId: group.id,
        agentId: targetAgentId,
      }];
    });
    const documentItems: QuickOpenItem[] = quickDocuments.map((document) => ({
      id: `document:${document.projectId}:${document.relativePath}`,
      kind: "document",
      title: document.name,
      subtitle: `${document.projectName} · ${document.relativePath}`,
      searchText: `${document.projectName} ${document.relativePath}`,
      projectId: document.projectId,
      relativePath: document.relativePath,
    }));
    const commandItems: QuickOpenItem[] = COMMAND_DEFINITIONS.map((command) => ({
      id: `command:${command.id}`,
      kind: "command",
      title: language === "ko" ? command.title : command.titleEn,
      subtitle: [
        language === "ko" ? command.description : command.descriptionEn,
        commandShortcuts[command.id],
      ].filter(Boolean).join(" · "),
      searchText: command.keywords,
      commandId: command.id,
    }));
    return [...projectItems, ...sessionItems, ...screenItems, ...documentItems, ...commandItems];
  }, [agents, commandShortcuts, groups, language, projects, quickDocuments]);

  const handleQuickOpenSelect = useCallback((item: QuickOpenItem) => {
    setQuickOpen(false);
    if (item.kind === "project" && item.projectId) {
      selectProject(item.projectId);
    } else if (item.kind === "session" && item.agentId) {
      requestSelectAgent(item.agentId);
    } else if (item.kind === "screen" && item.groupId && item.agentId) {
      selectScreen(item.groupId, item.agentId);
    } else if (item.kind === "document" && item.projectId && item.relativePath) {
      setActiveProjectId(item.projectId);
      openDocTab(item.projectId, item.relativePath);
    } else if (item.kind === "command" && item.commandId) {
      executeCommand(item.commandId as CommandId);
    }
  }, [executeCommand, openDocTab, requestSelectAgent, selectProject, selectScreen]);

  const handleAttentionSelect = useCallback((item: AttentionItem) => {
    acknowledgeAttentionItem(item.id);
    setAttentionOpen(false);
    if (agentsRef.current.some((agent) => agent.id === item.agentId)) {
      requestSelectAgent(item.agentId);
    }
  }, [acknowledgeAttentionItem, requestSelectAgent]);

  const clearDeletedSessionReferences = useCallback(
    (aiToolId: string, sessionId: string) => {
      const normalizedSessionId = sessionId.toLowerCase();
      const affectedAgentIds = new Set(
        agentsRef.current
          .filter(
            (agent) =>
              agent.aiToolId === aiToolId &&
              agent.lastSessionId?.toLowerCase() === normalizedSessionId
          )
          .map((agent) => agent.id)
      );
      setAgents((current) =>
        current.map((agent) =>
          affectedAgentIds.has(agent.id)
            ? { ...agent, lastSessionId: undefined }
            : agent
        )
      );
      if (affectedAgentIds.size === 0) return;
      setGroups((current) =>
        current.map((group) => {
          if (!group.sessionPins) return group;
          const sessionPins = { ...group.sessionPins };
          let changed = false;
          for (const agentId of affectedAgentIds) {
            if (sessionPins[agentId]?.toLowerCase() !== normalizedSessionId) continue;
            delete sessionPins[agentId];
            changed = true;
          }
          return changed ? { ...group, sessionPins } : group;
        })
      );
    },
    []
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

  const browserAgentNames = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents]
  );

  // Every workspace window shows the same catalog. Sessions owned by another
  // peer stay visible but unavailable.
  const sidebarAgents = agents;
  const sidebarProjects = projects;
  const sidebarUnavailableAgentIds = useMemo(() => {
    return new Set(
      [...detachedAgentIds, ...inUseAgentIds].filter(
        (agentId) => !ownedAgentIds.has(agentId)
      )
    );
  }, [detachedAgentIds, inUseAgentIds, ownedAgentIds]);

  const renameSession = useMemo(
    () =>
      renameSessionId
        ? agents.find((agent) => agent.id === renameSessionId) ?? null
        : null,
    [agents, renameSessionId]
  );
  // Never render a full-window menu backdrop after its catalog/layout target
  // has disappeared. This is a render-time guard, so it does not depend on an
  // effect running after a delete/deactivate state transition.
  const visibleContextMenu =
    contextMenu && agents.some((agent) => agent.id === contextMenu.agentId)
      ? contextMenu
      : null;
  const visibleProjectContextMenu =
    projectContextMenu &&
    projects.some((project) => project.id === projectContextMenu.projectId)
      ? projectContextMenu
      : null;
  const visibleProjectFolderContextMenu =
    projectFolderContextMenu &&
    projectFolders.some(
      (folder) => folder.id === projectFolderContextMenu.projectFolderId
    )
      ? projectFolderContextMenu
      : null;
  const visibleTabContextMenu =
    tabContextMenu &&
    groups.some((group) =>
      collectAgentIds(group.layout).has(tabContextMenu.agentId)
    )
      ? tabContextMenu
      : null;
  const tabContextDocument = useMemo(() => {
    if (!visibleTabContextMenu) return null;
    const ref = parseDocTabId(visibleTabContextMenu.agentId);
    if (!ref) return null;
    const project = projects.find(
      (candidate) => candidate.id === ref.projectId
    );
    if (!project?.folder || project.sshHostId) return null;
    return {
      path: isAbsoluteFsPath(ref.relativePath)
        ? ref.relativePath
        : joinFsPath(project.folder, ref.relativePath),
      projectName: project.name,
    };
  }, [projects, visibleTabContextMenu]);

  // ---- Render

  return (
    <div
      className={`app app-theme-${appTheme} ${
        isElectronRuntime() && showUsageBar ? "app-with-usage-status" : ""
      } ${!sidebarOpen ? "app-sidebar-collapsed" : ""}`}
    >
      {isElectronRuntime() && (
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          filesOpen={filesOpen}
          onToggleFiles={() => setFilesOpen((open) => !open)}
          desktopPetEnabled={desktopPetEnabled}
          desktopPetAvailable
          onToggleDesktopPet={() =>
            handleDesktopPetEnabledChange(!desktopPetEnabled)
          }
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
          alwaysOnTop={alwaysOnTop}
          onToggleAlwaysOnTop={toggleAlwaysOnTop}
          onOpenNewWindow={openNewAppWindow}
          onQuickOpen={() => setQuickOpen(true)}
          quickOpenShortcut={commandShortcuts["quick-open"]}
          onOpenAttention={() => setAttentionOpen(true)}
          attentionUnreadCount={attentionUnreadCount}
        />
      )}
      <Sidebar
        projects={sidebarProjects}
        projectFolders={projectFolders}
        agents={sidebarAgents}
        groups={groups}
        activeProjectId={activeProjectId}
        activeGroupId={activeGroupId}
        activeAgentId={activeAgentId}
        inGroupAgentIds={inGroupAgentIds}
        detachedAgentIds={sidebarUnavailableAgentIds}
        unreadCompletedAgentIds={unreadCompletionAgentIds}
        dragState={dragState}
        browserHubActive={workspaceMode === "browser-hub"}
        browserCount={browserCatalog.length}
        onOpenBrowserHub={
          isElectronRuntime() ? () => setWorkspaceMode("browser-hub") : undefined
        }
        onSelectProject={selectProject}
        onSelect={requestSelectAgent}
        onSelectScreen={selectScreen}
        onRenameSession={setRenameSessionId}
        onContextMenu={onSidebarContextMenu}
        onNewProject={() => setShowProjectModal(true)}
        onNewProjectFolder={(machineKey) =>
          setProjectFolderEditor({ mode: "create", machineKey })
        }
        onNewSessionForProject={openNewSessionModal}
        onDeactivate={deactivateAgent}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMoveProject={moveProjectToFolder}
        onReorderProjectFolder={reorderProjectFolder}
        onProjectContextMenu={onSidebarProjectContextMenu}
        onProjectFolderContextMenu={onSidebarProjectFolderContextMenu}
        sessionPickerMode={false}
        detachedLabel={text("사용 중", "In use")}
      />
      {workspaceMode === "browser-hub" ? (
        <BrowserHub
          browsers={browserCatalog}
          selectedBrowserId={browserHubSelectedId}
          agentNames={browserAgentNames}
          onSelectBrowser={setBrowserHubSelectedId}
          onCreateBrowser={createBrowserFromHub}
          onCloseBrowser={closeBrowserFromHub}
        />
      ) : (
        <TerminalArea
          agents={agents}
          projects={projects}
          theme={appTheme}
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
          onDropToEmpty={requestSelectAgent}
          onTabContextMenu={onPaneTabContextMenu}
          chatModeAgents={chatModeAgents}
          onToggleChat={toggleChatMode}
          getDocumentOwner={getDocumentOwner}
          onOpenBrowser={openBrowserTab}
          onOpenMarkdownPath={handleOpenMarkdownPath}
          onOpenImagePath={handleOpenImagePath}
          onOpenFolderPath={handleOpenFolderPath}
          onOpenTerminalPath={handleOpenTerminalPath}
        />
      )}
      {filesOpen && (
        <aside className="files-shell" style={{ width: filesWidth + 7 }}>
          <div
            className="files-resizer"
            onPointerDown={handleFilesResizeStart}
            title="Resize file tree"
          />
          <FileTreePanel
            projects={projects}
            activeProject={activeProject}
            width={filesWidth}
            theme={appTheme}
            onOpenFile={openDocTab}
            onOpenGitHistory={openGitHistoryTab}
            onClose={() => setFilesOpen(false)}
          />
        </aside>
      )}
      {isElectronRuntime() && showUsageBar && (
        <UsageStatusBar
          agents={agents}
          projects={projects}
          onSelectProject={selectProject}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          theme={appTheme}
          onThemeChange={handleThemeChange}
          desktopPetEnabled={desktopPetEnabled}
          desktopPetAvailable
          onDesktopPetEnabledChange={handleDesktopPetEnabledChange}
          onResetDesktopPetPosition={resetDesktopPetPosition}
          commandShortcuts={commandShortcuts}
          onCommandShortcutsChange={setCommandShortcuts}
          disabledTools={disabledTools}
          onToggleTool={handleToggleTool}
          showUsageBar={showUsageBar}
          onShowUsageBarChange={handleShowUsageBarChange}
          buildVariant={runtimeFlags?.build_variant ?? "standard"}
          updateProvider={runtimeFlags?.update_provider ?? "local-developer"}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingDeletion && (
        <DeleteSessionModal name={pendingDeletion.name}
          onConfirm={confirmDeletion} onCancel={cancelDeletion} />
      )}
      {showProjectModal && (
        <NewProjectModal
          defaultName={`Project ${projects.length + 1}`}
          disabledTools={disabledTools}
          projectFolders={projectFolders}
          onCancel={() => setShowProjectModal(false)}
          onCreate={(payload) => {
            setShowProjectModal(false);
            createProject(payload);
          }}
        />
      )}
      {projectFolderEditor &&
        (() => {
          const folder =
            projectFolderEditor.mode === "rename"
              ? projectFolders.find(
                  (item) =>
                    item.id === projectFolderEditor.projectFolderId
                ) ?? null
              : null;
          if (projectFolderEditor.mode === "rename" && !folder) return null;
          const machineKey =
            projectFolderEditor.mode === "create"
              ? projectFolderEditor.machineKey
              : folder!.machineKey;
          const machineLabel =
            machineKey === "local"
              ? "This PC"
              : loadSshHosts().find(
                  (host) => `ssh:${host.id}` === machineKey
                )?.label ?? machineKey.replace(/^ssh:/, "SSH · ");
          return (
            <ProjectFolderModal
              title={
                projectFolderEditor.mode === "create"
                  ? text("새 프로젝트 폴더", "New project folder")
                  : text("프로젝트 폴더 이름 변경", "Rename project folder")
              }
              defaultName={folder?.name}
              machineLabel={machineLabel}
              onCancel={() => setProjectFolderEditor(null)}
              onSave={(name) => {
                if (projectFolderEditor.mode === "create") {
                  createProjectFolder(machineKey, name);
                } else {
                  renameProjectFolder(projectFolderEditor.projectFolderId, name);
                }
                setProjectFolderEditor(null);
              }}
            />
          );
        })()}
      {showModal && (
        <NewAgentModal
          project={activeProject}
          defaultName={`Session ${projectAgents.length + 1}`}
          disabledTools={disabledTools}
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
        onSelect={requestSelectAgent}
        onDismiss={dismissToast}
      />
      {quickOpen && (
        <QuickOpen
          items={quickOpenItems}
          loadingDocuments={quickDocumentsLoading}
          onSelect={handleQuickOpenSelect}
          onClose={() => setQuickOpen(false)}
        />
      )}
      {attentionOpen && (
        <AttentionCenter
          items={attentionItems}
          onSelect={handleAttentionSelect}
          onMarkAllRead={acknowledgeAllAttention}
          onClearRead={clearReadAttention}
          onClose={() => setAttentionOpen(false)}
        />
      )}
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
              onUpdateAgent={(id, patch) =>
                setAgents((prev) =>
                  prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
                )
              }
              onSessionDeleted={clearDeletedSessionReferences}
              disabledTools={disabledTools}
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
              onSessionDeleted={clearDeletedSessionReferences}
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
      {visibleContextMenu && (
        <ContextMenu
          state={visibleContextMenu}
          hasActive={!!activeGroupLayout && !!activePath}
          canPlaceInActive={canPlaceContextAgentInActiveGroup}
          isSessionLocked={!!contextGroup?.sessionLocked}
          canPinSession={canPinContextGroupSession}
          canDeactivate={(() => {
            const agent = agents.find(
              (candidate) => candidate.id === visibleContextMenu.agentId
            );
            return agent ? isAgentRuntimeActive(agent) : false;
          })()}
          onClose={dismissTransientMenus}
          onAction={onContextAction}
        />
      )}
      {visibleProjectContextMenu && (
        <ProjectContextMenu
          state={visibleProjectContextMenu}
          onClose={dismissTransientMenus}
          onAction={(action) => {
            const projectId = visibleProjectContextMenu.projectId;
            dismissTransientMenus();
            if (action === "rename") {
              setRenameProjectId(projectId);
            } else if (action === "delete") {
              void removeProject(projectId);
            } else if (action === "properties") {
              setPropertiesProjectId(projectId);
            }
          }}
        />
      )}
      {visibleProjectFolderContextMenu && (
        <ProjectFolderContextMenu
          state={visibleProjectFolderContextMenu}
          onClose={dismissTransientMenus}
          onAction={(action) => {
            const projectFolderId =
              visibleProjectFolderContextMenu.projectFolderId;
            dismissTransientMenus();
            if (action === "rename") {
              setProjectFolderEditor({
                mode: "rename",
                projectFolderId,
              });
            } else {
              removeProjectFolder(projectFolderId);
            }
          }}
        />
      )}
      {visibleTabContextMenu && (
        <TabContextMenu
          state={visibleTabContextMenu}
          pinned={
            !!agents.find((a) => a.id === visibleTabContextMenu.agentId)?.pinned
          }
          tabColor={
            agents.find((a) => a.id === visibleTabContextMenu.agentId)?.tabColor ?? null
          }
          canReopen={recentlyClosedTabsRef.current.length > 0}
          onDismiss={dismissTransientMenus}
          onSplit={(direction) =>
            splitWith(visibleTabContextMenu.agentId, direction)
          }
          onTogglePin={() => {
            const current = agents.find(
              (a) => a.id === visibleTabContextMenu.agentId
            );
            setAgentPinned(visibleTabContextMenu.agentId, !current?.pinned);
          }}
          onReopen={reopenClosedTab}
          chatMode={chatModeAgents.has(visibleTabContextMenu.agentId)}
          onToggleChat={() => toggleChatMode(visibleTabContextMenu.agentId)}
          canChat={toolSupportsChat(
            agents.find((a) => a.id === visibleTabContextMenu.agentId)?.aiToolId
          )}
          canRevealInExplorer={!!tabContextDocument}
          onRevealInExplorer={() => {
            if (!tabContextDocument) return;
            void invoke("reveal_local_path", {
              path: tabContextDocument.path,
            }).catch((error) => {
              pushToast(
                visibleTabContextMenu.agentId,
                tabContextDocument.projectName,
                text(`탐색기에서 파일을 표시할 수 없습니다: ${String(error)}`, `Could not reveal the file in File Explorer: ${String(error)}`)
              );
            });
          }}
          onCloseTab={() =>
            closeTab(visibleTabContextMenu.path, visibleTabContextMenu.agentId)
          }
          onCloseOthers={() =>
            closeOtherTabs(
              visibleTabContextMenu.path,
              visibleTabContextMenu.agentId
            )
          }
          onCloseRight={() =>
            closeTabsToRight(
              visibleTabContextMenu.path,
              visibleTabContextMenu.agentId
            )
          }
          onRename={() => setRenameSessionId(visibleTabContextMenu.agentId)}
          onSetColor={(color) =>
            setAgentTabColor(visibleTabContextMenu.agentId, color)
          }
        />
      )}
    </div>
  );
}

export default App;
