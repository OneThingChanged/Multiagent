import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const packaged = process.argv.includes("--packaged");
const electronPath = packaged
  ? path.join(appRoot, "electron-dist", "win-unpacked", "MultiAgent Electron.exe")
  : require("electron");
const electronArgs = packaged ? [] : [path.join(appRoot, "electron", "main.mjs")];
if (!fs.existsSync(electronPath)) throw new Error(`Electron executable not found: ${electronPath}`);

async function run(name, envName, marker, timeoutMs = 12_000) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `multiagent-${name}-`));
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      [envName]: "1",
      MULTIAGENT_ELECTRON_USER_DATA: userData,
      MULTIAGENT_LOCAL_DATA: path.join(userData, "local-data"),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronPath, electronArgs, {
      cwd: appRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${name} timeout\n${output}`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
      if (code === 0 && output.includes(marker)) resolve();
      else reject(new Error(`${name} failed (${code})\n${output}`));
    });
  });
}

await run("close", "MULTIAGENT_ELECTRON_CLOSE_SMOKE", "MULTIAGENT_ELECTRON_CLOSE_OK");
await run("security", "MULTIAGENT_ELECTRON_SECURITY_SMOKE", "MULTIAGENT_ELECTRON_SECURITY_OK");
console.log(`[electron-smoke] MULTIAGENT_ELECTRON_LIFECYCLE_OK (${packaged ? "packaged" : "source"})`);
