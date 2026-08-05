const base = require("./package.json").build;

module.exports = {
  ...base,
  appId: "com.jintae.multiagent.company.electron",
  productName: "MultiAgentCompany",
  executableName: "MultiAgentCompany",
  extraMetadata: {
    multiAgentVariant: "company",
  },
  directories: {
    ...base.directories,
    output: "electron-dist/company",
  },
  files: [
    ...base.files,
    // The local Dashboard and Remote server share this static shell. Company
    // disables the external Remote service at runtime, but still needs the
    // shell for its loopback-only Dashboard. Exclude only the downloadable APK.
    "!electron/remote-pwa/downloads/**",
  ],
  nsis: {
    ...base.nsis,
    artifactName: "MultiAgentCompany-Setup-${version}-${arch}.${ext}",
    shortcutName: "MultiAgentCompany",
    uninstallDisplayName: "MultiAgentCompany ${version}",
  },
  publish: [
    {
      provider: "github",
      owner: "OneThingChanged",
      repo: "Multiagent",
      channel: "latest-company",
    },
  ],
};
