import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as nodePty from "node-pty";

const marker = "MULTIAGENT_ELECTRON_PTY_OK";

function findExecutableOnPath(name) {
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

function resolveShell() {
  const candidates = [
    path.join(process.env.ProgramW6432 || "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
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
  return candidates.find(
    (candidate) => typeof candidate === "string" && fs.existsSync(candidate)
  );
}

void app.whenReady().then(() => {
  const executable = resolveShell();
  if (!executable) {
    console.error("[electron-smoke] shell not found");
    app.exit(1);
    return;
  }

  const args = path.basename(executable).toLowerCase().includes("powershell") ||
      path.basename(executable).toLowerCase() === "pwsh.exe"
    ? ["-NoLogo"]
    : [];
  const terminal = nodePty.spawn(executable, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
    useConpty: true,
  });
  let output = "";
  const timeout = setTimeout(() => {
    console.error("[electron-smoke] PTY timed out");
    try {
      terminal.kill();
    } catch {}
    app.exit(1);
  }, 8000);

  terminal.onData((data) => {
    output += data;
    if (!output.includes(marker)) return;
    clearTimeout(timeout);
    console.log(`[electron-smoke] ${marker}`);
    try {
      terminal.kill();
    } catch {}
    app.exit(0);
  });
  terminal.write(`echo ${marker}\r`);
});
