const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { VARIANTS } = require("../electron/runtime-variant.cjs");

const REQUIRED_PRODUCTION_FIELDS = Object.freeze([
  "identityName",
  "publisher",
  "publisherDisplayName",
  "displayName",
  "productId",
]);

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function semverToStoreVersion(version) {
  const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`지원하지 않는 앱 버전 형식입니다: ${version}`);
  const source = match.slice(1).map(Number);
  const mapped = [source[0], source[1], source[2], 0];
  if (mapped.some((part) => !Number.isInteger(part) || part < 0 || part > 65_535)) {
    throw new Error(`Microsoft Store 버전 범위를 벗어났습니다: ${version}`);
  }
  return validatePackageVersion(mapped.join("."));
}

function validatePackageVersion(value) {
  const parts = String(value).split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 65_535) ||
    parts[0] === 0 ||
    parts[3] !== 0
  ) {
    throw new Error(
      `Store packageVersion은 첫 자리가 1 이상이고 마지막 자리가 0인 네 자리 버전이어야 합니다: ${value}`
    );
  }
  return parts.join(".");
}

function validateIdentityName(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(normalized) || normalized.endsWith(".")) {
    throw new Error("identityName은 Partner Center 값과 동일한 3~50자의 영문·숫자·점·하이픈이어야 합니다.");
  }
  return normalized;
}

function requiredText(value, field, maxLength = 256) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} 값이 없거나 ${maxLength}자를 초과했습니다.`);
  }
  return normalized;
}

function loadStoreIdentity({ appDir, appVersion, development = false, identityFile } = {}) {
  if (development) {
    return {
      mode: "development",
      identityFile: null,
      identityName: "com.jintae.multiagent.store.dev",
      publisher: "CN=MultiAgent Development",
      publisherDisplayName: "MultiAgent Development",
      displayName: "Acedia Dev",
      description: "Acedia AI-agent terminal and project workspace development build",
      productId: null,
      packageVersion: semverToStoreVersion(appVersion),
    };
  }

  const resolvedIdentityFile = path.resolve(
    identityFile ||
      process.env.MULTIAGENT_STORE_IDENTITY_FILE ||
      path.join(appDir, "store", "store-identity.local.json")
  );
  if (!fs.existsSync(resolvedIdentityFile)) {
    throw new Error(
      `Partner Center identity 파일이 없습니다: ${resolvedIdentityFile}\n` +
      "store/store-identity.example.json을 store/store-identity.local.json으로 복사하고 실제 제품 ID 값을 입력하세요."
    );
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resolvedIdentityFile, "utf8"));
  } catch (error) {
    throw new Error(`Store identity JSON을 읽을 수 없습니다: ${error.message}`);
  }
  for (const field of REQUIRED_PRODUCTION_FIELDS) requiredText(raw[field], field);
  const productId = requiredText(raw.productId, "productId", 64);
  if (productId !== VARIANTS.store.storeProductId) {
    throw new Error(
      `Store productId가 앱 업데이트 대상과 일치하지 않습니다: ${productId}`
    );
  }
  return {
    mode: "production",
    identityFile: resolvedIdentityFile,
    identityName: validateIdentityName(raw.identityName),
    publisher: requiredText(raw.publisher, "publisher"),
    publisherDisplayName: requiredText(raw.publisherDisplayName, "publisherDisplayName"),
    displayName: requiredText(raw.displayName, "displayName"),
    description: requiredText(
      raw.description || "Acedia AI-agent terminal and project workspace",
      "description"
    ),
    productId,
    packageVersion: validatePackageVersion(
      raw.packageVersion || semverToStoreVersion(appVersion)
    ),
  };
}

function renderManifest(template, identity) {
  const replacements = {
    identityName: identity.identityName,
    publisher: identity.publisher,
    packageVersion: identity.packageVersion,
    displayName: identity.displayName,
    publisherDisplayName: identity.publisherDisplayName,
    description: identity.description,
  };
  let rendered = String(template);
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${key}}}`, xmlEscape(value));
  }
  const unresolved = rendered.match(/{{[^}]+}}/g);
  if (unresolved) throw new Error(`해결되지 않은 manifest 변수가 있습니다: ${unresolved.join(", ")}`);
  return rendered;
}

function findWindowsSdkTool(name, { programFilesX86 = process.env["ProgramFiles(x86)"] } = {}) {
  const roots = [
    process.env.MULTIAGENT_WINDOWS_SDK_BIN,
    programFilesX86 && path.join(programFilesX86, "Windows Kits", "10", "bin"),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const candidates = [path.join(root, "x64", name)];
    const versions = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) candidates.push(path.join(root, version, "x64", name));
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;
  }
  throw new Error(`${name}을 찾을 수 없습니다. Windows 10/11 SDK를 설치하세요.`);
}

function storeBuildStateDirectory() {
  return path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "com.jintae.multiagent.store-build"
  );
}

module.exports = {
  REQUIRED_PRODUCTION_FIELDS,
  findWindowsSdkTool,
  loadStoreIdentity,
  renderManifest,
  semverToStoreVersion,
  storeBuildStateDirectory,
  validatePackageVersion,
  xmlEscape,
};
