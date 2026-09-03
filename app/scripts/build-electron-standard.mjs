import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { verifyMobileReleaseApk } = require("./mobile-release-artifact.cjs");
const { resolveReleaseVersions } = require("./release-version.cjs");
const appDir = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
const { releaseVersion, updaterVersion } = resolveReleaseVersions(packageJson);
const mobileDir = join(appDir, "..", "mobile");
const mobilePackageJson = JSON.parse(readFileSync(join(mobileDir, "package.json"), "utf8"));
const mobileAppConfig = JSON.parse(readFileSync(join(mobileDir, "app.json"), "utf8"));
for (const [label, version] of [
  ["mobile/package.json", mobilePackageJson.version],
]) {
  if (version !== updaterVersion) {
    throw new Error(
      `${label} version ${version || "unknown"} does not match updater version ${updaterVersion}.`
    );
  }
}
for (const [label, version] of [
  ["mobile/package.json release", mobilePackageJson.multiAgentReleaseVersion],
  ["mobile/app.json", mobileAppConfig.expo?.version],
]) {
  if (version !== releaseVersion) {
    throw new Error(
      `${label} version ${version || "unknown"} does not match product release ${releaseVersion}.`
    );
  }
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const builder = process.platform === "win32"
  ? join(appDir, "node_modules", ".bin", "electron-builder.cmd")
  : join(appDir, "node_modules", ".bin", "electron-builder");

const localMobileMetadata = join(appDir, "..", "mobile", ".release-signing.public.local.json");
if (existsSync(localMobileMetadata)) {
  const local = JSON.parse(readFileSync(localMobileMetadata, "utf8"));
  if (!process.env.MULTIAGENT_MOBILE_APK_PATH && local.apkPath) {
    process.env.MULTIAGENT_MOBILE_APK_PATH = String(local.apkPath);
  }
  if (!process.env.MULTIAGENT_ANDROID_CERT_SHA256 && local.certificateSha256) {
    process.env.MULTIAGENT_ANDROID_CERT_SHA256 = String(local.certificateSha256);
  }
}

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
  verified = verifyMobileReleaseApk({ expectedVersionName: releaseVersion });
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
writeFileSync(
  join(appDir, "electron-dist", "github-release.metadata.json"),
  `${JSON.stringify({
    releaseVersion,
    tagName: `v${releaseVersion}`,
    updaterVersion,
    installer: `MultiAgent-Setup-${releaseVersion}-x64.exe`,
    updaterMetadata: "latest.yml",
    mobileApk: "mobile/MultiAgent-Mobile.apk",
  }, null, 2)}\n`,
  "utf8",
);
