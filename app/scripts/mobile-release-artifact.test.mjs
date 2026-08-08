import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  EXPECTED_PACKAGE,
  normalizeFingerprint,
  parsePackageMetadata,
  parseSignerMetadata,
  verifyMobileReleaseApk,
} = require("./mobile-release-artifact.cjs");

describe("mobile release artifact guard", () => {
  it("normalizes and parses the APK signing certificate", () => {
    const digest = "AA:BB:CC:DD:" + "11:".repeat(27) + "22";
    expect(normalizeFingerprint(digest)).toHaveLength(64);
    expect(parseSignerMetadata([
      "Signer #1 certificate DN: CN=MultiAgent Mobile, O=MultiAgent",
      `Signer #1 certificate SHA-256 digest: ${digest}`,
    ].join("\n"))).toEqual({
      certificateDn: "CN=MultiAgent Mobile, O=MultiAgent",
      certificateSha256: normalizeFingerprint(digest),
    });
  });

  it("parses the expected package, release flags, and architecture", () => {
    const metadata = parsePackageMetadata([
      `package: name='${EXPECTED_PACKAGE}' versionCode='12' versionName='0.5.99' platformBuildVersionName=''`,
      "sdkVersion:'24'",
      "native-code: 'arm64-v8a'",
    ].join("\n"));
    expect(metadata).toEqual({
      packageName: EXPECTED_PACKAGE,
      versionCode: "12",
      versionName: "0.5.99",
      debuggable: false,
      architectures: ["arm64-v8a"],
    });
    expect(parsePackageMetadata("application-debuggable\n").debuggable).toBe(true);
  });

  it("fails closed before packaging when release inputs are absent", () => {
    expect(() => verifyMobileReleaseApk({ apkPath: "", expectedFingerprint: "" }))
      .toThrow("MULTIAGENT_MOBILE_APK_PATH is required");
  });
});
