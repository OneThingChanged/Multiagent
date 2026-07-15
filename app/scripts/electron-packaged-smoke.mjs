import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const executable = path.join(
  appRoot,
  "electron-dist",
  "win-unpacked",
  "MultiAgent Electron.exe"
);
const marker = "MULTIAGENT_ELECTRON_BRIDGE_OK";

if (!fs.existsSync(executable)) {
  console.error("Packaged Electron executable is missing. Run npm run electron:pack first.");
  process.exit(1);
}

const userDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "multiagent-electron-packaged-smoke-")
);
const env = {
  ...process.env,
  MULTIAGENT_ELECTRON_BRIDGE_SMOKE: "1",
  MULTIAGENT_ELECTRON_USER_DATA: userDataDir,
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
  if (output.includes(marker)) finish(0);
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  if (!finished) finish(code ?? 1);
});

const timeout = setTimeout(() => {
  console.error("Packaged Electron bridge smoke test timed out.");
  finish(1);
}, 20000);
