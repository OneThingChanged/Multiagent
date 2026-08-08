const path = require("node:path");
const base = require("./package.json").build;
const { verifyMobileReleaseApk } = require("./scripts/mobile-release-artifact.cjs");

const verified = verifyMobileReleaseApk({ quiet: true });

module.exports = {
  ...base,
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
};
