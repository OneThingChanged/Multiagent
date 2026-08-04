import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import runtimeVariantModule from "./runtime-variant.cjs";

const { resolveRuntimeVariant } = runtimeVariantModule;
const require = createRequire(import.meta.url);

describe("Electron runtime variant", () => {
  it("uses the standard identity and update channel by default", () => {
    expect(resolveRuntimeVariant()).toMatchObject({
      id: "standard",
      appUserModelId: "com.jintae.multiagent.electron",
      localDataDirectory: "com.jintae.multiagent",
      updaterChannel: "latest",
      remoteEnabled: true,
    });
  });

  it("uses the Company identity, data folder, and update channel", () => {
    expect(resolveRuntimeVariant({ packageVariant: "company" })).toMatchObject({
      id: "company",
      displayName: "MultiAgentCompany Electron",
      appUserModelId: "com.jintae.multiagent.company.electron",
      localDataDirectory: "com.jintae.multiagent.company",
      updaterChannel: "latest-company",
      remoteEnabled: false,
    });
  });

  it("allows a development environment override", () => {
    expect(resolveRuntimeVariant({
      environmentVariant: "company",
      packageVariant: "standard",
    }).id).toBe("company");
  });

  it("keeps shared Dashboard assets but excludes the Remote APK from Company", () => {
    const companyBuild = require("../electron-builder.company.cjs");
    expect(companyBuild.files).toContain("electron/**");
    expect(companyBuild.files).toContain("!electron/remote-pwa/downloads/**");
    expect(companyBuild.files).not.toContain("!electron/remote-pwa/**");
  });
});
