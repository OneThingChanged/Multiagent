import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  safeStorage,
  screen,
  shell,
  Tray,
} from "electron";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodePty from "node-pty";
import electronUpdater from "electron-updater";
import ipcContract from "./ipc-contract.cjs";
import runtimeVariantModule from "./runtime-variant.cjs";
import { createTerminalHandlers } from "./handlers/terminal-handlers.mjs";
import { HookService } from "./services/hook-service.mjs";
import { SessionService } from "./services/session-service.mjs";
import {
  CodexScrollbackFilter,
  PassThroughTerminalFilter,
} from "./services/terminal-stream.mjs";
import { TerminalSessionService } from "./services/terminal-session-service.mjs";
import { terminateWindowsProcessTree } from "./services/process-tree.mjs";
import {
  buildInteractiveSshArgs,
  findWindowsExecutable,
  generateSshKey,
  readPublicKey,
  sshConnectionArgs,
  testSshConnection,
} from "./services/ssh-service.mjs";
import { resolveTerminalPath } from "./services/terminal-path-service.mjs";
import { sanitizeTerminalOutput } from "./services/terminal-sanitize.mjs";
import { parseChatTranscript, deriveTurnLifecycle } from "./services/chat-transcript.mjs";
import {
  LocalDashboardService,
  RemoteDashboardService,
  TunnelService,
} from "./services/web-services.mjs";
import { UsageService } from "./services/usage-service.mjs";
import { DiagnosticsService } from "./services/diagnostics-service.mjs";
import { UpdaterLifecycle } from "./services/updater-lifecycle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const packageVariant = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"))
      .multiAgentVariant;
  } catch {
    return null;
  }
})();
const runtimeVariant = runtimeVariantModule.resolveRuntimeVariant({
  environmentVariant: process.env.MULTIAGENT_BUILD_VARIANT,
  packageVariant,
});
const isCompanyBuild = runtimeVariant.id === "company";
const devUrl = process.env.MULTIAGENT_DEV_URL?.trim() || null;
const bridgeSmoke = process.env.MULTIAGENT_ELECTRON_BRIDGE_SMOKE === "1" ||
  process.argv.includes("--multiagent-bridge-smoke");
const closeSmoke = process.env.MULTIAGENT_ELECTRON_CLOSE_SMOKE === "1" ||
  process.argv.includes("--multiagent-close-smoke");
const securitySmoke = process.env.MULTIAGENT_ELECTRON_SECURITY_SMOKE === "1" ||
  process.argv.includes("--multiagent-security-smoke");
const iconPath = path.join(appRoot, "src-tauri", "icons", "icon.ico");
const packagedRendererUrl = pathToFileURL(path.join(appRoot, "dist", "index.html")).href;
const MAX_DOC_FILES = 500;
const MAX_DOC_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DOC_EXTENSIONS = new Set([".md", ".markdown", ".html", ".htm"]);
const IMAGE_MIME = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);
const SHARED_WORKSPACE_KEYS = new Set([
  "multiagent.projects.v1",
  "multiagent.agents.v1",
  "multiagent.groups.v1",
  "multiagent.sshHosts.v1",
]);
const SKIPPED_DOC_DIRS = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "build",
  ".next",
  ".cache",
]);
const SKIPPED_TREE_DIRS = new Set([
  ...SKIPPED_DOC_DIRS,
  ".venv",
  "__pycache__",
  "out",
]);
const MAX_TREE_ENTRIES_PER_DIR = 2000;
const { assertAllowed, assertInvokeRequest, emittedSet } = ipcContract;
const COMPANY_DISABLED_COMMANDS = new Set([
  "sync_remote_agents",
  "sync_remote_view",
  "remote_config_get",
  "remote_config_set",
  "remote_server_status",
  "start_remote_server",
  "stop_remote_server",
  "tunnel_status",
  "start_tunnel",
  "stop_tunnel",
  "remote_access_list",
  "remote_access_approve",
  "remote_access_revoke",
]);
const preloadContractArguments = [
  `--multiagent-invoke-commands=${ipcContract.INVOKE_COMMANDS.join(",")}`,
  `--multiagent-delivered-events=${ipcContract.DELIVERED_EVENTS.join(",")}`,
  `--multiagent-emitted-events=${ipcContract.EMITTED_EVENTS.join(",")}`,
];

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let petWindow = null;
/** @type {import('electron').Tray | null} */
let tray = null;
let forceClosing = false;
let closeFallback = null;
let closeSmokeStartedAt = null;
/** @type {Map<number, {secondary_window: boolean, open_agent_id: string | null, ready: boolean}>} */
const runtimeByWebContents = new Map();
/** @type {Map<string, {id: string, name: string, process: import('node-pty').IPty, initTimer: NodeJS.Timeout | null, aiToolId: string, cwd: string | null, ssh: unknown, filter: CodexScrollbackFilter | PassThroughTerminalFilter, buffer: import('./services/terminal-stream.mjs').SequencedTerminalBuffer, subscribers: Set<number>}>} */
const ptys = new Map();
const terminalSessions = new TerminalSessionService({
  sessions: ptys,
  sendDataToView(viewId, payload) {
    sendEventToWebContentsId(viewId, "pty:data", payload);
  },
  broadcastExit(payload) {
    sendEventToAll("pty:exit", payload);
  },
});
/** @type {Map<string, string>} */
const sshPasswords = new Map();
const remotePorts = new Set();
let desktopPetUpdate = {
  status: "idle",
  workingCount: 0,
  workingItems: [],
  completedCount: 0,
  title: null,
  body: null,
  agentId: null,
  notificationKey: null,
  question: null,
};
const monitorHooks = new Map();
/** agentId -> latest hook-reported transcript path / session id (for the chat view). */
const agentTranscripts = new Map();
const agentTranscriptTool = new Map(); // agentId -> tool the resolved transcript belongs to
const agentSessionIds = new Map();
/** agentId -> epoch ms until which transcript resolution is known to fail
 *  (avoids rescanning the session dir every poll for sessions with no file). */
const transcriptMissUntil = new Map();

app.setName(runtimeVariant.displayName);
const userDataOverride = process.env.MULTIAGENT_ELECTRON_USER_DATA?.trim();
if (userDataOverride) app.setPath("userData", userDataOverride);
if (process.platform === "win32") {
  app.setAppUserModelId(runtimeVariant.appUserModelId);
}
const sessionService = new SessionService(app.getPath("userData"));
const hookBaseDir = process.env.MULTIAGENT_LOCAL_DATA?.trim() || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  runtimeVariant.localDataDirectory
);
const hookService = new HookService({
  baseDir: hookBaseDir,
  sendEvent(eventName, payload) {
    if (eventName === "agent:hook-event" && payload?.id) {
      // Remote/monitor views only need concise state. Keep tool input and the
      // full assistant response inside the local renderer/pet contract.
      monitorHooks.set(payload.id, {
        id: payload.id,
        event: payload.event,
        session_id: payload.session_id,
        hook_event_name: payload.hook_event_name,
        prompt: payload.prompt,
        tool_name: payload.tool_name,
        interactive_question: payload.interactive_question,
        received_at: payload.received_at,
        lastTs: Date.now(),
      });
      // Track the live transcript path / session id per agent so the chat view
      // can read the conversation for any session.
      if (payload.transcript_path) agentTranscripts.set(payload.id, payload.transcript_path);
      if (payload.session_id) agentSessionIds.set(payload.id, payload.session_id);
      if (payload.event === "done" && payload.transcript_path) {
        try {
          usageIndex.ingestHook(
            payload.id,
            payload.transcript_path,
            payload.session_id,
            payload.cwd
          );
        } catch (error) {
          console.warn("[electron] usage hook ingest failed", error);
        }
      }
      if (payload.event === "done") {
        // Claude limits live behind the OAuth usage endpoint (not the transcript),
        // so refresh them after a Claude turn completes. Throttled inside the service.
        const tool = usageIndex.catalog.agents
          .find((agent) => agent.id === payload.id)?.aiToolId;
        if (tool === "claude") {
          usageIndex.refreshClaudeRateLimits(false).catch(() => {});
        }
      }
    }
    sendEventToAll(eventName, payload);
  },
  sessionService,
});
let hookReady = null;
let hookMaintenanceTimer = null;
let hookMaintenancePromise = null;

function maintainActiveHooks() {
  if (hookMaintenancePromise) return hookMaintenancePromise;
  hookMaintenancePromise = hookService
    .maintain([...ptys.values()])
    .finally(() => { hookMaintenancePromise = null; });
  return hookMaintenancePromise;
}

async function repairActiveHooks() {
  if (hookMaintenancePromise) await hookMaintenancePromise;
  hookMaintenancePromise = hookService
    .repair([...ptys.values()])
    .finally(() => { hookMaintenancePromise = null; });
  return hookMaintenancePromise;
}

function liveOutputForAgents(agents, maxOutput = 80_000) {
  return (Array.isArray(agents) ? agents : []).map((agent) => {
    // A session with no live PTY (restored on launch, or its process exited) is
    // inactive — surface it as "offline" (비활성) rather than idle (대기), which
    // is reserved for a running-but-waiting terminal.
    const live = ptys.has(agent.id);
    return {
      ...agent,
      status: live ? agent.status : "offline",
      output: sanitizeTerminalOutput(
        ptys.get(agent.id)?.buffer.snapshot().slice(-maxOutput) ?? ""
      ),
      hook: live ? monitorHooks.get(agent.id) ?? null : null,
    };
  });
}

const usageIndex = new UsageService(path.join(hookBaseDir, "usage.db"), sessionService);

// Session capabilities shared by every web surface (Remote + local Dashboard):
// send input, stream the live terminal, read the chat transcript, restart.
const sessionProviders = {
  writePty(id, data) {
    const entry = ptys.get(id);
    if (!entry || data.length > 8 * 1024) return false;
    entry.process.write(data);
    return true;
  },
  terminalSnapshot: (id, afterSequence) => terminalSessions.snapshotSince(id, afterSequence),
  subscribeTerminal: (id, listener) => terminalSessions.subscribeData(id, listener),
  terminalSize: (id) => {
    const entry = ptys.get(id);
    return entry?.process ? { cols: entry.process.cols, rows: entry.process.rows } : null;
  },
  chatProvider: (id) => chatBlocksForAgent(id),
  restartSession: (id) => {
    sendEventToAll("remote:restart-session", { id: asString(id) });
    return ptys.has(asString(id));
  },
};

// Build the Remote-PWA-shaped state from the monitor's synced snapshot so the
// Dashboard can serve the same UI (chat/terminal) as the Remote client.
function dashboardPwaState() {
  const s = monitorService.state || {};
  const agents = Array.isArray(s.agents) ? s.agents : [];
  return {
    pwa: true,
    remote: true,
    agents: liveOutputForAgents(agents),
    view: {
      projects: s.projects ?? [],
      agents: agents.map((a) => ({ id: a.id, projectId: a.projectId })),
      groups: s.groups ?? [],
      activeGroupId: s.view?.activeGroupId ?? null,
      activeProjectId: s.view?.activeProjectId ?? null,
    },
    usage: usageIndex.dashboardSummary(),
  };
}

let monitorService;
monitorService = new LocalDashboardService({
  title: "MultiAgent Monitor",
  defaultPort: 4421,
  baseDir: hookBaseDir,
  configName: "monitor-config.json",
  stateProvider: dashboardPwaState,
  providers: sessionProviders,
});
let usageDashboard;
usageDashboard = new LocalDashboardService({
  title: "MultiAgent Usage",
  defaultPort: 3141,
  baseDir: hookBaseDir,
  configName: "usage-config.json",
  stateProvider: () => ({
    agents: liveOutputForAgents(usageDashboard.state.agents),
    usage: usageIndex.dashboardSummary(),
  }),
});
let remoteService;
remoteService = new RemoteDashboardService({
  baseDir: hookBaseDir,
  stateProvider: () => ({ agents: liveOutputForAgents(remoteService.agents, 24_000) }),
  ...sessionProviders,
  requestAccess(login) {
    sendEventToAll("remote:access-request", { login });
  },
});
// Dev/multi-instance port overrides: let a dev build bind different ports than
// an installed (tray-resident) instance holding the defaults. In-memory only —
// not persisted to the shared config files.
const portOverride = (value) => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : null;
};
const remotePortOverride = portOverride(process.env.MULTIAGENT_REMOTE_PORT);
if (remotePortOverride) remoteService.config.server_port = remotePortOverride;
const monitorPortOverride = portOverride(process.env.MULTIAGENT_MONITOR_PORT);
if (monitorPortOverride) monitorService.config.serverPort = monitorPortOverride;
const usagePortOverride = portOverride(process.env.MULTIAGENT_USAGE_PORT);
if (usagePortOverride) usageDashboard.config.serverPort = usagePortOverride;

const tunnelService = new TunnelService({
  baseDir: hookBaseDir,
  getConfig: () => remoteService.config,
  getLocalUrl: () => remoteService.status().url,
});
const { autoUpdater } = electronUpdater;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.channel = runtimeVariant.updaterChannel;
const electronTestUpdateFeed =
  "https://github.com/OneThingChanged/Multiagent/releases/download/electron-test/";
let updateDownloaded = false;
const updaterLifecycle = new UpdaterLifecycle({
  baseDir: hookBaseDir,
  onInstallTimeout() {
    console.error("[electron] updater did not terminate the app; forcing exit");
    app.exit(0);
  },
});
autoUpdater.on("error", (error) => {
  updaterLifecycle.record("updater-error", error);
});
autoUpdater.on("update-downloaded", (info) => {
  updaterLifecycle.record("update-downloaded", info?.version ?? null);
});

const diagnosticsService = new DiagnosticsService({
  baseDir: hookBaseDir,
  appInfoProvider: () => ({
    name: app.getName(),
    version: app.getVersion(),
    variant: runtimeVariant.id,
    packaged: app.isPackaged,
    renderer: devUrl ? "development" : "production",
  }),
  terminalProvider: () =>
    [...ptys.values()].map((entry) => ({
      id: entry.id,
      name: entry.name,
      aiToolId: entry.aiToolId,
      cwd: entry.cwd,
      processId: entry.process?.pid ?? null,
      remote: Boolean(entry.ssh),
      bufferedCharacters: entry.buffer.snapshot().length,
    })),
  hookProvider: () => hookService.diagnostics(),
  updaterProvider: () => updaterLifecycle.snapshot(),
});

async function checkForElectronUpdate() {
  if (!app.isPackaged && !process.env.MULTIAGENT_UPDATE_FEED_URL) return null;
  updaterLifecycle.record("check-started");
  const result = await updaterLifecycle.withTimeout(
    "check",
    () => {
      const updateFeedOverride = process.env.MULTIAGENT_UPDATE_FEED_URL?.trim();
      if (updateFeedOverride) {
        autoUpdater.setFeedURL({
          provider: "generic",
          url: updateFeedOverride,
        });
      } else if (app.getVersion().includes("-electron.")) {
        // Experimental Electron builds must not replace the Tauri GitHub Latest
        // channel. A fixed prerelease asset URL lets testers update independently.
        autoUpdater.setFeedURL({ provider: "generic", url: electronTestUpdateFeed });
      }
      return autoUpdater.checkForUpdates();
    },
    30_000
  );
  if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) {
    updaterLifecycle.record("check-current", app.getVersion());
    return null;
  }
  const update = {
    version: result.updateInfo.version,
    releaseDate: result.updateInfo.releaseDate,
    releaseName: result.updateInfo.releaseName ?? null,
  };
  updaterLifecycle.record("check-available", update.version);
  return update;
}

async function downloadElectronUpdate() {
  updaterLifecycle.record("download-started");
  let lastTransferred = 0;
  const onProgress = (progress) => {
    const transferred = Number(progress.transferred) || 0;
    if (lastTransferred === 0) {
      sendEventToAll("update:progress", {
        event: "Started",
        data: { contentLength: Number(progress.total) || undefined },
      });
    }
    sendEventToAll("update:progress", {
      event: "Progress",
      data: { chunkLength: Math.max(0, transferred - lastTransferred) },
    });
    lastTransferred = transferred;
  };
  autoUpdater.on("download-progress", onProgress);
  try {
    await updaterLifecycle.withTimeout(
      "download",
      () => autoUpdater.downloadUpdate(),
      15 * 60_000
    );
    updateDownloaded = true;
    updaterLifecycle.record("download-completed");
    sendEventToAll("update:progress", { event: "Finished", data: {} });
  } finally {
    autoUpdater.off("download-progress", onProgress);
  }
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asPositiveInt(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function eventSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function isTrustedRendererUrl(rawUrl) {
  try {
    const candidate = new URL(rawUrl);
    if (devUrl) {
      return candidate.origin === new URL(devUrl).origin;
    }
    candidate.search = "";
    candidate.hash = "";
    return candidate.href.toLowerCase() === packagedRendererUrl.toLowerCase();
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const senderId = event.sender.id;
  if (!runtimeByWebContents.has(senderId)) {
    throw new Error("등록되지 않은 Electron renderer의 IPC 요청을 차단했습니다.");
  }
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error("하위 frame의 Electron IPC 요청을 차단했습니다.");
  }
  if (!isTrustedRendererUrl(event.senderFrame.url)) {
    throw new Error("신뢰하지 않는 페이지의 Electron IPC 요청을 차단했습니다.");
  }
}

function openExternalIfAllowed(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      void shell.openExternal(url.href);
    }
  } catch {
    // Invalid navigation targets are denied without side effects.
  }
}

function installNavigationPolicy(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url);
    return { action: "deny" };
  });
  const guardNavigation = (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    openExternalIfAllowed(url);
  };
  win.webContents.on("will-navigate", guardNavigation);
  win.webContents.on("will-redirect", guardNavigation);
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function sendEventToAll(eventName, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("multiagent:event", eventName, payload);
    }
  }
}

function sendEvent(win, eventName, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("multiagent:event", eventName, payload);
  }
}

function sendEventToWebContentsId(webContentsId, eventName, payload) {
  const target = BrowserWindow.getAllWindows().find(
    (win) => !win.isDestroyed() && win.webContents.id === webContentsId
  );
  if (target) sendEvent(target, eventName, payload);
}

function withQuery(url, query) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") {
      next.searchParams.set(key, String(value));
    }
  }
  return next.toString();
}

async function loadRenderer(win, query = {}) {
  if (devUrl) {
    await win.loadURL(withQuery(devUrl, query));
    return;
  }
  await win.loadFile(path.join(appRoot, "dist", "index.html"), { query });
}

const TITLEBAR_HEIGHT = 36;
const DEFAULT_TITLEBAR_OVERLAY = {
  color: "#0b0f15",
  symbolColor: "#8b949e",
  height: TITLEBAR_HEIGHT,
};

function createAppWindow({ secondary = false, openAgentId = null } = {}) {
  const win = new BrowserWindow({
    title: secondary ? "MultiAgent — Window" : "MultiAgent Electron",
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: "#0d1117",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    // Custom in-app top bar; the OS still draws min/max/close as an overlay
    // so Win11 Snap Layouts and the close-confirm flow keep working.
    titleBarStyle: "hidden",
    titleBarOverlay: { ...DEFAULT_TITLEBAR_OVERLAY },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: preloadContractArguments,
    },
  });

  runtimeByWebContents.set(win.webContents.id, {
    secondary_window: secondary,
    open_agent_id: openAgentId,
    ready: false,
  });
  installNavigationPolicy(win);
  // The application menu is removed, which also drops its accelerators.
  // Restore the developer ones here (Ctrl+R is intentionally NOT rebound —
  // terminals use it, and the old menu hijacking it was a bug).
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = (input.key || "").toLowerCase();
    if (input.key === "F12" || (input.control && input.shift && key === "i")) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    } else if (devUrl && input.control && input.shift && key === "r") {
      event.preventDefault();
      win.webContents.reload();
    }
  });
  const webContentsId = win.webContents.id;
  win.webContents.on("destroyed", () => {
    terminalSessions.detachView(webContentsId);
    runtimeByWebContents.delete(webContentsId);
  });
  if (!bridgeSmoke) win.once("ready-to-show", () => win.show());

  if (!secondary) {
    // Closing the main window hides it to the system tray instead of quitting;
    // the app keeps running (sessions stay alive) and is fully closed only via
    // the tray's "종료" item (which sets forceClosing → closeEverything).
    win.on("close", (event) => {
      if (forceClosing) return;
      event.preventDefault();
      // Lifecycle smoke drives a real close via mainWindow.close(); honor it.
      if (closeSmokeStartedAt !== null) {
        closeEverything();
        return;
      }
      win.hide();
      if (process.platform === "win32") win.setSkipTaskbar(true);
    });
  }

  void loadRenderer(win, {
    secondaryWindow: secondary ? "1" : null,
    openAgentId,
  }).catch((error) => {
    console.error("[electron] renderer load failed:", error);
    if (!win.isDestroyed()) win.show();
  });
  return win;
}

function positionPet() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  petWindow.setBounds({
    x: x + width - 184 - 18,
    y: y + height - 176 - 18,
    width: 184,
    height: 176,
  });
}

function ensurePetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow;
  petWindow = new BrowserWindow({
    title: "MultiAgent Desktop Pet",
    width: 184,
    height: 176,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: preloadContractArguments,
    },
  });
  installNavigationPolicy(petWindow);
  const petWebContentsId = petWindow.webContents.id;
  runtimeByWebContents.set(petWebContentsId, {
    secondary_window: true,
    open_agent_id: null,
    ready: false,
  });
  petWindow.webContents.on("destroyed", () => {
    terminalSessions.detachView(petWebContentsId);
    runtimeByWebContents.delete(petWebContentsId);
    petWindow = null;
  });
  petWindow.once("ready-to-show", positionPet);
  const loadingPetWindow = petWindow;
  void loadRenderer(loadingPetWindow, { desktopPet: "1" }).catch((error) => {
    // Closing during a lifecycle/update shutdown can cancel the in-flight
    // file navigation. That is expected and must not become an unhandled
    // rejection in the main process.
    if (!loadingPetWindow.isDestroyed()) {
      console.error("[electron] desktop pet renderer load failed:", error);
    }
  });
  positionPet();
  return petWindow;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (process.platform === "win32") mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

// System tray: keeps the app resident after the window is closed. Left-click
// reopens the window; right-click → "종료" fully quits.
function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
  } catch {
    image = null;
  }
  tray = new Tray(image && !image.isEmpty() ? image : iconPath);
  tray.setToolTip(runtimeVariant.displayName || "MultiAgent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "MultiAgent 열기", click: () => showMainWindow() },
      { type: "separator" },
      { label: "종료", click: () => closeEverything() },
    ])
  );
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
  return tray;
}

function closePty(id) {
  terminalSessions.close(id, "close");
}

function allocateRemotePort(id) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  let port = 49152 + (hash % 10_000);
  while (remotePorts.has(port)) port = port >= 59151 ? 49152 : port + 1;
  remotePorts.add(port);
  return port;
}

function closeEverything() {
  if (forceClosing) return;
  forceClosing = true;
  if (closeFallback) {
    clearTimeout(closeFallback);
    closeFallback = null;
  }
  terminalSessions.closeAll("app-quit");
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy();
  }
  if (closeSmokeStartedAt !== null) {
    console.log(`[electron-smoke] MULTIAGENT_ELECTRON_CLOSE_OK ${Date.now() - closeSmokeStartedAt}ms`);
  }
  app.quit();
}

function findExecutableOnPath(name) {
  if (process.platform !== "win32") return name;
  const found = spawnSync("where.exe", [name], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (found.status !== 0) return null;
  return found.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.toLowerCase().includes("\\windowsapps\\")) ?? null;
}

function defaultShell(requested) {
  if (requested && fs.existsSync(requested)) return requested;
  if (process.platform !== "win32") {
    return process.env.SHELL || "/bin/bash";
  }
  const candidates = [
    path.join(process.env.ProgramW6432 || "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
    findExecutableOnPath("pwsh.exe"),
    path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    ),
    process.env.ComSpec,
  ];
  const executable = candidates.find(
    (candidate) => typeof candidate === "string" && fs.existsSync(candidate)
  );
  if (!executable) throw new Error("PowerShell 또는 cmd.exe를 찾을 수 없습니다.");
  return executable;
}

async function testPasswordSshConnection(ssh, password) {
  if (!password) throw new Error("저장된 SSH 비밀번호가 없습니다.");
  const executable = findWindowsExecutable(process.platform === "win32" ? "ssh.exe" : "ssh");
  if (!executable) throw new Error("OpenSSH 클라이언트를 찾을 수 없습니다.");
  return new Promise((resolve, reject) => {
    const handle = nodePty.spawn(
      executable,
      ["-tt", ...sshConnectionArgs(ssh), `${ssh.user}@${ssh.host}`, "echo multiagent-ok"],
      { name: "xterm-256color", cols: 80, rows: 24, cwd: os.homedir(), env: process.env, useConpty: true }
    );
    let output = "";
    let injected = false;
    let settled = false;
    let timer = null;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { handle.kill(); } catch {}
      if (error) reject(error);
      else resolve("연결 성공");
    };
    handle.onData((data) => {
      output += data;
      if (!injected && /(?:password|암호)\s*:/i.test(data)) {
        injected = true;
        handle.write(`${password}\r`);
      }
      if (output.includes("multiagent-ok")) finish();
    });
    handle.onExit(() => {
      if (!settled) finish(new Error("SSH 비밀번호 연결에 실패했습니다."));
    });
    timer = setTimeout(
      () => finish(new Error("SSH 연결 시간이 초과되었습니다.")),
      12_000
    );
  });
}

async function spawnPty(args, event) {
  const id = asString(args.id).trim();
  if (!id) throw new Error("PTY id가 비어 있습니다.");
  if (terminalSessions.has(id)) return { reattached: true };
  const spawnGeneration = terminalSessions.beginSpawn(id);

  await hookReady?.catch(() => {});
  const aiToolId = asString(args.aiToolId).trim();

  const ssh = args.ssh ? asObject(args.ssh) : null;
  let executable;
  let shellArgs;
  let reversePort = null;
  if (ssh) {
    executable = findWindowsExecutable(process.platform === "win32" ? "ssh.exe" : "ssh");
    if (!executable) throw new Error("OpenSSH 클라이언트를 찾을 수 없습니다.");
    reversePort = allocateRemotePort(id);
    shellArgs = buildInteractiveSshArgs(
      ssh,
      asString(args.initCommand),
      {
        agentId: id,
        port: hookService.port,
        reversePort,
        token: hookService.token,
        aiToolId,
      }
    );
  } else {
    executable = defaultShell(asString(args.shell).trim() || null);
    const lower = path.basename(executable).toLowerCase();
    shellArgs = lower.includes("powershell") || lower === "pwsh.exe" ? ["-NoLogo"] : [];
  }
  const requestedCwd = asString(args.cwd).trim();
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  const isPackagedVirtualPath =
    requestedCwd.endsWith(`${path.sep}app.asar`) || requestedCwd.includes(asarSegment);
  const cwd =
    requestedCwd && !isPackagedVirtualPath && fs.existsSync(requestedCwd)
      ? requestedCwd
      : os.homedir();
  if (!ssh && (aiToolId === "codex" || aiToolId === "claude") && cwd) {
    await hookService.setupProject(cwd, aiToolId).catch((error) => {
      console.warn(`[electron] hook setup failed for ${id}:`, error);
    });
  }
  let processHandle;
  try {
    processHandle = nodePty.spawn(executable, shellArgs, {
      name: "xterm-256color",
      cols: asPositiveInt(args.cols, 120),
      rows: asPositiveInt(args.rows, 30),
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        MULTIAGENT_AGENT_ID: id,
        MULTIAGENT_PORT: String(hookService.port || ""),
        MULTIAGENT_TOKEN: hookService.token || "",
      },
      useConpty: true,
    });
  } catch (error) {
    if (reversePort) remotePorts.delete(reversePort);
    throw error;
  }
  const entry = {
    id,
    name: asString(args.name).trim() || id,
    process: processHandle,
    initTimer: null,
    aiToolId,
    cwd,
    ssh: ssh ? { ...ssh, reversePort, passwordInjected: false } : null,
    filter:
      aiToolId === "codex"
        ? new CodexScrollbackFilter()
        : new PassThroughTerminalFilter(),
    quitCommand:
      aiToolId === "codex" || aiToolId === "claude" || aiToolId === "qwen"
        ? "/quit\r"
        : "exit\r",
    terminate:
      process.platform === "win32" &&
      !ssh &&
      (aiToolId === "codex" || aiToolId === "claude" || aiToolId === "qwen")
        ? () => terminateWindowsProcessTree(processHandle.pid)
        : null,
    release: () => {
      if (reversePort) remotePorts.delete(reversePort);
    },
    onRawData(data) {
      if (
        entry.ssh?.authMethod === "password" &&
        !entry.ssh.passwordInjected &&
        /(?:password|암호)\s*:/i.test(data)
      ) {
        const password = sshPasswords.get(asString(entry.ssh.hostId));
        if (password) {
          entry.ssh.passwordInjected = true;
          processHandle.write(`${password}\r`);
        }
      }
    },
  };
  if (!terminalSessions.register(entry, spawnGeneration)) {
    return { reattached: false, cancelled: true };
  }

  const initCommand = ssh ? "" : asString(args.initCommand).trim();
  if (initCommand) {
    entry.initTimer = setTimeout(() => {
      entry.initTimer = null;
      if (terminalSessions.get(id)?.process !== processHandle) return;
      processHandle.write(`${initCommand}\r`);
    }, 600);
  }
  return { reattached: false };
}

function resolveExistingPath(folder, rawPath) {
  const cleaned = asString(rawPath)
    .trim()
    .replace(/^[`"'<]+|[`"'>]+$/g, "");
  if (!cleaned) throw new Error("경로가 비어 있습니다.");
  const candidates = path.isAbsolute(cleaned)
    ? [cleaned]
    : [path.resolve(folder || process.cwd(), cleaned)];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) throw new Error(`경로를 찾을 수 없습니다: ${cleaned}`);
  return fs.realpathSync(match);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function collectDocs(root, dir, output) {
  if (output.length >= MAX_DOC_FILES) return;
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (output.length >= MAX_DOC_FILES) return;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DOC_DIRS.has(entry.name.toLowerCase())) {
        await collectDocs(root, absolute, output);
      }
    } else if (entry.isFile() && DOC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      output.push({
        name: entry.name,
        relative_path: path.relative(root, absolute).split(path.sep).join("/"),
      });
    }
  }
}

async function listMarkdownFiles(folder) {
  const root = fs.realpathSync(asString(folder));
  const output = [];
  await collectDocs(root, root, output);
  return output;
}

// Live-watch resolved transcript files: on change, bust the parse cache and
// tell renderers to refetch immediately (instead of waiting for the 3s poll).
// Bounded LRU of watchers so long-lived sessions don't leak fs handles.
const chatWatchers = new Map(); // resolvedPath -> { watcher, timer }
const MAX_CHAT_WATCHERS = 12;
function ensureChatWatch(transcriptPath) {
  let resolved;
  try {
    resolved = fs.realpathSync(transcriptPath);
  } catch {
    return;
  }
  if (chatWatchers.has(resolved)) return;
  let watcher;
  try {
    watcher = fs.watch(resolved, { persistent: false }, () => {
      const entry = chatWatchers.get(resolved);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        chatTranscriptCache.delete(resolved);
        sendEventToAll("chat:changed", { path: resolved });
      }, 180);
    });
  } catch {
    return; // file vanished / unwatchable — the poll still covers it
  }
  chatWatchers.set(resolved, { watcher, timer: null });
  while (chatWatchers.size > MAX_CHAT_WATCHERS) {
    const oldestKey = chatWatchers.keys().next().value;
    const oldest = chatWatchers.get(oldestKey);
    try { oldest?.watcher.close(); } catch { /* already closed */ }
    clearTimeout(oldest?.timer);
    chatWatchers.delete(oldestKey);
  }
}

// Root directory holding an agent's own JSONL session transcripts.
function chatSessionRoot(tool) {
  if (tool === "codex") return path.join(os.homedir(), ".codex", "sessions");
  if (tool === "claude") return path.join(os.homedir(), ".claude", "projects");
  return null;
}

// Read an agent transcript and decode it into chat blocks for the conversation
// view. Sandboxed to the tool's session directory. Very large transcripts are
// read from the tail so a long session doesn't block the UI.
// Only ever parse the tail of a transcript for the chat view. A live session's
// file grows (busting the mtime cache each poll), so parsing the whole thing on
// the main thread froze the app — cap the parse to the most recent slice.
const MAX_CHAT_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_CHAT_BLOCKS = 400;
// Parsed-transcript cache keyed by path → { mtimeMs, size, result }. Re-parsing
// a large JSONL on every poll is what made the chat view lag; skip it when the
// file is unchanged.
const chatTranscriptCache = new Map();
async function readChatTranscript(tool, transcriptPath) {
  const toolId = asString(tool);
  const root = chatSessionRoot(toolId);
  if (!root) throw new Error("지원하지 않는 도구입니다.");
  const requested = asString(transcriptPath).trim();
  if (!requested || !fs.existsSync(requested)) {
    return { blocks: [], truncated: false, missing: true };
  }
  const resolved = fs.realpathSync(requested);
  const rootReal = fs.existsSync(root) ? fs.realpathSync(root) : root;
  if (!isInside(rootReal, resolved)) throw new Error("허용되지 않은 트랜스크립트 경로입니다.");
  const stat = await fsPromises.stat(resolved);
  const cached = chatTranscriptCache.get(resolved);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.result;
  }
  let result;
  if (stat.size > MAX_CHAT_TRANSCRIPT_BYTES) {
    const start = stat.size - MAX_CHAT_TRANSCRIPT_BYTES;
    const handle = await fsPromises.open(resolved, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      let text = buffer.toString("utf8");
      const newline = text.indexOf("\n"); // drop the partial first line
      if (newline >= 0) text = text.slice(newline + 1);
      result = { blocks: parseChatTranscript(text, toolId), truncated: true, missing: false, lifecycle: deriveTurnLifecycle(text, toolId) };
    } finally {
      await handle.close();
    }
  } else {
    const text = await fsPromises.readFile(resolved, "utf8");
    result = { blocks: parseChatTranscript(text, toolId), truncated: false, missing: false, lifecycle: deriveTurnLifecycle(text, toolId) };
  }
  if (result.blocks.length > MAX_CHAT_BLOCKS) {
    result = { ...result, blocks: result.blocks.slice(-MAX_CHAT_BLOCKS), truncated: true };
  }
  chatTranscriptCache.set(resolved, { mtimeMs: stat.mtimeMs, size: stat.size, result });
  return result;
}

// Locate a transcript by session id when a hook didn't report its path — Codex
// filenames embed the session id; Claude names the file <sessionId>.jsonl.
function findTranscriptBySessionId(root, tool, sessionId) {
  if (!root || !sessionId || !fs.existsSync(root)) return null;
  const sid = String(sessionId).toLowerCase();
  const stack = [root];
  let scanned = 0;
  while (stack.length && scanned < 8000) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      scanned += 1;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      const name = entry.name.toLowerCase();
      if (!name.endsWith(".jsonl")) continue;
      if (tool === "claude" ? name === `${sid}.jsonl` : name.includes(sid)) return full;
    }
  }
  return null;
}

// Resolve + decode the current transcript for an agent (for the chat view).
// Locate an agent's transcript strictly by its CLI session id — the only key
// that uniquely identifies THIS session (matching by folder is unreliable when
// several sessions share a working directory). Tries the declared tool first,
// then the other CLI (in case the tool is mislabeled), and returns the matched
// transcript path AND the tool it belongs to so we decode correctly.
function resolveChatTranscriptBySession(preferredTool, sessionId) {
  if (!sessionId) return null;
  const other = preferredTool === "codex" ? "claude" : "codex";
  const tools = preferredTool ? [preferredTool, other] : ["claude", "codex"];
  for (const tool of tools) {
    const found = findTranscriptBySessionId(chatSessionRoot(tool), tool, sessionId);
    if (found) return { path: found, tool };
  }
  return null;
}

async function chatBlocksForAgent(agentId, sessionIdArg) {
  const id = asString(agentId).trim();
  // Prefer the live PTY, but fall back to the synced catalog so idle/restored
  // sessions (no live PTY, no fresh hook) still resolve their tool + session.
  const catalogAgent = usageIndex.catalog.agents.find((agent) => agent.id === id);
  const declaredTool = ptys.get(id)?.aiToolId || catalogAgent?.aiToolId || null;
  // The frontend passes the agent's own CLI session id (provider/last session),
  // which survives restarts — the authoritative key for its transcript.
  const sessionId =
    asString(sessionIdArg).trim() ||
    agentSessionIds.get(id) ||
    catalogAgent?.lastSessionId ||
    null;

  let transcriptPath = agentTranscripts.get(id);
  let tool = agentTranscriptTool.get(id) || declaredTool;
  // Drop a cached path that doesn't belong to the current session id (a resumed
  // session gets a new rollout; both CLIs embed the session id in the path).
  if (transcriptPath && sessionId && !transcriptPath.toLowerCase().includes(sessionId.toLowerCase())) {
    transcriptPath = null;
  }
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    if ((transcriptMissUntil.get(id) ?? 0) > Date.now()) {
      return { blocks: [], truncated: false, missing: true, tool: declaredTool ?? undefined };
    }
    const resolved = resolveChatTranscriptBySession(declaredTool, sessionId);
    if (resolved) {
      transcriptPath = resolved.path;
      tool = resolved.tool;
      agentTranscripts.set(id, transcriptPath);
      agentTranscriptTool.set(id, tool);
      transcriptMissUntil.delete(id);
    } else {
      transcriptMissUntil.set(id, Date.now() + 15_000);
    }
  }
  if (!transcriptPath) {
    if (declaredTool !== "codex" && declaredTool !== "claude") {
      return { blocks: [], truncated: false, missing: true, unsupported: true };
    }
    return { blocks: [], truncated: false, missing: true, tool: declaredTool };
  }
  ensureChatWatch(transcriptPath); // push a refresh when the file changes
  const result = await readChatTranscript(tool, transcriptPath);
  return { ...result, tool };
}

function resolveDocPath(folder, requested) {
  const raw = asString(requested).trim();
  if (!raw) throw new Error("문서 경로가 비어 있습니다.");
  const root = fs.realpathSync(asString(folder));
  const candidates = path.isAbsolute(raw)
    ? [raw]
    : [path.join(root, raw), path.join(root, "Docs", raw)];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const absolute = fs.realpathSync(candidate);
    if (!DOC_EXTENSIONS.has(path.extname(absolute).toLowerCase())) continue;
    return isInside(root, absolute)
      ? path.relative(root, absolute).split(path.sep).join("/")
      : absolute;
  }
  throw new Error(`문서를 찾을 수 없습니다: ${raw}`);
}

async function readMarkdownFile(folder, requested) {
  const raw = asString(requested);
  const resolved = path.isAbsolute(raw)
    ? fs.realpathSync(raw)
    : fs.realpathSync(path.join(asString(folder), raw));
  if (!DOC_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error("지원하는 문서 파일이 아닙니다.");
  }
  const stats = await fsPromises.stat(resolved);
  if (stats.size > MAX_DOC_BYTES) throw new Error("문서 파일이 너무 큽니다.");
  return fsPromises.readFile(resolved, "utf8");
}

// File-tree browsing for the right sidebar. Unlike readMarkdownFile this is
// strictly sandboxed to the project root via isInside.
// Bounded recursive file search under a project folder for @file autocomplete.
// Ranks basename-prefix matches first; skips vendor/build dirs.
async function searchFiles(folder, query, limit) {
  const rootRaw = asString(folder);
  if (!rootRaw || !fs.existsSync(rootRaw)) return [];
  const root = fs.realpathSync(rootRaw);
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 30;
  const q = asString(query).toLowerCase();
  const results = [];
  const stack = [root];
  let scanned = 0;
  while (stack.length && results.length < cap * 4 && scanned < 8000) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      scanned += 1;
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (!SKIPPED_TREE_DIRS.has(lower) && !entry.name.startsWith(".")) {
          stack.push(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const rel = path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/");
        if (!q || rel.toLowerCase().includes(q)) results.push(rel);
      }
    }
  }
  const rank = (rel) => {
    const base = rel.split("/").pop().toLowerCase();
    if (!q) return 2;
    if (base.startsWith(q)) return 0;
    if (base.includes(q)) return 1;
    return 2;
  };
  results.sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b));
  return results.slice(0, cap);
}

async function listDirectory(folder, relative) {
  const root = fs.realpathSync(asString(folder));
  const requested = asString(relative ?? "").trim();
  const joined = requested ? path.join(root, requested) : root;
  if (!fs.existsSync(joined)) {
    throw new Error(`폴더를 찾을 수 없습니다: ${requested || "."}`);
  }
  const resolved = fs.realpathSync(joined);
  if (!isInside(root, resolved)) {
    throw new Error("프로젝트 폴더 밖은 조회할 수 없습니다.");
  }
  const entries = await fsPromises.readdir(resolved, { withFileTypes: true });
  const dirs = [];
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_TREE_DIRS.has(entry.name.toLowerCase())) continue;
      dirs.push(entry.name);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(entry.name);
    }
    if (dirs.length + files.length >= MAX_TREE_ENTRIES_PER_DIR) break;
  }
  dirs.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.localeCompare(b));
  const toEntry = (name, isDir) => ({
    name,
    relative_path: (requested ? `${requested.split(path.sep).join("/")}/${name}` : name)
      .replace(/\\/g, "/"),
    is_dir: isDir,
  });
  return [
    ...dirs.map((name) => toEntry(name, true)),
    ...files.map((name) => toEntry(name, false)),
  ];
}

async function readTextFile(folder, relativePath) {
  const root = fs.realpathSync(asString(folder));
  const requested = asString(relativePath).trim();
  if (!requested) throw new Error("파일 경로가 비어 있습니다.");
  const joined = path.join(root, requested);
  if (!fs.existsSync(joined)) {
    throw new Error(`파일을 찾을 수 없습니다: ${requested}`);
  }
  const resolved = fs.realpathSync(joined);
  if (!isInside(root, resolved)) {
    throw new Error("프로젝트 폴더 밖은 읽을 수 없습니다.");
  }
  const stats = await fsPromises.stat(resolved);
  if (!stats.isFile()) throw new Error("파일이 아닙니다.");
  if (stats.size > MAX_DOC_BYTES) {
    return { kind: "too_large", size: stats.size };
  }
  const data = await fsPromises.readFile(resolved);
  const probe = data.subarray(0, 8192);
  if (probe.includes(0)) return { kind: "binary" };
  return { kind: "text", content: data.toString("utf8") };
}

// Git status for the file tree (M/A/U/D/R badges). Non-repo folders and
// missing git both resolve to { is_repo: false } instead of throwing.
async function gitStatusForTree(folder) {
  const root = fs.realpathSync(asString(folder));
  const stdout = await new Promise((resolve) => {
    execFile(
      "git",
      ["-c", "core.quotepath=false", "status", "--porcelain", "-z"],
      { cwd: root, timeout: 3000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, out) => resolve(error ? null : out)
    );
  });
  if (stdout === null) return { is_repo: false, entries: [] };
  const entries = [];
  const tokens = stdout.split("\0");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== " ") continue;
    const x = token[0];
    const y = token[1];
    const relative = token.slice(3).replace(/\\/g, "/");
    // Rename/copy entries are followed by the original path as its own token.
    if (x === "R" || x === "C") i += 1;
    let status;
    if (x === "?" || y === "?") status = "U";
    else if (x === "D" || y === "D") status = "D";
    else if (x === "R" || x === "C") status = "R";
    else if (x === "A") status = "A";
    else status = "M";
    entries.push({ relative_path: relative, status });
    if (entries.length >= 2000) break;
  }
  return { is_repo: true, entries };
}

// ---- Resource monitor: per-session process-tree CPU/memory ----

// One snapshot of every process: pid → { ppid, cpuPercent, memoryBytes }.
// Windows uses a cheap Win32_Process CIM query (~100ms; the PerfProc class
// with formatted CPU% takes seconds). CPU% is derived from the delta of
// User+Kernel time (100ns units) between two polls, normalized by core
// count — the first sample reports 0%. POSIX falls back to `ps`.
let lastCpuSample = null; // { at: epochMs, times: Map<pid, cpuTime100ns> }

async function snapshotProcessStats() {
  const stats = new Map();
  if (process.platform === "win32") {
    const script =
      "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,PrivatePageCount,UserModeTime,KernelModeTime | " +
      "Select-Object ProcessId,ParentProcessId,PrivatePageCount,UserModeTime,KernelModeTime | " +
      "ConvertTo-Json -Compress";
    const stdout = await new Promise((resolve) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { timeout: 8000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
        (error, out) => resolve(error ? null : out)
      );
    });
    if (!stdout) return stats;
    let rows;
    try {
      rows = JSON.parse(stdout);
    } catch {
      return stats;
    }
    const now = Date.now();
    const cpuCount = Math.max(1, os.cpus().length);
    const previous = lastCpuSample;
    const times = new Map();
    const elapsed100ns = previous ? (now - previous.at) * 10_000 : 0;
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      const pid = Number(row?.ProcessId);
      if (!Number.isSafeInteger(pid) || pid <= 0) continue;
      const cpuTime =
        (Number(row?.UserModeTime) || 0) + (Number(row?.KernelModeTime) || 0);
      times.set(pid, cpuTime);
      let cpuPercent = 0;
      if (previous && elapsed100ns > 0) {
        const before = previous.times.get(pid);
        if (typeof before === "number" && cpuTime >= before) {
          cpuPercent = ((cpuTime - before) / elapsed100ns) * (100 / cpuCount);
        }
      }
      stats.set(pid, {
        ppid: Number(row?.ParentProcessId) || 0,
        cpuPercent,
        memoryBytes: Number(row?.PrivatePageCount) || 0,
      });
    }
    lastCpuSample = { at: now, times };
    return stats;
  }
  const stdout = await new Promise((resolve) => {
    execFile(
      "ps",
      ["-eo", "pid=,ppid=,pcpu=,rss="],
      { timeout: 5000, maxBuffer: 16 * 1024 * 1024 },
      (error, out) => resolve(error ? null : out)
    );
  });
  if (!stdout) return stats;
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const pid = Number(parts[0]);
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    stats.set(pid, {
      ppid: Number(parts[1]) || 0,
      cpuPercent: Number(parts[2]) || 0,
      memoryBytes: (Number(parts[3]) || 0) * 1024,
    });
  }
  return stats;
}

function sumProcessTree(rootPid, stats, childrenByPpid) {
  let cpuPercent = 0;
  let memoryBytes = 0;
  let processCount = 0;
  const queue = [rootPid];
  const seen = new Set();
  while (queue.length > 0) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const stat = stats.get(pid);
    if (stat) {
      cpuPercent += stat.cpuPercent;
      memoryBytes += stat.memoryBytes;
      processCount += 1;
    }
    for (const child of childrenByPpid.get(pid) ?? []) queue.push(child);
  }
  return { cpuPercent, memoryBytes, processCount };
}

async function resourceUsage() {
  const stats = await snapshotProcessStats();
  const childrenByPpid = new Map();
  for (const [pid, stat] of stats) {
    if (!stat.ppid) continue;
    const list = childrenByPpid.get(stat.ppid);
    if (list) list.push(pid);
    else childrenByPpid.set(stat.ppid, [pid]);
  }

  const sessions = [];
  for (const entry of ptys.values()) {
    const pid = entry.process?.pid;
    if (!pid || entry.ssh) continue;
    const usage = sumProcessTree(pid, stats, childrenByPpid);
    sessions.push({
      id: entry.id,
      pid,
      cpu_percent: Math.round(usage.cpuPercent * 10) / 10,
      memory_bytes: usage.memoryBytes,
      process_count: usage.processCount,
    });
  }

  // The whole app tree (main + renderer/GPU + every local session).
  const appUsage = sumProcessTree(process.pid, stats, childrenByPpid);
  return {
    updated_at: Date.now(),
    sampled: stats.size > 0,
    total_cpu_percent: Math.round(appUsage.cpuPercent * 10) / 10,
    total_memory_bytes: appUsage.memoryBytes,
    total_process_count: appUsage.processCount,
    system_memory_bytes: os.totalmem(),
    sessions,
  };
}

// ---- Ports monitor: listening TCP ports attributed to projects ----

const MAX_PORTS = 200;

function normalizeConnectHost(bindHost) {
  const host = (bindHost || "").trim();
  if (!host || host === "*" || host === "0.0.0.0" || host === "::" || host === "[::]") {
    return "localhost";
  }
  return host.replace(/^\[|\]$/g, "");
}

// Parse `netstat -ano -p tcp` LISTENING rows → [{ bindHost, port, pid }].
function parseNetstatListening(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0].toUpperCase() !== "TCP") continue;
    if (!/LISTEN/i.test(parts[3])) continue;
    const local = parts[1];
    const pid = Number(parts[4]);
    const sep = local.lastIndexOf(":");
    if (sep <= 0 || !Number.isSafeInteger(pid) || pid <= 0) continue;
    const port = Number(local.slice(sep + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    rows.push({ bindHost: local.slice(0, sep), port, pid });
  }
  return rows;
}

// Parse `lsof -nP -iTCP -sTCP:LISTEN -F pcn` field output (POSIX).
function parseLsofListening(stdout) {
  const rows = [];
  let pid = 0;
  let name = "";
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1)) || 0;
    else if (line.startsWith("c")) name = line.slice(1);
    else if (line.startsWith("n") && pid > 0) {
      const address = line.slice(1);
      const sep = address.lastIndexOf(":");
      if (sep <= 0) continue;
      const port = Number(address.slice(sep + 1));
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      rows.push({ bindHost: address.slice(0, sep), port, pid, processName: name });
    }
  }
  return rows;
}

function runCommand(command, commandArgs, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(
      command,
      commandArgs,
      { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, out) => resolve(error ? null : out)
    );
  });
}

// A project path appears in a command line as a whole token (bounded by
// whitespace/quotes before and whitespace/quote/separator after) — mirrors
// Orca's includesPathBoundary to avoid substring false positives.
function commandLineMatchesFolder(commandLineLower, folderLower) {
  let index = 0;
  while (index < commandLineLower.length) {
    const found = commandLineLower.indexOf(folderLower, index);
    if (found < 0) return false;
    const before = found === 0 ? " " : commandLineLower[found - 1];
    const afterIndex = found + folderLower.length;
    const after =
      afterIndex >= commandLineLower.length
        ? " "
        : commandLineLower[afterIndex];
    if (
      /[\s"'=]/.test(before) &&
      /[\s"'\\/:,;)]/.test(after)
    ) {
      return true;
    }
    index = found + 1;
  }
  return false;
}

async function listPorts(rawProjects) {
  const projects = (Array.isArray(rawProjects) ? rawProjects : [])
    .filter((p) => p && typeof p.id === "string" && typeof p.folder === "string" && p.folder.trim())
    .map((p) => ({
      id: p.id,
      folderLower: p.folder.trim().replace(/[\\/]+$/, "").toLowerCase().replace(/\//g, "\\"),
      folderLowerPosix: p.folder.trim().replace(/[\\/]+$/, "").toLowerCase().replace(/\\/g, "/"),
    }))
    // Deepest folder wins when projects nest.
    .sort((a, b) => b.folderLower.length - a.folderLower.length);

  let listeners = [];
  let processInfo = new Map(); // pid → { name, commandLineLower, ppid }

  if (process.platform === "win32") {
    // No "-p tcp": that flag hides IPv6-only listeners ([::] binds); the
    // parser keeps TCP rows (v4+v6) and drops UDP by the first column.
    const netstatOut = await runCommand("netstat.exe", ["-ano"]);
    if (netstatOut === null) return { updated_at: Date.now(), sampled: false, ports: [] };
    listeners = parseNetstatListening(netstatOut);
    // One full Win32_Process query: names + command lines for display and
    // attribution, plus ppids so listener pids can be walked up to a
    // session's PTY root.
    const script =
      "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine | " +
      "Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
    const cimOut = await runCommand(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      8000
    );
    if (cimOut) {
      try {
        const rows = JSON.parse(cimOut);
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          const pid = Number(row?.ProcessId);
          if (!Number.isSafeInteger(pid) || pid <= 0) continue;
          processInfo.set(pid, {
            name: typeof row?.Name === "string" ? row.Name : "",
            commandLineLower:
              typeof row?.CommandLine === "string"
                ? row.CommandLine.toLowerCase()
                : "",
            ppid: Number(row?.ParentProcessId) || 0,
          });
        }
      } catch {}
    }
  } else {
    const lsofOut = await runCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"]);
    if (lsofOut === null) return { updated_at: Date.now(), sampled: false, ports: [] };
    listeners = parseLsofListening(lsofOut);
    const psOut = await runCommand("ps", ["-eo", "pid=,ppid=,args="]);
    if (psOut) {
      for (const line of psOut.split("\n")) {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!match) continue;
        processInfo.set(Number(match[1]), {
          name: "",
          commandLineLower: match[3].toLowerCase(),
          ppid: Number(match[2]) || 0,
        });
      }
    }
  }

  // Session PTY roots → agent id (local sessions only).
  const sessionRootByPid = new Map();
  for (const entry of ptys.values()) {
    const pid = entry.process?.pid;
    if (pid && !entry.ssh) sessionRootByPid.set(pid, entry.id);
  }

  const findSessionAncestor = (pid) => {
    let current = pid;
    for (let depth = 0; depth < 32; depth += 1) {
      if (sessionRootByPid.has(current)) return sessionRootByPid.get(current);
      const info = processInfo.get(current);
      if (!info || !info.ppid || info.ppid === current) return null;
      current = info.ppid;
    }
    return null;
  };

  const matchProjectByCommandLine = (commandLineLower) => {
    if (!commandLineLower) return null;
    const posix = commandLineLower.replace(/\\/g, "/");
    for (const project of projects) {
      if (
        commandLineMatchesFolder(commandLineLower, project.folderLower) ||
        commandLineMatchesFolder(posix, project.folderLowerPosix)
      ) {
        return project.id;
      }
    }
    return null;
  };

  const seen = new Set();
  const ports = [];
  for (const listener of listeners) {
    const connectHost = normalizeConnectHost(listener.bindHost);
    const key = `${connectHost}:${listener.port}:${listener.pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = processInfo.get(listener.pid);
    const terminalId = findSessionAncestor(listener.pid);
    const projectId = terminalId
      ? null
      : matchProjectByCommandLine(info?.commandLineLower ?? "");
    ports.push({
      port: listener.port,
      pid: listener.pid,
      connect_host: connectHost,
      process_name:
        info?.name || listener.processName || "",
      kind: terminalId || projectId ? "workspace" : "external",
      terminal_id: terminalId,
      project_id: projectId,
      own_app: listener.pid === process.pid,
    });
    if (ports.length >= MAX_PORTS) break;
  }

  ports.sort((a, b) => {
    const rank = (p) => (p.kind === "workspace" ? 0 : 1);
    return rank(a) - rank(b) || a.port - b.port;
  });

  return { updated_at: Date.now(), sampled: true, ports };
}

async function killPortProcess(pid, port) {
  const targetPid = Number(pid);
  const targetPort = Number(port);
  if (!Number.isSafeInteger(targetPid) || targetPid <= 0) {
    throw new Error("잘못된 프로세스입니다.");
  }
  if (targetPid === process.pid) {
    throw new Error("앱 자신의 프로세스는 종료할 수 없습니다.");
  }
  // Re-verify: the pid must still own a LISTENING socket on that port.
  const current = await listPorts([]);
  const stillOwns = current.ports.some(
    (entry) => entry.pid === targetPid && entry.port === targetPort
  );
  if (!stillOwns) {
    throw new Error("해당 포트를 사용하는 프로세스를 찾을 수 없습니다.");
  }
  process.kill(targetPid);
  return null;
}

// ---- Source control view: aggregated repo state + stage/commit ----

function runGit(root, args, timeout = 3000) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", "core.quotepath=false", ...args],
      { cwd: root, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || error.message).trim()));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

function gitLetterFromCode(code) {
  if (code === "A") return "A";
  if (code === "D") return "D";
  if (code === "R" || code === "C") return "R";
  return "M";
}

// Parse `status --porcelain -z` into separate staged (index) and unstaged
// (worktree) entry lists. A file with "MM" appears in both.
function parseGitStatusZ(stdout) {
  const staged = [];
  const unstaged = [];
  const tokens = stdout.split("\0");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== " ") continue;
    const x = token[0];
    const y = token[1];
    const relative = token.slice(3).replace(/\\/g, "/");
    if (x === "R" || x === "C") i += 1; // skip original-path token
    if (x === "?" && y === "?") {
      unstaged.push({ relative_path: relative, status: "U" });
      continue;
    }
    if (x !== " " && x !== "?") {
      staged.push({ relative_path: relative, status: gitLetterFromCode(x) });
    }
    if (y !== " ") {
      unstaged.push({ relative_path: relative, status: gitLetterFromCode(y) });
    }
    if (staged.length + unstaged.length >= 2000) break;
  }
  return { staged, unstaged };
}

function parseNumstat(stdout) {
  const stats = new Map();
  for (const line of stdout.split("\n")) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;
    // Binary files report "-"; rename lines keep git's "old => new" form and
    // simply won't match a plain path lookup — acceptable for stats.
    stats.set(match[3].replace(/\\/g, "/"), {
      additions: match[1] === "-" ? 0 : Number(match[1]),
      deletions: match[2] === "-" ? 0 : Number(match[2]),
    });
  }
  return stats;
}

async function gitChanges(folder) {
  const root = fs.realpathSync(asString(folder));
  let statusOut;
  try {
    statusOut = await runGit(root, ["status", "--porcelain", "-z"]);
  } catch {
    return {
      is_repo: false,
      branch: "",
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      commits: [],
    };
  }
  const { staged, unstaged } = parseGitStatusZ(statusOut);

  const [stagedStatsOut, unstagedStatsOut, branchOut, logOut] =
    await Promise.all([
      runGit(root, ["diff", "--numstat", "--cached"]).catch(() => ""),
      runGit(root, ["diff", "--numstat"]).catch(() => ""),
      runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
      runGit(root, ["log", "-n", "8", "--pretty=format:%h%x00%s"]).catch(
        () => ""
      ),
    ]);
  const stagedStats = parseNumstat(stagedStatsOut);
  const unstagedStats = parseNumstat(unstagedStatsOut);
  const attach = (entries, stats) =>
    entries.map((entry) => ({
      ...entry,
      additions: stats.get(entry.relative_path)?.additions ?? 0,
      deletions: stats.get(entry.relative_path)?.deletions ?? 0,
    }));

  let upstream = null;
  let ahead = 0;
  let behind = 0;
  try {
    upstream = (
      await runGit(root, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ])
    ).trim();
    const counts = (
      await runGit(root, ["rev-list", "--left-right", "--count", "@{u}...HEAD"])
    )
      .trim()
      .split(/\s+/);
    behind = Number(counts[0]) || 0;
    ahead = Number(counts[1]) || 0;
  } catch {
    upstream = null;
  }

  const commits = [];
  for (const line of logOut.split("\n")) {
    const sep = line.indexOf("\0");
    if (sep <= 0) continue;
    commits.push({ hash: line.slice(0, sep), subject: line.slice(sep + 1) });
  }

  return {
    is_repo: true,
    branch: branchOut.trim(),
    upstream,
    ahead,
    behind,
    staged: attach(staged, stagedStats),
    unstaged: attach(unstaged, unstagedStats),
    commits,
  };
}

function assertGitPaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 500) {
    throw new Error("경로 목록이 잘못되었습니다.");
  }
  for (const p of paths) {
    if (typeof p !== "string" || !p.trim() || p.length > 4096) {
      throw new Error("경로 목록이 잘못되었습니다.");
    }
  }
  return paths;
}

async function gitStage(folder, paths) {
  const root = fs.realpathSync(asString(folder));
  await runGit(root, ["add", "--", ...assertGitPaths(paths)], 10000);
  return null;
}

async function gitUnstage(folder, paths) {
  const root = fs.realpathSync(asString(folder));
  await runGit(root, ["restore", "--staged", "--", ...assertGitPaths(paths)], 10000);
  return null;
}

async function gitCommit(folder, message, paths) {
  const root = fs.realpathSync(asString(folder));
  const trimmed = asString(message).trim();
  if (!trimmed) throw new Error("커밋 메시지가 비어 있습니다.");
  const args = ["commit", "-m", trimmed];
  // Path-limited commit ("commit this file"): commits only the given paths'
  // current content, leaving any other staged changes untouched.
  if (Array.isArray(paths) && paths.length > 0) {
    args.push("--", ...assertGitPaths(paths));
  }
  await runGit(root, args, 20000);
  return null;
}

// Discard working-tree changes for the given paths (destructive; the renderer
// confirms first). Classified from a fresh porcelain scan:
//   untracked (??)         → move to the OS trash (recoverable)
//   staged-new  (X === A)  → unstage, then trash the file
//   tracked else           → git restore --source=HEAD --staged --worktree
async function gitDiscard(folder, paths) {
  const root = fs.realpathSync(asString(folder));
  const requested = new Set(assertGitPaths(paths));
  const statusOut = await runGit(root, ["status", "--porcelain", "-z"]);
  const codeByPath = new Map();
  const tokens = statusOut.split("\0");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== " ") continue;
    const x = token[0];
    const relative = token.slice(3).replace(/\\/g, "/");
    if (x === "R" || x === "C") i += 1;
    codeByPath.set(relative, token.slice(0, 2));
  }

  const toRestore = [];
  const toTrash = [];
  const toUnstageThenTrash = [];
  for (const rel of requested) {
    const code = codeByPath.get(rel);
    if (!code) continue; // no longer changed
    if (code[0] === "?") toTrash.push(rel);
    else if (code[0] === "A") toUnstageThenTrash.push(rel);
    else toRestore.push(rel);
  }

  if (toRestore.length) {
    await runGit(
      root,
      ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...toRestore],
      15000
    );
  }
  if (toUnstageThenTrash.length) {
    await runGit(root, ["restore", "--staged", "--", ...toUnstageThenTrash], 15000);
    toTrash.push(...toUnstageThenTrash);
  }
  for (const rel of toTrash) {
    const joined = path.join(root, rel);
    if (!fs.existsSync(joined)) continue;
    const resolved = fs.realpathSync(joined);
    if (!isInside(root, resolved)) continue;
    await shell.trashItem(resolved).catch(() => {});
  }
  return null;
}

// Local branches (most-recent first) plus the current branch, for the Source
// Control branch switcher.
async function gitBranches(folder) {
  const root = fs.realpathSync(asString(folder));
  let current = "";
  try {
    current = (await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  } catch {
    current = "";
  }
  let branches = [];
  try {
    const out = await runGit(root, [
      "for-each-ref",
      "--format=%(refname:short)",
      "--sort=-committerdate",
      "refs/heads",
    ]);
    branches = out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    branches = [];
  }
  return { current, branches };
}

async function gitCheckout(folder, branch) {
  const root = fs.realpathSync(asString(folder));
  const name = asString(branch).trim();
  // Names come from the switcher (real refs), but validate defensively.
  if (!name || name.length > 255 || /[\s~^:?*[\\]/.test(name)) {
    throw new Error("잘못된 브랜치 이름입니다.");
  }
  await runGit(root, ["checkout", name], 30000);
  return null;
}

// Launch the user-configured external diff program comparing the file's HEAD
// (and, for staged rows, index) version against the working-tree version. The
// "before" side is materialized to a temp file so the tool has two real paths.
// $LOCAL / $REMOTE in the command are substituted; if neither is present the
// two paths are appended. Spawned detached so a GUI tool never blocks the app.
async function gitDiffTool(folder, relativePath, staged, command, ref) {
  const root = fs.realpathSync(asString(folder));
  const rel = asString(relativePath).trim().replace(/^[\\/]+/, "");
  if (!rel || rel.length > 4096) throw new Error("경로가 잘못되었습니다.");
  const cmd = asString(command).trim();
  if (!cmd) {
    throw new Error("설정 → Version Control에서 외부 diff 프로그램을 먼저 지정하세요.");
  }
  const refStr = asString(ref).trim();
  if (refStr && !/^[\w./~^@{}-]{1,255}$/.test(refStr)) {
    throw new Error("잘못된 커밋 참조입니다.");
  }

  const gitPath = rel.split(path.sep).join("/");
  const workingAbs = path.join(root, rel);
  const ext = path.extname(rel);
  const base = path.basename(rel, ext) || "file";
  const tmpDir = path.join(os.tmpdir(), "multiagent-diff");
  await fsPromises.mkdir(tmpDir, { recursive: true });
  const stamp = Date.now();
  const writeTemp = async (label, content) => {
    const safe = String(label).replace(/[^\w.-]/g, "").slice(0, 16) || "ref";
    const target = path.join(tmpDir, `${base}~${safe}~${stamp}${ext}`);
    await fsPromises.writeFile(target, content ?? "");
    return target;
  };

  const workingSide = async () => {
    if (fs.existsSync(workingAbs)) {
      const resolved = fs.realpathSync(workingAbs);
      if (!isInside(root, resolved)) throw new Error("경로가 프로젝트 밖입니다.");
      return resolved;
    }
    return writeTemp("working", "");
  };

  let localPath;
  let remotePath;
  if (refStr) {
    // File History: compare the file at <ref> against the working tree.
    const refContent = await runGit(root, ["show", `${refStr}:${gitPath}`]).catch(() => "");
    localPath = await writeTemp(refStr.slice(0, 12), refContent);
    remotePath = await workingSide();
  } else {
    const headContent = await runGit(root, ["show", `HEAD:${gitPath}`]).catch(() => "");
    localPath = await writeTemp("HEAD", headContent);
    if (staged) {
      const indexContent = await runGit(root, ["show", `:${gitPath}`]).catch(() => "");
      remotePath = await writeTemp("staged", indexContent);
    } else {
      remotePath = await workingSide();
    }
  }

  const quote = (p) =>
    process.platform === "win32" ? `"${p}"` : `'${String(p).replace(/'/g, "'\\''")}'`;
  const hasLocal = /\$\{?LOCAL\}?/.test(cmd);
  const hasRemote = /\$\{?REMOTE\}?/.test(cmd);
  let finalCmd = cmd
    .replace(/\$\{?LOCAL\}?/g, quote(localPath))
    .replace(/\$\{?REMOTE\}?/g, quote(remotePath));
  if (!hasLocal && !hasRemote) {
    finalCmd = `${finalCmd} ${quote(localPath)} ${quote(remotePath)}`;
  }

  const child = spawn(finalCmd, {
    cwd: root,
    shell: true,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", () => {});
  child.unref();
  return null;
}

// Commit history for a single file (follows renames), for the row's File
// History submenu. Each commit can then be diffed against the working tree.
async function gitFileHistory(folder, relativePath) {
  const root = fs.realpathSync(asString(folder));
  const rel = asString(relativePath).trim().replace(/^[\\/]+/, "");
  if (!rel || rel.length > 4096) throw new Error("경로가 잘못되었습니다.");
  const gitPath = rel.split(path.sep).join("/");
  let out = "";
  try {
    out = await runGit(
      root,
      ["log", "--follow", "-n", "80", "--format=%H%x1f%s%x1f%cr%x1f%an", "--", gitPath],
      10000
    );
  } catch {
    out = "";
  }
  const commits = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [hash, subject, date, author] = line.split("\x1f");
    if (hash) {
      commits.push({
        hash,
        subject: subject || "",
        date: date || "",
        author: author || "",
      });
    }
  }
  return { commits };
}

// ---- File tree write operations (context menu). All sandboxed to the
// project root; delete moves to the OS recycle bin instead of erasing.

function assertValidEntryName(name) {
  const trimmed = asString(name).trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    /[\\/:*?"<>|]/.test(trimmed) ||
    trimmed.length > 255
  ) {
    throw new Error("사용할 수 없는 이름입니다.");
  }
  return trimmed;
}

function resolveTreeWriteTarget(folder, relativePath) {
  const root = fs.realpathSync(asString(folder));
  const requested = asString(relativePath).trim().replace(/^[\\/]+/, "");
  if (!requested) throw new Error("경로가 비어 있습니다.");
  const joined = path.join(root, requested);
  const parent = path.dirname(joined);
  if (!fs.existsSync(parent)) throw new Error("상위 폴더가 없습니다.");
  const parentReal = fs.realpathSync(parent);
  if (!isInside(root, parentReal)) {
    throw new Error("프로젝트 폴더 밖은 사용할 수 없습니다.");
  }
  assertValidEntryName(path.basename(joined));
  return path.join(parentReal, path.basename(joined));
}

function resolveTreeExistingTarget(folder, relativePath) {
  const root = fs.realpathSync(asString(folder));
  const requested = asString(relativePath).trim();
  if (!requested) throw new Error("경로가 비어 있습니다.");
  const joined = path.join(root, requested);
  if (!fs.existsSync(joined)) {
    throw new Error(`경로를 찾을 수 없습니다: ${requested}`);
  }
  const resolved = fs.realpathSync(joined);
  if (!isInside(root, resolved) || resolved === root) {
    throw new Error("프로젝트 폴더 밖은 사용할 수 없습니다.");
  }
  return { root, resolved };
}

function treeRelative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

async function createFileEntry(folder, relativePath) {
  const target = resolveTreeWriteTarget(folder, relativePath);
  await fsPromises.writeFile(target, "", { flag: "wx" });
  return null;
}

async function createDirectoryEntry(folder, relativePath) {
  const target = resolveTreeWriteTarget(folder, relativePath);
  await fsPromises.mkdir(target);
  return null;
}

async function renamePathEntry(folder, relativePath, newName) {
  const { root, resolved } = resolveTreeExistingTarget(folder, relativePath);
  const name = assertValidEntryName(newName);
  const target = path.join(path.dirname(resolved), name);
  if (target === resolved) return treeRelative(root, resolved);
  if (fs.existsSync(target)) throw new Error("같은 이름이 이미 있습니다.");
  await fsPromises.rename(resolved, target);
  return treeRelative(root, target);
}

async function duplicatePathEntry(folder, relativePath) {
  const { root, resolved } = resolveTreeExistingTarget(folder, relativePath);
  const stats = await fsPromises.stat(resolved);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  const ext = stats.isDirectory() ? "" : path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let target = null;
  for (let n = 1; n < 100; n += 1) {
    const candidate = path.join(
      dir,
      `${stem} copy${n > 1 ? ` ${n}` : ""}${ext}`
    );
    if (!fs.existsSync(candidate)) {
      target = candidate;
      break;
    }
  }
  if (!target) throw new Error("복제본 이름을 만들 수 없습니다.");
  await fsPromises.cp(resolved, target, { recursive: true });
  return treeRelative(root, target);
}

async function deletePathEntry(folder, relativePath) {
  const { resolved } = resolveTreeExistingTarget(folder, relativePath);
  await shell.trashItem(resolved);
  return null;
}

async function readImageDataUrl(requested, folder) {
  const resolved = resolveExistingPath(asString(folder), requested);
  const mime = IMAGE_MIME.get(path.extname(resolved).toLowerCase());
  if (!mime) throw new Error("지원하는 이미지 파일이 아닙니다.");
  const stats = await fsPromises.stat(resolved);
  if (stats.size > MAX_IMAGE_BYTES) throw new Error("이미지 파일이 너무 큽니다.");
  const data = await fsPromises.readFile(resolved);
  return `data:${mime};base64,${data.toString("base64")}`;
}

async function openPath(target) {
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
}

async function showOpenDialog(event, args) {
  const parent = eventSenderWindow(event) ?? undefined;
  const properties = [];
  properties.push(args.directory ? "openDirectory" : "openFile");
  if (args.multiple) properties.push("multiSelections");
  const options = {
    properties,
    filters: Array.isArray(args.filters) ? args.filters : undefined,
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return args.multiple ? result.filePaths : result.filePaths[0];
}

function storageSnapshotPath() {
  return path.join(hookBaseDir, "storage-export.json");
}

function sshSecretsPath() {
  return path.join(app.getPath("userData"), "ssh-secrets.electron.json");
}

async function loadSshSecrets() {
  if (!safeStorage.isEncryptionAvailable()) return;
  try {
    const stored = JSON.parse(await fsPromises.readFile(sshSecretsPath(), "utf8"));
    for (const [hostId, encrypted] of Object.entries(asObject(stored))) {
      if (typeof encrypted !== "string") continue;
      const password = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      if (password) sshPasswords.set(hostId, password);
    }
  } catch {
    // A missing or legacy secrets file simply starts with an empty keychain.
  }
}

async function saveSshSecrets() {
  if (!safeStorage.isEncryptionAvailable()) return;
  const stored = {};
  for (const [hostId, password] of sshPasswords) {
    stored[hostId] = safeStorage.encryptString(password).toString("base64");
  }
  await fsPromises.mkdir(app.getPath("userData"), { recursive: true });
  await fsPromises.writeFile(sshSecretsPath(), JSON.stringify(stored), "utf8");
}

async function persistStorageSnapshot(snapshot) {
  const candidate = asObject(snapshot);
  const values = asObject(candidate.values);
  const cleanValues = {};
  let total = 0;
  for (const [key, value] of Object.entries(values)) {
    if (!SHARED_WORKSPACE_KEYS.has(key) || typeof value !== "string") continue;
    total += key.length + value.length;
    if (total > 50 * 1024 * 1024) throw new Error("저장소 스냅샷이 너무 큽니다.");
    cleanValues[key] = value;
  }
  const clean = {
    version: 2,
    revision: asString(candidate.revision).slice(0, 128) || `${Date.now()}-${process.pid}`,
    updatedAt: new Date().toISOString(),
    values: cleanValues,
  };
  await fsPromises.mkdir(hookBaseDir, { recursive: true });
  const target = storageSnapshotPath();
  const temporary = `${target}.${process.pid}.tmp`;
  await fsPromises.writeFile(temporary, JSON.stringify(clean), "utf8");
  try {
    await fsPromises.rename(temporary, target);
  } catch {
    await fsPromises.writeFile(target, JSON.stringify(clean), "utf8");
    await fsPromises.rm(temporary, { force: true }).catch(() => {});
  }
  return clean;
}

async function importTauriStorage() {
  try {
    const raw = await fsPromises.readFile(storageSnapshotPath(), "utf8");
    const parsed = JSON.parse(raw);
    if ((parsed?.version !== 1 && parsed?.version !== 2) || !parsed.values) return null;
    return parsed;
  } catch {
    return null;
  }
}

const terminalHandlers = createTerminalHandlers({
  terminalSessions,
  spawnPty,
  closeEverything,
});

async function invokeCommand(event, command, rawArgs) {
  const args = assertInvokeRequest(command, rawArgs);
  if (isCompanyBuild && COMPANY_DISABLED_COMMANDS.has(command)) {
    throw new Error("Company 빌드에서는 Remote와 Tunnel 기능을 사용할 수 없습니다.");
  }
  if (terminalHandlers.has(command)) {
    return terminalHandlers.invoke(event, command, args);
  }
  switch (command) {
    case "runtime_flags":
      return {
        ...(runtimeByWebContents.get(event.sender.id) ?? {
        secondary_window: false,
        open_agent_id: null,
        }),
        build_variant: runtimeVariant.id,
        remote_enabled: runtimeVariant.remoteEnabled,
      };
    case "renderer_ready": {
      const runtime = runtimeByWebContents.get(event.sender.id);
      if (runtime) runtime.ready = true;
      if (closeSmoke) console.log("[electron-smoke] renderer ready for close test");
      if (closeSmoke && eventSenderWindow(event) === mainWindow && closeSmokeStartedAt === null) {
        setTimeout(() => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          closeSmokeStartedAt = Date.now();
          mainWindow.close();
        }, 100);
      }
      return null;
    }
    case "show_main_window":
      showMainWindow();
      return null;
    case "open_new_app_window":
      createAppWindow({ secondary: true, openAgentId: asString(args.agentId) || null });
      return null;
    case "set_desktop_pet_enabled": {
      const win = ensurePetWindow();
      if (args.enabled) {
        positionPet();
        win.showInactive();
      } else {
        win.hide();
      }
      return null;
    }
    case "update_desktop_pet":
      desktopPetUpdate = asObject(args.update);
      sendEvent(petWindow, "desktop-pet:update", desktopPetUpdate);
      return null;
    case "desktop_pet_snapshot":
      return desktopPetUpdate;
    case "reset_desktop_pet_position":
      positionPet();
      sendEvent(petWindow, "desktop-pet:position-reset", null);
      return null;
    case "show_open_dialog":
      return showOpenDialog(event, args);
    case "open_external_url":
      {
        const target = new URL(asString(args.url));
        if (target.protocol !== "http:" && target.protocol !== "https:") {
          throw new Error("지원하지 않는 외부 URL scheme입니다.");
        }
        await shell.openExternal(target.href);
      }
      return null;
    case "open_local_path":
      await openPath(resolveExistingPath("", args.path));
      return null;
    case "open_folder_path":
      await openPath(resolveExistingPath(asString(args.folder), args.path));
      return null;
    case "reveal_local_path":
      shell.showItemInFolder(resolveExistingPath("", args.path));
      return null;
    case "list_markdown_files":
      return listMarkdownFiles(args.folder);
    case "read_markdown_file":
      return readMarkdownFile(args.folder, args.relativePath);
    case "resolve_markdown_path":
      return resolveDocPath(args.folder, args.path);
    case "list_directory":
      return listDirectory(args.folder, args.relative);
    case "search_files":
      return searchFiles(args.folder, args.query, args.limit);
    case "read_text_file":
      return readTextFile(args.folder, args.relativePath);
    case "read_chat_transcript":
      return readChatTranscript(args.tool, args.path);
    case "chat_blocks":
      return chatBlocksForAgent(args.id, args.sessionId);
    case "git_status":
      return gitStatusForTree(args.folder);
    case "git_changes":
      return gitChanges(args.folder);
    case "resource_usage":
      return resourceUsage();
    case "list_ports":
      return listPorts(args.projects);
    case "kill_port_process":
      return killPortProcess(args.pid, args.port);
    case "set_titlebar_overlay": {
      // Keep the native window-control overlay in sync with the app theme.
      const overlay = {
        color: asString(args.color) || DEFAULT_TITLEBAR_OVERLAY.color,
        symbolColor:
          asString(args.symbolColor) || DEFAULT_TITLEBAR_OVERLAY.symbolColor,
        height: TITLEBAR_HEIGHT,
      };
      for (const win of BrowserWindow.getAllWindows()) {
        if (win === petWindow) continue;
        try {
          win.setTitleBarOverlay(overlay);
        } catch {}
      }
      return null;
    }
    case "git_stage":
      return gitStage(args.folder, args.paths);
    case "git_unstage":
      return gitUnstage(args.folder, args.paths);
    case "git_commit":
      return gitCommit(args.folder, args.message, args.paths);
    case "git_discard":
      return gitDiscard(args.folder, args.paths);
    case "git_branches":
      return gitBranches(args.folder);
    case "git_checkout":
      return gitCheckout(args.folder, args.branch);
    case "git_diff_tool":
      return gitDiffTool(args.folder, args.relativePath, args.staged, args.command, args.ref);
    case "git_file_history":
      return gitFileHistory(args.folder, args.relativePath);
    case "create_file":
      return createFileEntry(args.folder, args.relativePath);
    case "create_directory":
      return createDirectoryEntry(args.folder, args.relativePath);
    case "rename_path":
      return renamePathEntry(args.folder, args.relativePath, args.newName);
    case "duplicate_path":
      return duplicatePathEntry(args.folder, args.relativePath);
    case "delete_path":
      return deletePathEntry(args.folder, args.relativePath);
    case "resolve_terminal_path":
      return resolveTerminalPath(asString(args.folder), asString(args.path));
    case "read_image_data_url":
      return readImageDataUrl(args.path, args.folder);
    case "play_system_sound":
      shell.beep();
      return null;
    case "clipboard_read_text":
      return clipboard.readText();
    case "clipboard_write_text":
      clipboard.writeText(asString(args.text));
      return null;
    case "save_clipboard_image": {
      // Write the current clipboard image to a temp PNG and return its path so
      // the chat/terminal composer can reference it (Codex/Claude read the file).
      const image = clipboard.readImage();
      if (!image || image.isEmpty()) return null;
      const dir = path.join(os.tmpdir(), "multiagent-pasted");
      await fsPromises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `paste-${Date.now()}.png`);
      await fsPromises.writeFile(file, image.toPNG());
      return file;
    }
    case "show_native_notification": {
      if (!Notification.isSupported()) return false;
      const notification = new Notification({
        title: asString(args.title, runtimeVariant.displayName),
        body: asString(args.body),
        silent: Boolean(args.silent),
      });
      notification.on("click", () => {
        showMainWindow();
        sendEvent(mainWindow, "native-notification:clicked", {
          notificationKey: asString(args.notificationKey),
        });
      });
      notification.show();
      return true;
    }
    case "persist_storage_snapshot":
    case "export_tauri_storage":
      return persistStorageSnapshot(args.snapshot);
    case "import_tauri_storage":
      return importTauriStorage();
    case "read_audio_file":
      return [...(await fsPromises.readFile(resolveExistingPath("", args.path)))];
    case "resolve_cli_session":
      return sessionService.resolve({
        aiToolId: args.aiToolId,
        folder: args.folder,
        preferredSessionId: args.preferredSessionId,
        agentId: args.agentId,
      });
    case "relink_cli_session":
      return sessionService.resolve({
        aiToolId: args.aiToolId,
        folder: args.folder,
        preferredSessionId: null,
        agentId: args.agentId,
      });
    case "sync_remote_agents":
      remoteService.syncAgents(args.agents);
      return null;
    case "sync_remote_view":
      remoteService.syncView(args.view);
      return null;
    case "sync_usage_catalog":
      usageIndex.syncCatalog(args.projects, args.agents);
      usageDashboard.sync({ projects: args.projects, agents: args.agents });
      return null;
    case "sync_monitor_state":
      monitorService.sync(args);
      return null;
    case "repair_active_hooks":
      return repairActiveHooks();
    case "export_diagnostics": {
      const suffix = new Date().toISOString().replace(/[:.]/g, "-");
      const options = {
        title: "MultiAgent 진단 번들 저장",
        defaultPath: path.join(
          app.getPath("documents"),
          `MultiAgent-diagnostics-${suffix}.json`
        ),
        filters: [{ name: "JSON", extensions: ["json"] }],
      };
      const parent = eventSenderWindow(event);
      const selected = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);
      if (selected.canceled || !selected.filePath) return null;
      return diagnosticsService.exportTo(selected.filePath);
    }
    case "usage_ingest_now":
      return usageIndex.ingestAll();
    case "usage_rate_limits_get":
      return usageIndex.getRateLimits(args.refresh === true);
    case "remote_config_get":
      return remoteService.config;
    case "remote_config_set":
      return remoteService.setConfig(asObject(args.config));
    case "remote_server_status":
      return remoteService.status();
    case "start_remote_server":
      return remoteService.start();
    case "stop_remote_server":
      return remoteService.stop();
    case "tunnel_status":
      return tunnelService.status();
    case "start_tunnel":
      if (!remoteService.status().running) await remoteService.start();
      return tunnelService.start();
    case "stop_tunnel":
      return tunnelService.stop();
    case "remote_access_list":
      return remoteService.accessList();
    case "remote_access_approve":
      return remoteService.approve(asString(args.login));
    case "remote_access_revoke":
      return remoteService.revoke(asString(args.login));
    case "monitor_config_get":
      return monitorService.config;
    case "monitor_config_set":
      return monitorService.setConfig(asObject(args.config));
    case "monitor_server_status":
      return monitorService.status();
    case "start_monitor_server":
      return monitorService.start();
    case "stop_monitor_server":
      return monitorService.stop();
    case "usage_config_get":
      return usageDashboard.config;
    case "usage_config_set":
      return usageDashboard.setConfig(asObject(args.config));
    case "usage_server_status":
      return usageDashboard.status();
    case "start_usage_server":
      return usageDashboard.start();
    case "stop_usage_server":
      return usageDashboard.stop();
    case "ssh_password_set":
      sshPasswords.set(asString(args.hostId), asString(args.password));
      await saveSshSecrets();
      return null;
    case "ssh_password_clear":
      sshPasswords.delete(asString(args.hostId));
      await saveSshSecrets();
      return null;
    case "ssh_password_has":
      return sshPasswords.has(asString(args.hostId));
    case "ssh_test":
      {
        const ssh = asObject(args.ssh);
        if (ssh.authMethod === "password") {
          return testPasswordSshConnection(
            ssh,
            asString(ssh.password) || sshPasswords.get(asString(ssh.hostId))
          );
        }
        return testSshConnection(ssh);
      }
    case "get_ssh_public_key":
      return readPublicKey();
    case "generate_ssh_key":
      return generateSshKey();
    case "check_for_update":
      return checkForElectronUpdate();
    case "download_and_install_update":
      return downloadElectronUpdate();
    case "relaunch":
      if (updateDownloaded) {
        forceClosing = true;
        updaterLifecycle.record("install-requested");
        updaterLifecycle.armInstallWatchdog();
        try {
          autoUpdater.quitAndInstall(false, true);
          return null;
        } catch (error) {
          updaterLifecycle.clearInstallWatchdog();
          updaterLifecycle.record("install-launch-failed", error);
          forceClosing = false;
          throw error;
        }
      }
      updaterLifecycle.record("relaunch-requested");
      app.relaunch();
      closeEverything();
      return null;
    default:
      throw new Error(`Electron에서 아직 지원하지 않는 command: ${command}`);
  }
}

ipcMain.handle("multiagent:invoke", (event, command, args) => {
  assertTrustedSender(event);
  return invokeCommand(event, asString(command), args);
});

ipcMain.handle("multiagent:window", (event, operation, value) => {
  assertTrustedSender(event);
  const win = eventSenderWindow(event);
  if (!win) throw new Error("현재 Electron 창을 찾을 수 없습니다.");
  switch (operation) {
    case "setAlwaysOnTop":
      win.setAlwaysOnTop(Boolean(value));
      return null;
    case "isFocused":
      return win.isFocused();
    case "requestUserAttention":
      win.flashFrame(true);
      return null;
    default:
      throw new Error(`지원하지 않는 window operation: ${operation}`);
  }
});

ipcMain.on("multiagent:emit", (_event, eventName, payload) => {
  assertTrustedSender(_event);
  const name = asString(eventName);
  assertAllowed(emittedSet, name, "event emission");
  sendEventToAll(name, payload);
});

app.on("before-quit", () => {
  forceClosing = true;
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  updaterLifecycle.clearInstallWatchdog();
  if (hookMaintenanceTimer) {
    clearInterval(hookMaintenanceTimer);
    hookMaintenanceTimer = null;
  }
  terminalSessions.closeAll("app-quit");
  void hookService.stop();
  void monitorService.stop();
  void usageDashboard.stop();
  usageIndex.close();
  void remoteService.stop();
  void tunnelService.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createAppWindow();
  } else {
    showMainWindow();
  }
});

console.log(
  `[electron] boot ${app.getVersion()} variant=${runtimeVariant.id} devUrl=${devUrl ?? "production"}`
);
void app.whenReady().then(async () => {
  console.log("[electron] ready");
  // Custom top bar replaces the native File/Edit/View/Window menu.
  Menu.setApplicationMenu(null);
  if (!bridgeSmoke) {
    try { createTray(); } catch (error) { console.warn("[electron] tray init failed", error); }
  }
  hookReady = hookService.start().catch((error) => {
    console.error("[electron] hook service failed to start", error);
    throw error;
  });
  await hookReady.catch(() => {});
  hookMaintenanceTimer = setInterval(async () => {
    if (forceClosing) return;
    await maintainActiveHooks();
  }, 60_000);
  hookMaintenanceTimer.unref?.();
  await loadSshSecrets();
  if (monitorService.config.enabled) await monitorService.start().catch(console.error);
  if (usageDashboard.config.enabled) await usageDashboard.start().catch(console.error);
  mainWindow = createAppWindow();
  console.log(`[electron] main window created id=${mainWindow.id}`);
  if (bridgeSmoke) {
    mainWindow.webContents.once("did-finish-load", async () => {
      const id = "electron-bridge-smoke";
      const marker = "MULTIAGENT_ELECTRON_BRIDGE_OK";
      try {
        await mainWindow.webContents.executeJavaScript(`
          new Promise(async (resolve, reject) => {
            const id = ${JSON.stringify(id)};
            const marker = ${JSON.stringify(marker)};
            let output = "";
            const timeout = setTimeout(
              () => reject(new Error("bridge PTY timeout; output=" + JSON.stringify(output.slice(-500)))),
              8000
            );
            const unlisten = window.multiAgentElectron.onEvent("pty:data", (payload) => {
              if (payload?.id !== id) return;
              output += payload.data ?? "";
              if (!output.includes(marker)) return;
              clearTimeout(timeout);
              unlisten();
              window.multiAgentElectron.invoke("kill_pty", { id }).finally(() => resolve(true));
            });
            try {
              await window.multiAgentElectron.invoke("spawn_pty", {
                id,
                shell: null,
                cwd: ${JSON.stringify(os.homedir())},
                initCommand: null,
                aiToolId: "shell",
                ssh: null,
                cols: 80,
                rows: 24
              });
              const replay = await window.multiAgentElectron.invoke("attach_terminal", {
                id,
                afterSequence: 0
              });
              output += replay?.data ?? "";
              await window.multiAgentElectron.invoke("write_pty", {
                id,
                data: "echo " + marker + "\\r"
              });
            } catch (error) {
              clearTimeout(timeout);
              unlisten();
              reject(error);
            }
          })
        `);
        console.log(`[electron-smoke] ${marker}`);
        closeEverything();
      } catch (error) {
        console.error("[electron-smoke] bridge failed", error);
        forceClosing = true;
        for (const ptyId of [...ptys.keys()]) closePty(ptyId);
        app.exit(1);
      }
    });
  }
  if (securitySmoke) {
    mainWindow.webContents.once("did-finish-load", async () => {
      const original = mainWindow.webContents.getURL();
      await mainWindow.webContents.executeJavaScript(
        `location.href = "data:text/html,<h1>untrusted</h1>"; true`
      );
      setTimeout(async () => {
        const current = mainWindow.webContents.getURL();
        const bridgePresent = await mainWindow.webContents
          .executeJavaScript("Boolean(window.multiAgentElectron)")
          .catch(() => false);
        if (current === original && bridgePresent) {
          console.log("[electron-smoke] MULTIAGENT_ELECTRON_SECURITY_OK");
          closeEverything();
        } else {
          console.error(`[electron-smoke] security failure original=${original} current=${current} bridge=${bridgePresent}`);
          app.exit(1);
        }
      }, 300);
    });
  }
});
