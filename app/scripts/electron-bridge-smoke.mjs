import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const marker = "MULTIAGENT_MIRACONTROL_BRIDGE_OK";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-electron-smoke-"));
const env = {
  ...process.env,
  MULTIAGENT_ELECTRON_BRIDGE_SMOKE: "1",
  MULTIAGENT_ELECTRON_USER_DATA: userDataDir,
  MULTIAGENT_LOCAL_DATA: path.join(userDataDir, "local-data"),
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
  electronPath,
  [path.join(appRoot, "electron", "main.mjs")],
  {
    cwd: appRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }
);
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
    // Chromium may still be releasing a cache file; the OS temp cleaner can reap it.
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
  console.error("Electron bridge smoke test timed out.");
  finish(1);
}, 15000);
