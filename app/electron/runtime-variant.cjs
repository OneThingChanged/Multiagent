const VARIANTS = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    displayName: "Acedia",
    appUserModelId: "com.jintae.multiagent.electron",
    localDataDirectory: "com.jintae.multiagent",
    userDataDirectory: "MultiAgent",
    updaterChannel: "latest",
    remoteEnabled: true,
    updateProvider: "local-developer",
    storeProductId: null,
  }),
  company: Object.freeze({
    id: "company",
    displayName: "AcediaCompany",
    appUserModelId: "com.jintae.multiagent.company.electron",
    localDataDirectory: "com.jintae.multiagent.company",
    userDataDirectory: "MultiAgentCompany",
    updaterChannel: "latest-company",
    remoteEnabled: false,
    updateProvider: "github",
    storeProductId: null,
  }),
  store: Object.freeze({
    id: "store",
    displayName: "Acedia",
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
