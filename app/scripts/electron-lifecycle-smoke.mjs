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
const portable = process.argv.includes("--portable");
const company = process.argv.includes("--company");
const outputDir = path.join(appRoot, "electron-dist", ...(company ? ["company"] : []));
const portablePath = portable
  ? fs.readdirSync(outputDir)
    .filter((name) => company
      ? /^MultiAgentCompany-Electron-Portable-.*\.exe$/i.test(name)
      : /^MultiAgent-Electron-Portable-.*\.exe$/i.test(name))
    .map((name) => path.join(outputDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0]
  : null;
const electronPath = portable
  ? portablePath
  : packaged
  ? path.join(
      outputDir,
      "win-unpacked",
      company ? "MultiAgentCompany Electron.exe" : "MultiAgent Electron.exe"
    )
  : require("electron");
const electronArgs = packaged || portable ? [] : [path.join(appRoot, "electron", "main.mjs")];
if (!electronPath || !fs.existsSync(electronPath)) {
  throw new Error(`Electron executable not found: ${electronPath ?? "portable artifact"}`);
}

async function run(name, envName, marker, timeoutMs = 12_000) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `multiagent-${name}-`));
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      [envName]: "1",
      MULTIAGENT_ELECTRON_USER_DATA: userData,
      MULTIAGENT_LOCAL_DATA: path.join(userData, "local-data"),
      ...(company && !packaged && !portable
        ? { MULTIAGENT_BUILD_VARIANT: "company" }
        : {}),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const portableArgs = envName === "MULTIAGENT_ELECTRON_CLOSE_SMOKE"
      ? ["--multiagent-close-smoke"]
      : ["--multiagent-security-smoke"];
    const child = spawn(electronPath, portable ? portableArgs : electronArgs, {
      cwd: appRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${name} timeout\n${output}`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
      // electron-builder's portable launcher does not forward the extracted
      // Electron process stdout, so a clean launcher exit is the observable
      // success signal in portable mode. The smoke environment itself closes
      // the app only after the renderer/security scenario completes.
      const variantMarker = `variant=${company ? "company" : "standard"}`;
      const packagedResourcesHealthy =
        portable || !output.includes("[electron] tray init failed");
      if (
        code === 0 &&
        (portable || output.includes(marker)) &&
        (portable || output.includes(variantMarker)) &&
        packagedResourcesHealthy
      ) resolve();
      else reject(new Error(`${name} failed (${code})\n${output}`));
    });
  });
}

const timeoutMs = portable ? 60_000 : 12_000;
await run("close", "MULTIAGENT_ELECTRON_CLOSE_SMOKE", "MULTIAGENT_ELECTRON_CLOSE_OK", timeoutMs);
await run("security", "MULTIAGENT_ELECTRON_SECURITY_SMOKE", "MULTIAGENT_ELECTRON_SECURITY_OK", timeoutMs);
const mode = portable ? "portable" : packaged ? "packaged" : "source";
console.log(`[electron-smoke] MULTIAGENT_ELECTRON_LIFECYCLE_OK (${mode})`);
