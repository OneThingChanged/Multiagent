const base = require("./package.json").build;

module.exports = {
  ...base,
  appId: "com.jintae.multiagent.company.electron",
  productName: "MultiAgentCompany Electron",
  extraMetadata: {
    multiAgentVariant: "company",
  },
  directories: {
    ...base.directories,
    output: "electron-dist/company",
  },
  files: [
    ...base.files,
    "!electron/remote-pwa/**",
  ],
  nsis: {
    ...base.nsis,
    artifactName: "MultiAgentCompany-Electron-Setup-${version}-${arch}.${ext}",
  },
  portable: {
    ...base.portable,
    artifactName: "MultiAgentCompany-Electron-Portable-${version}-${arch}.${ext}",
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
