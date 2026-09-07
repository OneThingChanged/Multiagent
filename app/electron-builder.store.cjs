const packageMetadata = require("./package.json");
const base = packageMetadata.build;
const { resolveReleaseVersions } = require("./scripts/release-version.cjs");
const { releaseVersion } = resolveReleaseVersions(packageMetadata);

module.exports = {
  ...base,
  appId: "com.jintae.multiagent.store.electron",
  productName: "Acedia",
  executableName: "Acedia",
  extraMetadata: {
    multiAgentVariant: "store",
    multiAgentReleaseVersion: releaseVersion,
  },
  directories: {
    ...base.directories,
    output: "electron-dist/store",
  },
  files: [
    ...base.files,
    "!electron/remote-pwa/downloads/**",
    "!node_modules/node-pty/build/**",
    "!node_modules/node-pty/deps/**",
    "!node_modules/node-pty/node-addon-api/**",
    "!node_modules/node-pty/scripts/**",
    "!node_modules/node-pty/src/**",
    "!node_modules/node-pty/third_party/**",
    "!node_modules/node-pty/typings/**",
    "!node_modules/node-pty/prebuilds/darwin-*/**",
    "!node_modules/node-pty/prebuilds/win32-arm64/**",
    "!node_modules/node-pty/prebuilds/win32-x64/**/*.pdb",
    "!node_modules/node-pty/lib/**/*.map",
    "!node_modules/node-pty/lib/**/*.test.js",
  ],
  extraResources: [],
  publish: null,
};
