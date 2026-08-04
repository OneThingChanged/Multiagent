import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");
const company = process.argv.includes("--company");
const executable = path.join(
  appRoot,
  "electron-dist",
  ...(company ? ["company"] : []),
  "win-unpacked",
  company ? "MultiAgentCompany Electron.exe" : "MultiAgent Electron.exe"
);
const marker = "MULTIAGENT_ELECTRON_BRIDGE_OK";
const variantMarker = `variant=${company ? "company" : "standard"}`;

if (!fs.existsSync(executable)) {
  console.error("Packaged Electron executable is missing. Run npm run electron:pack first.");
  process.exit(1);
}

const asarPath = path.join(path.dirname(executable), "resources", "app.asar");
const asarEntries = new Set(listPackage(asarPath).map((entry) => entry.replaceAll("/", "\\")));
for (const entry of [
  "\\electron\\remote-pwa\\index.html",
  "\\electron\\remote-pwa\\app.js",
  "\\electron\\remote-pwa\\styles.css",
  "\\electron\\remote-pwa\\vendor\\xterm.js",
]) {
  if (!asarEntries.has(entry)) {
    console.error(`Packaged Dashboard asset is missing: ${entry}`);
    process.exit(1);
  }
}
const apkEntry = "\\electron\\remote-pwa\\downloads\\MultiAgent-Mobile.apk";
if (company && asarEntries.has(apkEntry)) {
  console.error("Company package unexpectedly contains the Remote APK.");
  process.exit(1);
}
if (!company && !asarEntries.has(apkEntry)) {
  console.error("Standard package is missing the Remote APK.");
  process.exit(1);
}

const userDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "multiagent-electron-packaged-smoke-")
);
const localDataDir = path.join(userDataDir, "local-data");
fs.mkdirSync(localDataDir, { recursive: true });
const monitorPort = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
fs.writeFileSync(
  path.join(localDataDir, "monitor-config.json"),
  JSON.stringify({ enabled: true, serverPort: monitorPort }),
  "utf8",
);
const env = {
  ...process.env,
  MULTIAGENT_ELECTRON_BRIDGE_SMOKE: "1",
  MULTIAGENT_ELECTRON_USER_DATA: userDataDir,
  MULTIAGENT_LOCAL_DATA: localDataDir,
  MULTIAGENT_MONITOR_PORT: String(monitorPort),
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(executable, [], {
  cwd: path.dirname(executable),
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
let finished = false;
let bridgeReady = false;
let dashboardReady = false;

function finishWhenReady() {
  if (bridgeReady && dashboardReady) {
    finish(0, `[electron-smoke] PACKAGED_DASHBOARD_OK port=${monitorPort}`);
  }
}

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (!child.killed) child.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    // Chromium can release cache files just after process exit.
  }
  if (message) console.log(message);
  process.exitCode = code;
}

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
  if (output.includes(marker) && output.includes(variantMarker)) {
    bridgeReady = true;
    finishWhenReady();
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  if (!finished) {
    finish(
      bridgeReady && dashboardReady ? 0 : 1,
      `Packaged Electron exited before verification completed (bridge=${bridgeReady}, dashboard=${dashboardReady}, code=${code}).`,
    );
  }
});

void (async () => {
  while (!finished && !dashboardReady) {
    try {
      const response = await fetch(`http://127.0.0.1:${monitorPort}/`, {
        signal: AbortSignal.timeout(800),
      });
      const html = response.ok ? await response.text() : "";
      if (html.includes('class="app-shell"') && html.includes("/pwa/app.js")) {
        dashboardReady = true;
        finishWhenReady();
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
})();

const timeout = setTimeout(() => {
  console.error("Packaged Electron bridge smoke test timed out.");
  finish(1);
}, 20000);
