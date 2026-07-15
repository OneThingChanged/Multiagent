import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  shell,
} from "electron";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as nodePty from "node-pty";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const devUrl = process.env.MULTIAGENT_DEV_URL?.trim() || null;
const bridgeSmoke = process.env.MULTIAGENT_ELECTRON_BRIDGE_SMOKE === "1";
const iconPath = path.join(appRoot, "src-tauri", "icons", "icon.ico");
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
/** @type {Map<number, {secondary_window: boolean, open_agent_id: string | null}>} */
const runtimeByWebContents = new Map();
/** @type {Map<string, {process: import('node-pty').IPty, initTimer: NodeJS.Timeout | null}>} */
const ptys = new Map();
/** @type {Map<string, string>} */
const sshPasswords = new Map();
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
let remoteConfig = {
  client_id: "",
  owner: "",
  tunnel_token: "",
  public_hostname: "",
  server_port: 0,
  client_secret: "",
};
let monitorConfig = { enabled: false, serverPort: 4421 };

app.setName("MultiAgent Electron");
const userDataOverride = process.env.MULTIAGENT_ELECTRON_USER_DATA?.trim();
if (userDataOverride) app.setPath("userData", userDataOverride);
if (process.platform === "win32") {
  app.setAppUserModelId("com.jintae.multiagent.electron");
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
      sandbox: false,
    },
  });

  runtimeByWebContents.set(win.webContents.id, {
    secondary_window: secondary,
    open_agent_id: openAgentId,
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  const webContentsId = win.webContents.id;
  win.webContents.on("destroyed", () => {
    runtimeByWebContents.delete(webContentsId);
  });
  if (!bridgeSmoke) win.once("ready-to-show", () => win.show());

  if (!secondary) {
    win.on("close", (event) => {
      if (forceClosing) return;
      event.preventDefault();
      sendEvent(win, "app:close-requested");
      if (closeFallback) clearTimeout(closeFallback);
      closeFallback = setTimeout(() => closeEverything(), 5000);
    });
  }

  void loadRenderer(win, {
    secondaryWindow: secondary ? "1" : null,
    openAgentId,
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
      sandbox: false,
    },
  });
  const petWebContentsId = petWindow.webContents.id;
  runtimeByWebContents.set(petWebContentsId, {
    secondary_window: true,
    open_agent_id: null,
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
  try {
    entry.process.kill();
  } catch {
    // The child may already have exited.
  }
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

function spawnPty(args) {
  const id = asString(args.id).trim();
  if (!id) throw new Error("PTY id가 비어 있습니다.");
  if (args.ssh) {
    throw new Error("Electron prototype의 SSH PTY는 아직 연결되지 않았습니다.");
  }
  closePty(id);

  const executable = defaultShell(asString(args.shell).trim() || null);
  const lower = path.basename(executable).toLowerCase();
  const shellArgs = lower.includes("powershell") || lower === "pwsh.exe" ? ["-NoLogo"] : [];
  const requestedCwd = asString(args.cwd).trim();
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  const isPackagedVirtualPath =
    requestedCwd.endsWith(`${path.sep}app.asar`) || requestedCwd.includes(asarSegment);
  const cwd =
    requestedCwd && !isPackagedVirtualPath && fs.existsSync(requestedCwd)
      ? requestedCwd
      : os.homedir();
  const processHandle = nodePty.spawn(executable, shellArgs, {
    name: "xterm-256color",
    cols: asPositiveInt(args.cols, 120),
    rows: asPositiveInt(args.rows, 30),
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      MULTIAGENT_AGENT_ID: id,
    },
    useConpty: true,
  });
  const entry = { process: processHandle, initTimer: null };
  ptys.set(id, entry);

  processHandle.onData((data) => {
    sendEventToAll("pty:data", { id, data });
  });
  processHandle.onExit(({ exitCode }) => {
    const current = ptys.get(id);
    if (current?.process === processHandle) ptys.delete(id);
    sendEventToAll("pty:exit", { id, exitCode });
  });

  const initCommand = asString(args.initCommand).trim();
  if (initCommand) {
    entry.initTimer = setTimeout(() => {
      entry.initTimer = null;
      if (ptys.get(id)?.process !== processHandle) return;
      processHandle.write(`${initCommand}\r`);
    }, 600);
  }
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

async function invokeCommand(event, command, rawArgs) {
  const args = asObject(rawArgs);
  switch (command) {
    case "runtime_flags":
      return runtimeByWebContents.get(event.sender.id) ?? {
        secondary_window: false,
        open_agent_id: null,
      };
    case "spawn_pty":
      spawnPty(args);
      return null;
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
      await shell.openExternal(asString(args.url));
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
    case "read_image_data_url":
      return readImageDataUrl(args.path, args.folder);
    case "play_system_sound":
      shell.beep();
      return null;
    case "read_audio_file":
      return [...(await fsPromises.readFile(resolveExistingPath("", args.path)))];
    case "resolve_cli_session":
      return asString(args.preferredSessionId).trim() || null;
    case "relink_cli_session":
      return null;
    case "sync_remote_agents":
    case "sync_remote_view":
    case "sync_usage_catalog":
    case "sync_monitor_state":
      return null;
    case "repair_active_hooks":
      return {
        activeSessions: ptys.size,
        supportedSessions: 0,
        repaired: 0,
        alreadyHealthy: 0,
        skipped: ptys.size,
        restartRequired: 0,
        serverRestarted: false,
        failures: [],
      };
    case "usage_ingest_now":
      return { files: 0, events: 0, errors: ["Electron prototype: usage ingest 미연결"] };
    case "remote_config_get":
      return remoteConfig;
    case "remote_config_set":
      remoteConfig = { ...remoteConfig, ...asObject(args.config) };
      return remoteConfig;
    case "remote_server_status":
    case "start_remote_server":
    case "stop_remote_server":
      return { running: false, url: null, port: null };
    case "tunnel_status":
    case "start_tunnel":
    case "stop_tunnel":
      return { running: false, publicUrl: null };
    case "remote_access_list":
    case "remote_access_approve":
    case "remote_access_revoke":
      return { pending: [], approved: [] };
    case "monitor_config_get":
      return monitorConfig;
    case "monitor_config_set":
      monitorConfig = { ...monitorConfig, ...asObject(args.config) };
      return monitorConfig;
    case "monitor_server_status":
    case "start_monitor_server":
    case "stop_monitor_server":
      return { running: false, url: null, port: null };
    case "ssh_password_set":
      sshPasswords.set(asString(args.hostId), asString(args.password));
      return null;
    case "ssh_password_clear":
      sshPasswords.delete(asString(args.hostId));
      return null;
    case "ssh_password_has":
      return sshPasswords.has(asString(args.hostId));
    case "ssh_test":
      throw new Error("Electron prototype의 SSH 연결은 아직 구현되지 않았습니다.");
    case "get_ssh_public_key": {
      for (const name of ["id_ed25519.pub", "id_rsa.pub"]) {
        const candidate = path.join(os.homedir(), ".ssh", name);
        if (fs.existsSync(candidate)) return fsPromises.readFile(candidate, "utf8");
      }
      return null;
    }
    case "generate_ssh_key":
      throw new Error("Electron prototype에서는 ssh-keygen을 직접 실행해주세요.");
    case "relaunch":
      app.relaunch();
      closeEverything();
      return null;
    default:
      throw new Error(`Electron에서 아직 지원하지 않는 command: ${command}`);
  }
}

ipcMain.handle("multiagent:invoke", (event, command, args) =>
  invokeCommand(event, asString(command), args)
);

ipcMain.handle("multiagent:window", (event, operation, value) => {
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
  const name = asString(eventName);
  if (!name) return;
  sendEventToAll(name, payload);
});

app.on("before-quit", () => {
  forceClosing = true;
  for (const id of [...ptys.keys()]) closePty(id);
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
void app.whenReady().then(() => {
  console.log("[electron] ready");
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
});
