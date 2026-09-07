import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { findWindowsSdkTool } = require("./store-msix-config.cjs");
const appDir = fileURLToPath(new URL("..", import.meta.url));
const development = process.argv.includes("--dev");
const modeName = development ? "Dev" : "Release";
const outputDir = join(appDir, "electron-dist", "store");
const metadataPath = join(outputDir, `Acedia-Store-${modeName}.metadata.json`);
const unpackDir = join(outputDir, `verify-${modeName.toLowerCase()}-unpacked`);

function fail(message) {
  throw new Error(`[store-msix-verify] ${message}`);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

if (!existsSync(metadataPath)) fail(`metadata not found: ${metadataPath}`);
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
const artifactPath = join(outputDir, metadata.artifact);
if (!existsSync(artifactPath)) fail(`artifact not found: ${artifactPath}`);
if (sha256(artifactPath) !== metadata.sha256) fail("artifact SHA-256 does not match metadata");
if (development !== metadata.signedForDevelopment) fail("development signature state is incorrect");

const absoluteOutput = resolve(outputDir);
const absoluteUnpack = resolve(unpackDir);
if (!absoluteUnpack.startsWith(`${absoluteOutput}\\`)) fail(`unsafe unpack path: ${absoluteUnpack}`);
rmSync(unpackDir, { recursive: true, force: true });
mkdirSync(unpackDir, { recursive: true });
const makeAppx = findWindowsSdkTool("makeappx.exe");
const unpack = spawnSync(makeAppx, ["unpack", "/p", artifactPath, "/d", unpackDir, "/o"], {
  cwd: appDir,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (unpack.error) throw unpack.error;
if (unpack.status !== 0) {
  fail(`MakeAppx unpack failed with ${unpack.status}: ${unpack.stderr || unpack.stdout || ""}`);
}

const manifestPath = join(unpackDir, "AppxManifest.xml");
const executablePath = join(unpackDir, "app", "Acedia.exe");
if (!existsSync(manifestPath) || !existsSync(executablePath)) {
  fail("manifest or packaged executable is missing");
}
const manifest = readFileSync(manifestPath, "utf8");
for (const expected of [
  `Name="${metadata.identityName}"`,
  `Publisher="${metadata.publisher.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`,
  `Version="${metadata.packageVersion}"`,
  'ProcessorArchitecture="x64"',
  'Executable="app\\Acedia.exe"',
  'uap10:RuntimeBehavior="packagedClassicApp"',
  'uap10:TrustLevel="mediumIL"',
  '<rescap:Capability Name="runFullTrust"',
]) {
  if (!manifest.includes(expected)) fail(`manifest invariant missing: ${expected}`);
}

const forbidden = /(?:^|\\)(?:[^\\]*\.(?:apk|pfx|p12|key|keystore)|google-services\.json|service-account[^\\]*\.json)$/i;
const pending = [unpackDir];
while (pending.length > 0) {
  const current = pending.pop();
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) pending.push(fullPath);
    else if (forbidden.test(fullPath)) fail(`forbidden credential/mobile artifact found: ${fullPath}`);
  }
}
const signaturePath = join(unpackDir, "AppxSignature.p7x");
if (development && !existsSync(signaturePath)) fail("development package signature is missing");
if (!development && existsSync(signaturePath)) fail("Store upload package must be unsigned before submission");

console.log(`[store-msix-verify] mode=${metadata.mode}`);
console.log(`[store-msix-verify] identity=${metadata.identityName}`);
console.log(`[store-msix-verify] version=${metadata.packageVersion}`);
console.log(`[store-msix-verify] sha256=${metadata.sha256}`);
console.log("[store-msix-verify] MULTIAGENT_STORE_MSIX_OK");
