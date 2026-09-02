import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  loadStoreIdentity,
  renderManifest,
  semverToStoreVersion,
  validatePackageVersion,
} = require("./store-msix-config.cjs");

describe("Microsoft Store MSIX configuration", () => {
  it("maps pre-1 app versions to valid monotonically increasing Store versions", () => {
    expect(semverToStoreVersion("0.6.26")).toBe("1.6.26.0");
    expect(semverToStoreVersion("1.0.0")).toBe("2.0.0.0");
  });

  it("requires a non-zero first component and zero Store revision", () => {
    expect(validatePackageVersion("1.6.26.0")).toBe("1.6.26.0");
    expect(() => validatePackageVersion("0.6.26.0")).toThrow(/첫 자리가 1 이상/);
    expect(() => validatePackageVersion("1.6.26.1")).toThrow(/마지막 자리가 0/);
  });

  it("uses an isolated development identity without a local Partner Center file", () => {
    expect(loadStoreIdentity({ appVersion: "0.6.26", development: true })).toMatchObject({
      mode: "development",
      identityName: "com.jintae.multiagent.store.dev",
      packageVersion: "1.6.26.0",
    });
  });

  it("escapes Partner Center display values in the manifest", () => {
    const rendered = renderManifest(
      '<Identity Name="{{identityName}}" Publisher="{{publisher}}"/><Name>{{displayName}}</Name>',
      {
        identityName: "Publisher.MultiAgent",
        publisher: 'CN=A&B "Studio"',
        packageVersion: "1.6.26.0",
        displayName: "MultiAgent <Store>",
        publisherDisplayName: "Studio",
        description: "Description",
      }
    );
    expect(rendered).toContain('Publisher="CN=A&amp;B &quot;Studio&quot;"');
    expect(rendered).toContain("MultiAgent &lt;Store&gt;");
  });
});
