import fs from "node:fs";
import path from "node:path";

export function assertMobileSourceVersions(packageVersion, expoVersion, releaseVersion) {
  const normalizedPackageVersion = String(packageVersion || "").trim();
  const normalizedExpoVersion = String(expoVersion || "").trim();
  const normalizedReleaseVersion = String(releaseVersion || "").trim();
  const releaseMatch = normalizedReleaseVersion.match(/^(\d+)\.(\d+)\.(\d+)\.0$/);
  if (!releaseMatch || Number(releaseMatch[1]) < 1) {
    throw new Error(
      `mobile/package.json must contain a four-part release version ending in .0; received ${normalizedReleaseVersion || "empty"}.`,
    );
  }
  const expectedPackageVersion = releaseMatch.slice(1, 4).join(".");
  if (normalizedPackageVersion !== expectedPackageVersion) {
    throw new Error(
      `mobile/package.json version ${normalizedPackageVersion || "empty"} does not match release ${normalizedReleaseVersion} as ${expectedPackageVersion}.`,
    );
  }
  if (normalizedExpoVersion !== normalizedReleaseVersion) {
    throw new Error(
      `mobile/app.json version ${normalizedExpoVersion || "empty"} does not match release ${normalizedReleaseVersion}.`,
    );
  }
  return normalizedReleaseVersion;
}

export function renderAndroidGradleVersions(source, { versionName, versionCode }) {
  const normalizedVersionName = String(versionName || "").trim();
  const normalizedVersionCode = Number(versionCode);
  if (!Number.isInteger(normalizedVersionCode) || normalizedVersionCode < 1) {
    throw new Error(`mobile/app.json android.versionCode must be a positive integer; received ${versionCode}.`);
  }

  const versionCodePattern = /^(\s*versionCode\s+)\d+(\s*)$/m;
  const versionNamePattern = /^(\s*versionName\s+)["'][^"']*["'](\s*)$/m;
  if (!versionCodePattern.test(source) || !versionNamePattern.test(source)) {
    throw new Error("Generated android/app/build.gradle is missing versionCode or versionName.");
  }

  return source
    .replace(versionCodePattern, `$1${normalizedVersionCode}$2`)
    .replace(versionNamePattern, `$1"${normalizedVersionName}"$2`);
}

export function synchronizeAndroidVersion(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const versionName = assertMobileSourceVersions(
    packageJson.version,
    appConfig.expo?.version,
    packageJson.multiAgentReleaseVersion,
  );
  const versionCode = appConfig.expo?.android?.versionCode;
  const gradlePath = path.join(root, "android", "app", "build.gradle");
  const source = fs.readFileSync(gradlePath, "utf8");
  const rendered = renderAndroidGradleVersions(source, { versionName, versionCode });
  if (rendered !== source) fs.writeFileSync(gradlePath, rendered, "utf8");
  return { versionName, versionCode: Number(versionCode), changed: rendered !== source };
}
