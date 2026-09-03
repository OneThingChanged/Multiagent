import { describe, expect, it } from "vitest";
import { compareVersions, formatProductVersion, isNewerVersion } from "./appInfo";

describe("appInfo version helpers", () => {
  it("compares plain semver values", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
  });

  it("accepts release tags with a leading v", () => {
    expect(isNewerVersion("v0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("v0.2.0", "0.2.0")).toBe(false);
  });

  it("normalizes updater semver to the four-part product version", () => {
    expect(formatProductVersion("1.0.0")).toBe("1.0.0.0");
    expect(formatProductVersion("1.0.0.0")).toBe("1.0.0.0");
    expect(compareVersions("1.0.0", "1.0.0.0")).toBe(0);
  });
});
