import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertMobileSourceVersions,
  renderAndroidGradleVersions,
  synchronizeAndroidVersion,
} from "../scripts/android-version-config.mjs";

test("requires the mobile package and Expo versions to match", () => {
  assert.equal(assertMobileSourceVersions("1.7.3", "1.7.3.1", "1.7.3.1"), "1.7.3.1");
  assert.throws(() => assertMobileSourceVersions("1.7.3", "1.7.3.65536", "1.7.3.65536"));
  assert.equal(
    assertMobileSourceVersions("1.0.0", "1.0.0.0", "1.0.0.0"),
    "1.0.0.0",
  );
  assert.throws(
    () => assertMobileSourceVersions("1.0.1", "1.0.0.0", "1.0.0.0"),
    /does not match release/,
  );
});

test("renders the Expo release version into generated Gradle configuration", () => {
  const source = "defaultConfig {\n    versionCode 9\n    versionName '0.6.27'\n}\n";
  assert.equal(
    renderAndroidGradleVersions(source, { versionName: "1.0.0.0", versionCode: 1 }),
    "defaultConfig {\n    versionCode 1\n    versionName \"1.0.0.0\"\n}\n",
  );
});

test("synchronizes the ignored native project from tracked release metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-mobile-version-"));
  try {
    fs.mkdirSync(path.join(root, "android", "app"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      version: "1.0.0",
      multiAgentReleaseVersion: "1.0.0.0",
    }));
    fs.writeFileSync(path.join(root, "app.json"), JSON.stringify({
      expo: { version: "1.0.0.0", android: { versionCode: 1 } },
    }));
    fs.writeFileSync(
      path.join(root, "android", "app", "build.gradle"),
      "defaultConfig {\n  versionCode 9\n  versionName \"0.6.27\"\n}\n",
    );

    assert.deepEqual(synchronizeAndroidVersion(root), {
      versionName: "1.0.0.0",
      versionCode: 1,
      changed: true,
    });
    assert.match(
      fs.readFileSync(path.join(root, "android", "app", "build.gradle"), "utf8"),
      /versionCode 1[\s\S]*versionName "1\.0\.0\.0"/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
