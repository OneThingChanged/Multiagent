import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const devUrl = process.env.MULTIAGENT_DEV_URL || "http://127.0.0.1:4420";
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const viteBin = path.join(
  path.dirname(require.resolve("vite/package.json")),
  "bin",
  "vite.js"
);
let vite = null;
let electron = null;
let stopping = false;

async function serverReady() {
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await serverReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Vite dev server did not become ready: ${devUrl}`);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exitCode = code;
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

if (!(await serverReady())) {
  vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1"], {
    cwd: appRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  vite.once("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}

try {
  await waitForServer();
  electron = spawn(electronPath, [path.join(appRoot, "electron", "main.mjs")], {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      MULTIAGENT_DEV_URL: devUrl,
    },
    windowsHide: true,
  });
  electron.once("exit", (code) => stop(code ?? 0));
} catch (error) {
  console.error(error);
  stop(1);
}
