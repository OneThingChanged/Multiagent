import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Tauri cutover requires a stable Electron version: ${version}`);
}

const setupName = `MultiAgent-Electron-Setup-${version}-x64.exe`;
const setupPath = join(appDir, "electron-dist", setupName);
const signaturePath = `${setupPath}.sig`;
if (!existsSync(setupPath) || !existsSync(signaturePath)) {
  throw new Error(`Missing signed Electron transition installer: ${setupName}`);
}

const manifest = {
  version,
  notes: `MultiAgent ${version} Electron 전환`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(signaturePath, "utf8").trim(),
      url: `https://github.com/OneThingChanged/Multiagent/releases/download/v${version}/${setupName}`,
    },
  },
};

const output = join(appDir, "electron-dist", "latest.json");
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${output}`);
