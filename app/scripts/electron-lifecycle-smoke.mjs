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
const company = process.argv.includes("--company");
const outputDir = path.join(appRoot, "electron-dist", ...(company ? ["company"] : []));
const electronPath = packaged
  ? path.join(
      outputDir,
      "win-unpacked",
      company ? "MultiAgentCompany.exe" : "MultiAgent.exe"
    )
  : require("electron");
const electronArgs = packaged ? [] : [path.join(appRoot, "electron", "main.mjs")];
if (!electronPath || !fs.existsSync(electronPath)) {
  throw new Error(`Electron executable not found: ${electronPath}`);
}

async function run(name, envName, marker, timeoutMs = 12_000, terminateAfterMarker = false) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `multiagent-${name}-`));
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      [envName]: "1",
      MULTIAGENT_ELECTRON_USER_DATA: userData,
      MULTIAGENT_LOCAL_DATA: path.join(userData, "local-data"),
      ...(company && !packaged
        ? { MULTIAGENT_BUILD_VARIANT: "company" }
        : {}),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronPath, electronArgs, {
      cwd: appRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let terminationRequested = false;
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${name} timeout\n${output}`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
      if (terminateAfterMarker && !terminationRequested && output.includes(marker)) {
        terminationRequested = true;
        child.kill();
      }
    });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
      const variantMarker = `variant=${company ? "company" : "standard"}`;
      const packagedResourcesHealthy = !output.includes("[electron] tray init failed");
      if (
        (code === 0 || (terminateAfterMarker && terminationRequested)) &&
        output.includes(marker) &&
        output.includes(variantMarker) &&
        packagedResourcesHealthy
      ) resolve();
      else reject(new Error(`${name} failed (${code})\n${output}`));
    });
  });
}

await run("close", "MULTIAGENT_ELECTRON_CLOSE_SMOKE", "MULTIAGENT_ELECTRON_CLOSE_OK");
await run(
  "workspace",
  "MULTIAGENT_ELECTRON_WORKSPACE_SMOKE",
  "MULTIAGENT_ELECTRON_WORKSPACE_TRAY_OK",
  12_000,
  true,
);
await run("security", "MULTIAGENT_ELECTRON_SECURITY_SMOKE", "MULTIAGENT_ELECTRON_SECURITY_OK");
const mode = packaged ? "packaged" : "source";
console.log(`[electron-smoke] MULTIAGENT_ELECTRON_LIFECYCLE_OK (${mode})`);
