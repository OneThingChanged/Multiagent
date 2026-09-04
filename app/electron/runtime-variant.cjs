const VARIANTS = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    displayName: "MultiAgent",
    appUserModelId: "com.jintae.multiagent.electron",
    localDataDirectory: "com.jintae.multiagent",
    updaterChannel: "latest",
    remoteEnabled: true,
    updateProvider: "local-developer",
    storeProductId: null,
  }),
  company: Object.freeze({
    id: "company",
    displayName: "MultiAgentCompany",
    appUserModelId: "com.jintae.multiagent.company.electron",
    localDataDirectory: "com.jintae.multiagent.company",
    updaterChannel: "latest-company",
    remoteEnabled: false,
    updateProvider: "github",
    storeProductId: null,
  }),
  store: Object.freeze({
    id: "store",
    displayName: "MultiAgent",
    appUserModelId: null,
    localDataDirectory: "com.jintae.multiagent.store",
    userDataDirectory: "MultiAgent Store",
    updaterChannel: null,
    remoteEnabled: true,
    updateProvider: "microsoft-store",
    storeProductId: "9NVBSGNRTPLR",
  }),
});

function normalizeVariant(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "company" || normalized === "store"
    ? normalized
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
