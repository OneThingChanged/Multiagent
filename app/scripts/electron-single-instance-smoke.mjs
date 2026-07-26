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
const mainPath = path.join(appRoot, "electron", "main.mjs");
const userData = fs.mkdtempSync(
  path.join(os.tmpdir(), "multiagent-single-instance-")
);
const marker = "MULTIAGENT_ELECTRON_SINGLE_INSTANCE_OK";
const env = {
  ...process.env,
  MULTIAGENT_ELECTRON_SINGLE_INSTANCE_SMOKE: "1",
  MULTIAGENT_ELECTRON_USER_DATA: userData,
  MULTIAGENT_LOCAL_DATA: path.join(userData, "local-data"),
};
delete env.ELECTRON_RUN_AS_NODE;

function launch() {
  return spawn(electronPath, [mainPath], {
    cwd: appRoot,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const first = launch();
let second = null;
let output = "";
let settled = false;
let successTimer = null;

function cleanup() {
  if (successTimer) clearTimeout(successTimer);
  if (second && !second.killed) second.kill();
  if (!first.killed) first.kill();
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {}
}

const timeout = setTimeout(() => {
  if (settled) return;
  settled = true;
  cleanup();
  console.error(`single-instance smoke timeout\n${output}`);
  process.exitCode = 1;
}, 15_000);

function finish(code) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  const mainWindowCreations =
    output.match(/\[electron\] workspace window created/g)?.length ?? 0;
  if (code === 0 && output.includes(marker) && mainWindowCreations === 1) {
    console.log("[electron-smoke] single-instance smoke passed");
  } else {
    process.exitCode = 1;
    console.error(
      `single-instance smoke failed (${code}, mainWindows=${mainWindowCreations})\n${output}`
    );
  }
  cleanup();
}

first.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
  if (!second && text.includes("[electron] workspace window created")) {
    second = launch();
    second.stdout.on("data", (part) => {
      output += part.toString();
      process.stdout.write(part);
    });
    second.stderr.on("data", (part) => {
      output += part.toString();
      process.stderr.write(part);
    });
  }
  if (text.includes(marker) && !successTimer) {
    // The marker proves the owner received the second-instance event. Give the
    // losing process a moment to finish, then let the harness own teardown so
    // the assertion does not depend on Electron's asynchronous quit timing.
    successTimer = setTimeout(() => finish(0), 1_000);
  }
});
first.stderr.on("data", (chunk) => {
  output += chunk.toString();
  process.stderr.write(chunk);
});
first.on("exit", (code) => {
  finish(code ?? 1);
});
