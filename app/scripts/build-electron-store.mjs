import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  findWindowsSdkTool,
  loadStoreIdentity,
  renderManifest,
  storeBuildStateDirectory,
} = require("./store-msix-config.cjs");

if (process.platform !== "win32") {
  throw new Error("Microsoft Store MSIX packages must be built on Windows.");
}

const appDir = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
const development = process.argv.includes("--dev");
const identityArgIndex = process.argv.indexOf("--identity-file");
const identityFile = identityArgIndex >= 0 ? process.argv[identityArgIndex + 1] : null;
const identity = loadStoreIdentity({
  appDir,
  appVersion: packageJson.version,
  development,
  identityFile,
});

const outputDir = join(appDir, "electron-dist", "store");
const packagedDir = join(outputDir, "win-unpacked");
const stagingDir = join(outputDir, "msix-staging");
const appStageDir = join(stagingDir, "app");
const manifestTemplatePath = join(appDir, "store", "Package.appxmanifest.template.xml");
const manifestPath = join(stagingDir, "AppxManifest.xml");
const modeName = development ? "Dev" : "Release";
const artifactBase = `MultiAgent-Store-${modeName}-${identity.packageVersion}-x64`;
const artifactPath = join(outputDir, `${artifactBase}.msix`);
const metadataPath = join(outputDir, `${artifactBase}.metadata.json`);
const stableMetadataPath = join(outputDir, `MultiAgent-Store-${modeName}.metadata.json`);
const builder = join(appDir, "node_modules", "electron-builder", "cli.js");
const npm = process.env.npm_execpath
  ? { command: process.execPath, prefix: [process.env.npm_execpath] }
  : { command: "npm.cmd", prefix: [] };
const makeAppx = findWindowsSdkTool("makeappx.exe");
const signTool = findWindowsSdkTool("signtool.exe");

function run(command, args, { env = process.env, capture = false, shell = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    env,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr || result.stdout || ""}` : "";
    throw new Error(`${basename(command)} failed with exit code ${result.status}${detail}`);
  }
  return capture ? String(result.stdout || "").trim() : "";
}

function resetGeneratedDirectory(target) {
  const absoluteOutput = resolve(outputDir);
  const absoluteTarget = resolve(target);
  if (absoluteTarget === absoluteOutput || !absoluteTarget.startsWith(`${absoluteOutput}\\`)) {
    throw new Error(`Refusing to reset unsafe Store output path: ${absoluteTarget}`);
  }
  rmSync(absoluteTarget, { recursive: true, force: true });
  mkdirSync(absoluteTarget, { recursive: true });
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function copyStoreAssets() {
  const assetDir = join(appDir, "store", "assets");
  const targetDir = join(stagingDir, "Assets");
  mkdirSync(targetDir, { recursive: true });
  for (const file of ["StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png"]) {
    const source = join(assetDir, file);
    if (!existsSync(source)) throw new Error(`Store logo asset is missing: ${source}`);
    copyFileSync(source, join(targetDir, file));
  }
}

console.log(`[store-msix] mode=${identity.mode} app=${packageJson.version} package=${identity.packageVersion}`);

run(npm.command, [...npm.prefix, "run", "build"], {
  env: { ...process.env, VITE_MULTIAGENT_VARIANT: "store" },
  shell: npm.command.endsWith(".cmd"),
});
run(process.execPath, [builder, "--dir", "--config", "electron-builder.store.cjs"]);

if (!existsSync(join(packagedDir, "MultiAgent.exe"))) {
  throw new Error(`Electron Store layout was not created: ${packagedDir}`);
}
resetGeneratedDirectory(stagingDir);
mkdirSync(appStageDir, { recursive: true });
cpSync(packagedDir, appStageDir, { recursive: true });
copyStoreAssets();

const manifest = renderManifest(readFileSync(manifestTemplatePath, "utf8"), identity);
writeFileSync(manifestPath, manifest, "utf8");
if (existsSync(artifactPath)) rmSync(artifactPath, { force: true });
const packageOutput = run(
  makeAppx,
  ["pack", "/np", "/d", stagingDir, "/p", artifactPath, "/o"],
  { capture: true },
);
const packageSummary = packageOutput.split(/\r?\n/).filter(Boolean).slice(-3).join("\n");
if (packageSummary) console.log(packageSummary);

let signing = null;
if (development) {
  const certificateScript = join(appDir, "scripts", "ensure-store-dev-certificate.ps1");
  const certificateOutput = run(
    "pwsh.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-File",
      certificateScript,
      "-Publisher",
      identity.publisher,
      "-StateDirectory",
      storeBuildStateDirectory(),
    ],
    { capture: true }
  );
  const certificateLine = certificateOutput.split(/\r?\n/).filter(Boolean).at(-1);
  signing = JSON.parse(certificateLine);
  run(signTool, [
    "sign",
    "/fd",
    "SHA256",
    "/sha1",
    signing.thumbprint,
    artifactPath,
  ]);
}

const metadata = {
  schemaVersion: 1,
  mode: identity.mode,
  appVersion: packageJson.version,
  packageVersion: identity.packageVersion,
  architecture: "x64",
  identityName: identity.identityName,
  publisher: identity.publisher,
  publisherDisplayName: identity.publisherDisplayName,
  displayName: identity.displayName,
  productId: identity.productId,
  artifact: basename(artifactPath),
  size: statSync(artifactPath).size,
  sha256: sha256(artifactPath),
  signedForDevelopment: Boolean(signing),
  certificateThumbprint: signing?.thumbprint || null,
  publicCertificatePath: signing?.certificatePath || null,
  generatedAt: new Date().toISOString(),
};
const serializedMetadata = `${JSON.stringify(metadata, null, 2)}\n`;
writeFileSync(metadataPath, serializedMetadata, "utf8");
writeFileSync(stableMetadataPath, serializedMetadata, "utf8");

console.log(`[store-msix] artifact=${artifactPath}`);
console.log(`[store-msix] sha256=${metadata.sha256}`);
console.log(`[store-msix] metadata=${metadataPath}`);
