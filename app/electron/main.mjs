import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  safeStorage,
  screen,
  shell,
} from "electron";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodePty from "node-pty";
import electronUpdater from "electron-updater";
import { HookService } from "./services/hook-service.mjs";
import { SessionService } from "./services/session-service.mjs";
import {
  BoundedTerminalBuffer,
  CodexScrollbackFilter,
  PassThroughTerminalFilter,
} from "./services/terminal-stream.mjs";
import {
  buildInteractiveSshArgs,
  findWindowsExecutable,
  generateSshKey,
  readPublicKey,
  sshConnectionArgs,
  testSshConnection,
} from "./services/ssh-service.mjs";
import { resolveTerminalPath } from "./services/terminal-path-service.mjs";
import {
  LocalDashboardService,
  RemoteDashboardService,
  TunnelService,
} from "./services/web-services.mjs";
import { UsageService } from "./services/usage-service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const devUrl = process.env.MULTIAGENT_DEV_URL?.trim() || null;
const bridgeSmoke = process.env.MULTIAGENT_ELECTRON_BRIDGE_SMOKE === "1";
const closeSmoke = process.env.MULTIAGENT_ELECTRON_CLOSE_SMOKE === "1";
const securitySmoke = process.env.MULTIAGENT_ELECTRON_SECURITY_SMOKE === "1";
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
const SKIPPED_DOC_DIRS = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "build",
  ".next",
  ".cache",
]);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let petWindow = null;
let forceClosing = false;
let closeFallback = null;
let closeSmokeStartedAt = null;
/** @type {Map<number, {secondary_window: boolean, open_agent_id: string | null, ready: boolean}>} */
const runtimeByWebContents = new Map();
/** @type {Map<string, {id: string, name: string, process: import('node-pty').IPty, initTimer: NodeJS.Timeout | null, aiToolId: string, cwd: string | null, ssh: unknown, filter: CodexScrollbackFilter | PassThroughTerminalFilter, buffer: BoundedTerminalBuffer}>} */
const ptys = new Map();
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

app.setName("MultiAgent Electron");
const userDataOverride = process.env.MULTIAGENT_ELECTRON_USER_DATA?.trim();
if (userDataOverride) app.setPath("userData", userDataOverride);
if (process.platform === "win32") {
  app.setAppUserModelId("com.jintae.multiagent.electron");
}
const sessionService = new SessionService(app.getPath("userData"));
const hookBaseDir = process.env.MULTIAGENT_LOCAL_DATA?.trim() || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "com.jintae.multiagent"
);
const hookService = new HookService({
  baseDir: hookBaseDir,
  sendEvent(eventName, payload) {
    if (eventName === "agent:hook-event" && payload?.id) {
      monitorHooks.set(payload.id, { ...payload, lastTs: Date.now() });
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
    }
    sendEventToAll(eventName, payload);
  },
  sessionService,
});
let hookReady = null;

function liveOutputForAgents(agents) {
  return (Array.isArray(agents) ? agents : []).map((agent) => ({
    ...agent,
    output: ptys.get(agent.id)?.buffer.snapshot().slice(-80_000) ?? "",
    hook: monitorHooks.get(agent.id) ?? null,
  }));
}

const usageIndex = new UsageService(path.join(hookBaseDir, "usage.db"), sessionService);
let monitorService;
monitorService = new LocalDashboardService({
  title: "MultiAgent Monitor",
  defaultPort: 4421,
  baseDir: hookBaseDir,
  configName: "monitor-config.json",
  stateProvider: () => ({
    agents: liveOutputForAgents(monitorService.state.agents),
    usage: usageIndex.dashboardSummary(),
  }),
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
  stateProvider: () => ({ agents: liveOutputForAgents(remoteService.agents) }),
  writePty(id, data) {
    if (!id || data.length > 64 * 1024) return;
    ptys.get(id)?.process.write(data);
  },
  requestAccess(login) {
    sendEventToAll("remote:access-request", { login });
  },
});
const tunnelService = new TunnelService({
  baseDir: hookBaseDir,
  getConfig: () => remoteService.config,
  getLocalUrl: () => remoteService.status().url,
});
const { autoUpdater } = electronUpdater;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
const electronTestUpdateFeed =
  "https://github.com/OneThingChanged/Multiagent/releases/download/electron-test/";
let updateDownloaded = false;

async function checkForElectronUpdate() {
  if (!app.isPackaged && !process.env.MULTIAGENT_UPDATE_FEED_URL) return null;
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
  const result = await autoUpdater.checkForUpdates();
  if (!result?.updateInfo) return null;
  if (result.updateInfo.version === app.getVersion()) return null;
  return {
    version: result.updateInfo.version,
    releaseDate: result.updateInfo.releaseDate,
    releaseName: result.updateInfo.releaseName ?? null,
  };
}

async function downloadElectronUpdate() {
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
    await autoUpdater.downloadUpdate();
    updateDownloaded = true;
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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  runtimeByWebContents.set(win.webContents.id, {
    secondary_window: secondary,
    open_agent_id: openAgentId,
    ready: false,
  });
  installNavigationPolicy(win);
  const webContentsId = win.webContents.id;
  win.webContents.on("destroyed", () => {
    runtimeByWebContents.delete(webContentsId);
  });
  if (!bridgeSmoke) win.once("ready-to-show", () => win.show());

  if (!secondary) {
    win.on("close", (event) => {
      if (forceClosing) return;
      event.preventDefault();
      const runtime = runtimeByWebContents.get(win.webContents.id);
      if (!runtime?.ready) {
        closeEverything();
        return;
      }
      sendEvent(win, "app:close-requested");
      if (closeFallback) clearTimeout(closeFallback);
      closeFallback = setTimeout(() => closeEverything(), 5000);
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
    runtimeByWebContents.delete(petWebContentsId);
    petWindow = null;
  });
  petWindow.once("ready-to-show", positionPet);
  void loadRenderer(petWindow, { desktopPet: "1" });
  positionPet();
  return petWindow;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function closePty(id) {
  const entry = ptys.get(id);
  if (!entry) return;
  ptys.delete(id);
  if (entry.initTimer) clearTimeout(entry.initTimer);
  if (entry.ssh?.reversePort) remotePorts.delete(entry.ssh.reversePort);
  try {
    entry.process.kill();
  } catch {
    // The child may already have exited.
  }
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
  for (const id of [...ptys.keys()]) closePty(id);
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
  const existing = ptys.get(id);
  if (existing) {
    const snapshot = existing.buffer.snapshot();
    if (snapshot) sendEvent(eventSenderWindow(event), "pty:data", { id, data: snapshot });
    return { reattached: true };
  }

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
    buffer: new BoundedTerminalBuffer(),
  };
  ptys.set(id, entry);

  processHandle.onData((data) => {
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
    const visibleData = entry.filter.push(data);
    if (!visibleData) return;
    entry.buffer.append(visibleData);
    sendEventToAll("pty:data", { id, data: visibleData });
  });
  processHandle.onExit(({ exitCode }) => {
    const remaining = entry.filter.finish();
    if (remaining) {
      entry.buffer.append(remaining);
      sendEventToAll("pty:data", { id, data: remaining });
    }
    const current = ptys.get(id);
    if (current?.process === processHandle) ptys.delete(id);
    sendEventToAll("pty:exit", { id, exitCode });
  });

  const initCommand = ssh ? "" : asString(args.initCommand).trim();
  if (initCommand) {
    entry.initTimer = setTimeout(() => {
      entry.initTimer = null;
      if (ptys.get(id)?.process !== processHandle) return;
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
    if (!key.startsWith("multiagent.") || typeof value !== "string") continue;
    total += key.length + value.length;
    if (total > 50 * 1024 * 1024) throw new Error("저장소 스냅샷이 너무 큽니다.");
    cleanValues[key] = value;
  }
  const clean = {
    version: 1,
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
    if (parsed?.version !== 1 || !parsed.values) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function invokeCommand(event, command, rawArgs) {
  const args = asObject(rawArgs);
  switch (command) {
    case "runtime_flags":
      return runtimeByWebContents.get(event.sender.id) ?? {
        secondary_window: false,
        open_agent_id: null,
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
    case "spawn_pty":
      return spawnPty(args, event);
    case "write_pty": {
      const entry = ptys.get(asString(args.id));
      if (!entry) throw new Error("활성 PTY를 찾을 수 없습니다.");
      entry.process.write(asString(args.data));
      return null;
    }
    case "resize_pty": {
      const entry = ptys.get(asString(args.id));
      if (entry) {
        entry.process.resize(
          asPositiveInt(args.cols, entry.process.cols),
          asPositiveInt(args.rows, entry.process.rows)
        );
      }
      return null;
    }
    case "kill_pty":
      closePty(asString(args.id));
      return null;
    case "confirm_close":
      closeEverything();
      return null;
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
    case "show_native_notification": {
      if (!Notification.isSupported()) return false;
      const notification = new Notification({
        title: asString(args.title, "MultiAgent"),
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
      return hookService.repair([...ptys.values()]);
    case "usage_ingest_now":
      return usageIndex.ingestAll();
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
        autoUpdater.quitAndInstall(false, true);
        return null;
      }
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
  if (!name) return;
  sendEventToAll(name, payload);
});

app.on("before-quit", () => {
  forceClosing = true;
  for (const id of [...ptys.keys()]) closePty(id);
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

console.log(`[electron] boot ${app.getVersion()} devUrl=${devUrl ?? "production"}`);
void app.whenReady().then(async () => {
  console.log("[electron] ready");
  hookReady = hookService.start().catch((error) => {
    console.error("[electron] hook service failed to start", error);
    throw error;
  });
  await hookReady.catch(() => {});
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
            const timeout = setTimeout(() => reject(new Error("bridge PTY timeout")), 8000);
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
