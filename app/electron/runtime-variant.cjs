const VARIANTS = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    displayName: "MultiAgent Electron",
    appUserModelId: "com.jintae.multiagent.electron",
    localDataDirectory: "com.jintae.multiagent",
    updaterChannel: "latest",
    remoteEnabled: true,
  }),
  company: Object.freeze({
    id: "company",
    displayName: "MultiAgentCompany Electron",
    appUserModelId: "com.jintae.multiagent.company.electron",
    localDataDirectory: "com.jintae.multiagent.company",
    updaterChannel: "latest-company",
    remoteEnabled: false,
  }),
});

function normalizeVariant(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "company"
    ? "company"
    : "standard";
}

function resolveRuntimeVariant({ environmentVariant, packageVariant } = {}) {
  const selected = environmentVariant?.trim()
    ? environmentVariant
    : packageVariant;
  return VARIANTS[normalizeVariant(selected)];
}

module.exports = {
  VARIANTS,
  normalizeVariant,
  resolveRuntimeVariant,
};
