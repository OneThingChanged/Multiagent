import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Tauri cutover requires a stable Electron version: ${version}`);
}

const variants = [
  {
    name: "MultiAgent",
    setupName: `MultiAgent-Electron-Setup-${version}-x64.exe`,
    directory: join(appDir, "electron-dist"),
    manifestName: "latest.json",
  },
  {
    name: "MultiAgentCompany",
    setupName: `MultiAgentCompany-Electron-Setup-${version}-x64.exe`,
    directory: join(appDir, "electron-dist", "company"),
    manifestName: "latest-company.json",
  },
];

for (const variant of variants) {
  const setupPath = join(variant.directory, variant.setupName);
  const signaturePath = `${setupPath}.sig`;
  if (!existsSync(setupPath) || !existsSync(signaturePath)) {
    throw new Error(`Missing signed Electron transition installer: ${variant.setupName}`);
  }

  const manifest = {
    version,
    notes: `${variant.name} ${version} Electron 전환`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: readFileSync(signaturePath, "utf8").trim(),
        url: `https://github.com/OneThingChanged/Multiagent/releases/download/v${version}/${variant.setupName}`,
      },
    },
  };

  const output = join(variant.directory, variant.manifestName);
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
