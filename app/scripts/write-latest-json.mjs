import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const allowMissing = process.argv.includes("--allow-missing");
const appDir = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(appDir, "package.json"), "utf8")
);
const version = packageJson.version;
const repo = "https://github.com/OneThingChanged/Multiagent";
const bundleDir = join(appDir, "src-tauri", "target", "release", "bundle");
const nsisDir = join(bundleDir, "nsis");

const variants = [
  {
    productName: "MultiAgent",
    manifest: "latest.json",
    setup: `MultiAgent_${version}_x64-setup.exe`,
  },
  {
    productName: "MultiAgentCompany",
    manifest: "latest-company.json",
    setup: `MultiAgentCompany_${version}_x64-setup.exe`,
  },
];

let wrote = 0;
for (const variant of variants) {
  const setupPath = join(nsisDir, variant.setup);
  const sigPath = `${setupPath}.sig`;
  const manifestPath = join(bundleDir, variant.manifest);

  if (!existsSync(setupPath) || !existsSync(sigPath)) {
    const message = `Missing signed ${variant.productName} updater asset: ${variant.setup}`;
    if (allowMissing) {
      console.warn(message);
      continue;
    }
    console.error(message);
    process.exit(1);
  }

  const signature = readFileSync(sigPath, "utf8").trim();
  const manifest = {
    version,
    notes: `MultiAgent ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature,
        url: `${repo}/releases/download/v${version}/${variant.setup}`,
      },
    },
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifestPath}`);
  wrote += 1;
}

if (!allowMissing && wrote !== variants.length) {
  process.exit(1);
}
