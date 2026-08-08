import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { verifyMobileReleaseApk } = require("./mobile-release-artifact.cjs");
const appDir = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const builder = process.platform === "win32"
  ? join(appDir, "node_modules", ".bin", "electron-builder.cmd")
  : join(appDir, "node_modules", ".bin", "electron-builder");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let verified;
try {
  verified = verifyMobileReleaseApk();
} catch (error) {
  console.error(`[mobile-release] ${error.message}`);
  process.exit(2);
}
console.log(
  `[mobile-release] verified ${verified.packageName} v${verified.versionName}`
  + ` (${verified.certificateSha256.slice(0, 12)}…)`,
);
run(npm, ["run", "build"]);
run(builder, process.argv.includes("--dir")
  ? ["--dir", "--config", "electron-builder.standard.cjs"]
  : ["--win", "nsis", "--config", "electron-builder.standard.cjs"]);

const mobileOutput = join(appDir, "electron-dist", "mobile");
mkdirSync(mobileOutput, { recursive: true });
copyFileSync(verified.apkPath, join(mobileOutput, "MultiAgent-Mobile.apk"));
writeFileSync(
  join(mobileOutput, "MultiAgent-Mobile.metadata.json"),
  `${JSON.stringify({
    packageName: verified.packageName,
    versionCode: verified.versionCode,
    versionName: verified.versionName,
    architectures: verified.architectures,
    apkSha256: verified.artifactSha256,
    certificateSha256: verified.certificateSha256,
    certificateDn: verified.certificateDn,
  }, null, 2)}\n`,
  "utf8",
);
