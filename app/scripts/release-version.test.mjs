import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  parseReleaseVersion,
  releaseVersionToUpdaterVersion,
  resolveReleaseVersions,
} = require("./release-version.cjs");

describe("four-part release version", () => {
  it("accepts commit revisions while retaining npm compatibility", () => {
    expect(resolveReleaseVersions({ version: "1.7.3", multiAgentReleaseVersion: "1.7.3.1" }))
      .toEqual({ releaseVersion: "1.7.3.1", updaterVersion: "1.7.3" });
    expect(() => parseReleaseVersion("1.7.3.65536")).toThrow();
  });
  it("uses the Windows four-part version as the product version", () => {
    expect(parseReleaseVersion("1.0.0.0")).toEqual([1, 0, 0, 0]);
    expect(releaseVersionToUpdaterVersion("1.0.0.0")).toBe("1.0.0");
  });

  it("keeps the npm/updater compatibility version derived from the product version", () => {
    expect(resolveReleaseVersions({
      version: "1.0.0",
      multiAgentReleaseVersion: "1.0.0.0",
    })).toEqual({ releaseVersion: "1.0.0.0", updaterVersion: "1.0.0" });
    expect(() => resolveReleaseVersions({
      version: "1.0.1",
      multiAgentReleaseVersion: "1.0.0.0",
    })).toThrow("must match release");
  });
});
