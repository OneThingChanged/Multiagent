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

function cleanup() {
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

first.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
  if (!second && text.includes("[electron] main window created")) {
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
});
first.stderr.on("data", (chunk) => {
  output += chunk.toString();
  process.stderr.write(chunk);
});
first.on("exit", (code) => {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  const mainWindowCreations =
    output.match(/\[electron\] main window created/g)?.length ?? 0;
  if (code === 0 && output.includes(marker) && mainWindowCreations === 1) {
    console.log("[electron-smoke] single-instance smoke passed");
  } else {
    process.exitCode = 1;
    console.error(
      `single-instance smoke failed (${code}, mainWindows=${mainWindowCreations})\n${output}`
    );
  }
  cleanup();
});
