import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import runtimeVariantModule from "./runtime-variant.cjs";

const { resolveRuntimeVariant } = runtimeVariantModule;
const require = createRequire(import.meta.url);

describe("Electron runtime variant", () => {
  it("uses the standard identity and update channel by default", () => {
    expect(resolveRuntimeVariant()).toMatchObject({
      id: "standard",
      displayName: "Acedia",
      appUserModelId: "com.jintae.multiagent.electron",
      localDataDirectory: "com.jintae.multiagent",
      userDataDirectory: "MultiAgent",
      updaterChannel: "latest",
      remoteEnabled: true,
      updateProvider: "local-developer",
      storeProductId: null,
    });
  });

  it("uses the Company identity, data folder, and update channel", () => {
    expect(resolveRuntimeVariant({ packageVariant: "company" })).toMatchObject({
      id: "company",
      displayName: "AcediaCompany",
      appUserModelId: "com.jintae.multiagent.company.electron",
      localDataDirectory: "com.jintae.multiagent.company",
      userDataDirectory: "MultiAgentCompany",
      updaterChannel: "latest-company",
      remoteEnabled: false,
      updateProvider: "github",
      storeProductId: null,
    });
  });

  it("uses isolated data and Microsoft Store managed updates for Store builds", () => {
    expect(resolveRuntimeVariant({ packageVariant: "store" })).toMatchObject({
      id: "store",
      displayName: "Acedia",
      appUserModelId: null,
      localDataDirectory: "com.jintae.multiagent.store",
      userDataDirectory: "MultiAgent Store",
      updaterChannel: null,
      remoteEnabled: true,
      updateProvider: "microsoft-store",
      storeProductId: "9NVBSGNRTPLR",
    });
  });

  it("allows a development environment override", () => {
    expect(resolveRuntimeVariant({
      environmentVariant: "company",
      packageVariant: "standard",
    }).id).toBe("company");
  });

  it("accepts a Store development environment override", () => {
    expect(resolveRuntimeVariant({
      environmentVariant: "store",
      packageVariant: "standard",
    }).id).toBe("store");
  });

  it("keeps shared Dashboard assets but excludes the Remote APK from Company", () => {
    const standardBuild = require("../package.json").build;
    const companyBuild = require("../electron-builder.company.cjs");
    expect(companyBuild.files).toContain("electron/**");
    expect(companyBuild.files).toContain("!electron/remote-pwa/downloads/**");
    expect(standardBuild.files).toContain("!electron/remote-pwa/downloads/**");
    expect(standardBuild.asarUnpack).not.toContain("electron/remote-pwa/downloads/**");
    expect(companyBuild.files).not.toContain("!electron/remote-pwa/**");
  });

  it("uses product-facing Windows executable and shortcut names", () => {
    const packageMetadata = require("../package.json");
    const standardBuild = packageMetadata.build;
    const companyBuild = require("../electron-builder.company.cjs");
    const releaseVersion = packageMetadata.multiAgentReleaseVersion;

    expect(standardBuild).toMatchObject({
      productName: "Acedia",
      executableName: "Acedia",
      nsis: {
        shortcutName: "Acedia",
        uninstallDisplayName: `Acedia ${releaseVersion}`,
        artifactName: `Acedia-Setup-${releaseVersion}-${"${arch}.${ext}"}`,
      },
    });
    expect(companyBuild).toMatchObject({
      productName: "AcediaCompany",
      executableName: "AcediaCompany",
      nsis: {
        shortcutName: "AcediaCompany",
        uninstallDisplayName: `AcediaCompany ${releaseVersion}`,
        artifactName: `AcediaCompany-Setup-${releaseVersion}-${"${arch}.${ext}"}`,
      },
    });
  });

  it("keeps GitHub and Microsoft Store release commands explicit and separate", () => {
    const scripts = require("../package.json").scripts;
    expect(scripts["release:build:github"]).toContain("build-electron-standard.mjs");
    expect(scripts["release:build:store"]).toContain("build-electron-store.mjs");
    expect(scripts["release:verify:store"]).toContain("verify-electron-store-msix.mjs");
  });
});
