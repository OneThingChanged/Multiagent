import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  loadStoreIdentity,
  renderManifest,
  semverToStoreVersion,
  validatePackageVersion,
} = require("./store-msix-config.cjs");

describe("Microsoft Store MSIX configuration", () => {
  it("uses the same four-part product version for Microsoft Store", () => {
    expect(semverToStoreVersion("1.0.0")).toBe("1.0.0.0");
    expect(semverToStoreVersion("1.2.3")).toBe("1.2.3.0");
    expect(() => semverToStoreVersion("0.6.28")).toThrow(/첫 자리가 1 이상/);
  });

  it("requires a non-zero first component and zero Store revision", () => {
    expect(validatePackageVersion("1.6.26.0")).toBe("1.6.26.0");
    expect(() => validatePackageVersion("0.6.26.0")).toThrow(/첫 자리가 1 이상/);
    expect(() => validatePackageVersion("1.6.26.1")).toThrow(/마지막 자리가 0/);
  });

  it("uses an isolated development identity without a local Partner Center file", () => {
    expect(loadStoreIdentity({ appVersion: "1.0.0", development: true })).toMatchObject({
      mode: "development",
      identityName: "com.jintae.multiagent.store.dev",
      packageVersion: "1.0.0.0",
    });
  });

  it("requires the production package and in-app Store product IDs to match", () => {
    const directory = mkdtempSync(join(tmpdir(), "multiagent-store-identity-"));
    const identityFile = join(directory, "identity.json");
    const identity = {
      identityName: "jintaenate.MultiAgent",
      publisher: "CN=Test",
      publisherDisplayName: "jintaenate",
      displayName: "Acedia",
      productId: "9NVBSGNRTPLR",
    };
    try {
      writeFileSync(identityFile, JSON.stringify(identity), "utf8");
      expect(loadStoreIdentity({
        appDir: directory,
        appVersion: "1.0.0",
        identityFile,
      })).toMatchObject({
        productId: "9NVBSGNRTPLR",
        packageVersion: "1.0.0.0",
      });

      writeFileSync(
        identityFile,
        JSON.stringify({ ...identity, productId: "9AAAAAAAAAAA" }),
        "utf8",
      );
      expect(() => loadStoreIdentity({
        appDir: directory,
        appVersion: "1.0.0",
        identityFile,
      })).toThrow("업데이트 대상과 일치하지 않습니다");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("escapes Partner Center display values in the manifest", () => {
    const rendered = renderManifest(
      '<Identity Name="{{identityName}}" Publisher="{{publisher}}"/><Name>{{displayName}}</Name>',
      {
        identityName: "Publisher.MultiAgent",
        publisher: 'CN=A&B "Studio"',
        packageVersion: "1.6.26.0",
        displayName: "Acedia <Store>",
        publisherDisplayName: "Studio",
        description: "Description",
      }
    );
    expect(rendered).toContain('Publisher="CN=A&amp;B &quot;Studio&quot;"');
    expect(rendered).toContain("Acedia &lt;Store&gt;");
  });
});
