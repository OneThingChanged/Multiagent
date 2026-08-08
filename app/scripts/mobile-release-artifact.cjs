const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const EXPECTED_PACKAGE = "com.OneThingChanged.multiagent.mobile";

function normalizeFingerprint(value) {
  return String(value || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
}

function parseSignerMetadata(output) {
  const text = String(output || "");
  return {
    certificateSha256: normalizeFingerprint(
      text.match(/certificate SHA-256 digest:\s*([0-9a-f:]+)/i)?.[1],
    ),
    certificateDn: String(text.match(/certificate DN:\s*(.+)/i)?.[1] || "").trim(),
  };
}

function parsePackageMetadata(output) {
  const text = String(output || "");
  const packageLine = text.match(/^package:\s+name='([^']+)'\s+versionCode='([^']*)'\s+versionName='([^']*)'/m);
  const nativeCode = text.match(/^native-code:\s+(.+)$/m)?.[1] || "";
  return {
    packageName: packageLine?.[1] || "",
    versionCode: packageLine?.[2] || "",
    versionName: packageLine?.[3] || "",
    debuggable: /^application-debuggable\b/m.test(text),
    architectures: [...nativeCode.matchAll(/'([^']+)'/g)].map((match) => match[1]),
  };
}

function readAndroidSdkFromLocalProperties() {
  const properties = path.resolve(__dirname, "..", "..", "mobile", "android", "local.properties");
  if (!fs.statSync(properties, { throwIfNoEntry: false })?.isFile()) return "";
  const value = fs.readFileSync(properties, "utf8").match(/^sdk\.dir=(.+)$/m)?.[1]?.trim() || "";
  return value.replace(/\\:/g, ":").replace(/\\\\/g, "\\");
}

function androidSdkCandidates() {
  return [...new Set([
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    readAndroidSdkFromLocalProperties(),
    path.resolve(__dirname, "..", "..", ".build-tools", "android-sdk"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    path.join(os.homedir(), "AppData", "Local", "Android", "Sdk"),
    path.join(os.homedir(), "Library", "Android", "sdk"),
  ].filter(Boolean).map((value) => path.resolve(value)))];
}

function findAndroidBuildTools() {
  for (const sdk of androidSdkCandidates()) {
    const root = path.join(sdk, "build-tools");
    if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    const versions = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      const directory = path.join(root, version);
      const apksignerJar = path.join(directory, "lib", "apksigner.jar");
      const aapt2 = path.join(directory, process.platform === "win32" ? "aapt2.exe" : "aapt2");
      if (fs.existsSync(apksignerJar) && fs.existsSync(aapt2)) {
        return { sdk, version, apksignerJar, aapt2 };
      }
    }
  }
  throw new Error("Android SDK Build Tools with apksigner and aapt2 were not found.");
}

function findJava() {
  const executable = process.platform === "win32" ? "java.exe" : "java";
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, "bin", executable));
  const localRoot = path.resolve(__dirname, "..", "..", ".build-tools", "jdk17-dist");
  candidates.push(path.join(localRoot, "bin", executable));
  if (fs.statSync(localRoot, { throwIfNoEntry: false })?.isDirectory()) {
    for (const entry of fs.readdirSync(localRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(localRoot, entry.name, "bin", executable));
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || "java";
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `${command} failed`).trim());
  }
  return String(result.stdout || "");
}

function verifyMobileReleaseApk(options = {}) {
  const apkInput = String(Object.hasOwn(options, "apkPath")
    ? options.apkPath
    : process.env.MULTIAGENT_MOBILE_APK_PATH || "").trim();
  const expectedFingerprint = normalizeFingerprint(
    Object.hasOwn(options, "expectedFingerprint")
      ? options.expectedFingerprint
      : process.env.MULTIAGENT_ANDROID_CERT_SHA256,
  );
  if (!apkInput) throw new Error("MULTIAGENT_MOBILE_APK_PATH is required for a standard release.");
  if (expectedFingerprint.length !== 64) {
    throw new Error("MULTIAGENT_ANDROID_CERT_SHA256 must be the 64-digit release certificate fingerprint.");
  }
  const apkPath = path.resolve(apkInput);
  const stat = fs.statSync(apkPath, { throwIfNoEntry: false });
  if (!stat?.isFile() || path.extname(apkPath).toLowerCase() !== ".apk") {
    throw new Error("MULTIAGENT_MOBILE_APK_PATH must point to an APK file.");
  }

  const tools = findAndroidBuildTools();
  const java = findJava();
  const signer = parseSignerMetadata(run(java, [
    "-jar", tools.apksignerJar, "verify", "--verbose", "--print-certs", apkPath,
  ]));
  if (!signer.certificateSha256 || signer.certificateSha256 !== expectedFingerprint) {
    throw new Error("APK signing certificate does not match MULTIAGENT_ANDROID_CERT_SHA256.");
  }
  if (/android debug/i.test(signer.certificateDn)) {
    throw new Error("Debug-signed APKs cannot be included in a release.");
  }

  const manifest = parsePackageMetadata(run(tools.aapt2, ["dump", "badging", apkPath]));
  if (manifest.packageName !== EXPECTED_PACKAGE) {
    throw new Error(`Unexpected Android package: ${manifest.packageName || "unknown"}.`);
  }
  if (manifest.debuggable) throw new Error("Debuggable APKs cannot be included in a release.");
  if (!manifest.architectures.includes("arm64-v8a")) {
    throw new Error("Release APK must include the arm64-v8a architecture.");
  }

  const artifactSha256 = crypto.createHash("sha256").update(fs.readFileSync(apkPath)).digest("hex");
  const verified = {
    apkPath,
    artifactSha256,
    certificateSha256: signer.certificateSha256,
    certificateDn: signer.certificateDn,
    ...manifest,
  };
  if (!options.quiet) {
    console.log(`[mobile-release] APK SHA-256 ${artifactSha256}`);
    console.log(`[mobile-release] certificate SHA-256 ${signer.certificateSha256}`);
  }
  return verified;
}

module.exports = {
  EXPECTED_PACKAGE,
  normalizeFingerprint,
  parsePackageMetadata,
  parseSignerMetadata,
  verifyMobileReleaseApk,
};

if (require.main === module) {
  try {
    verifyMobileReleaseApk();
  } catch (error) {
    console.error(`[mobile-release] ${error.message}`);
    process.exitCode = 2;
  }
}
