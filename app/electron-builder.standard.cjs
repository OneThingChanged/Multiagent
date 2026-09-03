const path = require("node:path");
const packageMetadata = require("./package.json");
const base = packageMetadata.build;
const { verifyMobileReleaseApk } = require("./scripts/mobile-release-artifact.cjs");
const { resolveReleaseVersions } = require("./scripts/release-version.cjs");

const verified = verifyMobileReleaseApk({ quiet: true });
const { releaseVersion } = resolveReleaseVersions(packageMetadata);

module.exports = {
  ...base,
  extraMetadata: {
    ...base.extraMetadata,
    multiAgentReleaseVersion: releaseVersion,
  },
  files: [
    ...base.files,
    "!electron/remote-pwa/downloads/**",
  ],
  extraResources: [
    ...(base.extraResources || []),
    {
      from: path.resolve(verified.apkPath),
      to: "mobile/MultiAgent-Mobile.apk",
    },
  ],
  nsis: {
    ...base.nsis,
    artifactName: `MultiAgent-Setup-${releaseVersion}-\${arch}.\${ext}`,
    uninstallDisplayName: `MultiAgent ${releaseVersion}`,
  },
};
