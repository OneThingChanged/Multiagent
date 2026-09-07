const path = require("node:path");
const packageMetadata = require("./package.json");
const base = packageMetadata.build;
const { verifyMobileReleaseApk } = require("./scripts/mobile-release-artifact.cjs");
const { resolveReleaseVersions } = require("./scripts/release-version.cjs");

const verified = verifyMobileReleaseApk({ quiet: true });
const { releaseVersion } = resolveReleaseVersions(packageMetadata);

module.exports = {
  ...base,
  buildVersion: releaseVersion,
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
      to: "mobile/Acedia-Mobile.apk",
    },
  ],
  nsis: {
    ...base.nsis,
    artifactName: `Acedia-Setup-${releaseVersion}-\${arch}.\${ext}`,
    shortcutName: "Acedia",
    uninstallDisplayName: `Acedia ${releaseVersion}`,
  },
};
