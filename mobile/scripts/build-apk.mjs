import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSigningEnvironment } from "./signing-config.mjs";

loadSigningEnvironment();

const allowDebugSigning = process.argv.includes("--allow-debug-signing");
const required = [
  "MULTIAGENT_ANDROID_KEYSTORE_PATH",
  "MULTIAGENT_ANDROID_KEYSTORE_PASSWORD",
  "MULTIAGENT_ANDROID_KEY_ALIAS",
  "MULTIAGENT_ANDROID_KEY_PASSWORD",
];
const missing = required.filter((name) => !String(process.env[name] || "").trim());
if (!allowDebugSigning && missing.length > 0) {
  console.error(`Secure APK signing configuration is missing: ${missing.join(", ")}`);
  process.exit(2);
}
if (!allowDebugSigning) {
  const keystore = path.resolve(process.env.MULTIAGENT_ANDROID_KEYSTORE_PATH);
  if (!fs.statSync(keystore, { throwIfNoEntry: false })?.isFile()) {
    console.error("MULTIAGENT_ANDROID_KEYSTORE_PATH must point to a local keystore file.");
    process.exit(2);
  }
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const android = path.join(root, "android");
const windows = process.platform === "win32";
const command = windows ? "gradlew.bat" : "./gradlew";
const result = spawnSync(
  command,
  ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"],
  {
    cwd: android,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ...(allowDebugSigning ? { MULTIAGENT_ALLOW_DEBUG_RELEASE: "1" } : {}),
    },
    shell: windows,
    stdio: "inherit",
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
