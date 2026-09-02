import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import runtimeVariantModule from "./runtime-variant.cjs";

const { resolveRuntimeVariant } = runtimeVariantModule;
const require = createRequire(import.meta.url);

describe("Electron runtime variant", () => {
  it("uses the standard identity and update channel by default", () => {
    expect(resolveRuntimeVariant()).toMatchObject({
      id: "standard",
      displayName: "MultiAgent",
      appUserModelId: "com.jintae.multiagent.electron",
      localDataDirectory: "com.jintae.multiagent",
      updaterChannel: "latest",
      remoteEnabled: true,
      updateProvider: "github",
    });
  });

  it("uses the Company identity, data folder, and update channel", () => {
    expect(resolveRuntimeVariant({ packageVariant: "company" })).toMatchObject({
      id: "company",
      displayName: "MultiAgentCompany",
      appUserModelId: "com.jintae.multiagent.company.electron",
      localDataDirectory: "com.jintae.multiagent.company",
      updaterChannel: "latest-company",
      remoteEnabled: false,
      updateProvider: "github",
    });
  });

  it("uses isolated data and Microsoft Store managed updates for Store builds", () => {
    expect(resolveRuntimeVariant({ packageVariant: "store" })).toMatchObject({
      id: "store",
      displayName: "MultiAgent",
      appUserModelId: null,
      localDataDirectory: "com.jintae.multiagent.store",
      userDataDirectory: "MultiAgent Store",
      updaterChannel: null,
      remoteEnabled: true,
      updateProvider: "microsoft-store",
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
    const standardBuild = require("../package.json").build;
    const companyBuild = require("../electron-builder.company.cjs");

    expect(standardBuild).toMatchObject({
      productName: "MultiAgent",
      executableName: "MultiAgent",
      nsis: {
        shortcutName: "MultiAgent",
        uninstallDisplayName: "MultiAgent ${version}",
        artifactName: "MultiAgent-Setup-${version}-${arch}.${ext}",
      },
    });
    expect(companyBuild).toMatchObject({
      productName: "MultiAgentCompany",
      executableName: "MultiAgentCompany",
      nsis: {
        shortcutName: "MultiAgentCompany",
        uninstallDisplayName: "MultiAgentCompany ${version}",
        artifactName: "MultiAgentCompany-Setup-${version}-${arch}.${ext}",
      },
    });
  });
});
