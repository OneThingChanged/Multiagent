import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as nodePty from "node-pty";

const marker = "MULTIAGENT_ELECTRON_WINPTY_OK";

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

function resolvePowerShell() {
  const candidates = [
    path.join(
      process.env.ProgramW6432 || "C:\\Program Files",
      "PowerShell",
      "7",
      "pwsh.exe",
    ),
    findExecutableOnPath("pwsh.exe"),
    path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
  ];
  return candidates.find(
    (candidate) => typeof candidate === "string" && fs.existsSync(candidate),
  );
}

void app.whenReady().then(() => {
  if (process.platform !== "win32") {
    console.log("[electron-smoke] WinPTY skipped outside Windows");
    app.exit(0);
    return;
  }

  const executable = resolvePowerShell();
  if (!executable) {
    console.error("[electron-smoke] PowerShell not found");
    app.exit(1);
    return;
  }

  const terminal = nodePty.spawn(executable, ["-NoLogo"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
    useConpty: false,
  });
  let output = "";
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    console.error("[electron-smoke] WinPTY timed out");
    app.exit(1);
  }, 10_000);

  terminal.onData((data) => {
    output += data;
  });
  terminal.onExit(({ exitCode }) => {
    clearTimeout(timeout);
    const ok = !timedOut && exitCode === 0 && output.includes(marker);
    console.log(
      `[electron-smoke] ${marker} output=${output.includes(marker)} exit=${exitCode}`,
    );
    app.exit(ok ? 0 : 1);
  });
  terminal.write(`Write-Output '${marker}'; exit\r`);
});
