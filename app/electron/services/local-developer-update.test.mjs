import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalDeveloperUpdateService,
  compareProductVersions,
  parseDeveloperInstallerName,
} from "./local-developer-update.mjs";

const temporaryDirectories = [];
function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-local-update-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fsPromises.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("local developer updates", () => {
  it("compares three and four part product versions", () => {
    expect(compareProductVersions("1.7.2", "1.7.2.0")).toBe(0);
    expect(compareProductVersions("1.10.0.0", "1.9.99.0")).toBe(1);
    expect(compareProductVersions("2.0.0.0", "10.0.0.0")).toBe(-1);
  });

  it("accepts only standard x64 installer names", () => {
    expect(parseDeveloperInstallerName("Acedia-Setup-1.8.0.0-x64.exe"))
      .toMatchObject({ version: "1.8.0.0" });
    expect(parseDeveloperInstallerName("MultiAgent-Setup-1.7.3.0-x64.exe"))
      .toMatchObject({ version: "1.7.3.0" });
    expect(parseDeveloperInstallerName("MultiAgent-Store-Release-1.7.3.0-x64.msix")).toBeNull();
    expect(parseDeveloperInstallerName("MultiAgent-Setup-1.7.3-x64.exe")).toBeNull();
  });

  it("persists the output folder and selects the highest newer installer", async () => {
    const root = temporaryDirectory();
    const output = path.join(root, "electron-dist");
    await fsPromises.mkdir(output);
    for (const name of [
      "MultiAgent-Setup-1.7.1.0-x64.exe",
      "MultiAgent-Setup-1.7.3.0-x64.exe",
      "Acedia-Setup-1.8.0.0-x64.exe",
      "MultiAgent-Setup-9.0.0.0-arm64.exe",
    ]) {
      await fsPromises.writeFile(path.join(output, name), name);
    }
    const service = new LocalDeveloperUpdateService({
      configPath: path.join(root, "settings", "developer-update.json"),
      currentVersion: "1.7.2",
    });

    await service.setDirectory(output);
    const result = await service.check();

    expect(result.directory).toBe(path.resolve(output));
    expect(result.update).toMatchObject({ version: "1.8.0.0" });
    expect(service.validatePreparedInstaller(result.update, result.directory)).toBe(true);
    expect(service.validatePreparedInstaller(
      { ...result.update, path: path.join(root, "MultiAgent-Setup-9.0.0.0-x64.exe") },
      result.directory
    )).toBe(false);
  });
});
