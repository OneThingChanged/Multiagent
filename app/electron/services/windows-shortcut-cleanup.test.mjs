import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupLegacyElectronShortcuts,
  isLegacyElectronDevelopmentTarget,
  legacyElectronShortcutPaths,
} from "./windows-shortcut-cleanup.mjs";

describe("Windows legacy Electron shortcut cleanup", () => {
  it("recognizes only development Electron executable targets", () => {
    expect(isLegacyElectronDevelopmentTarget("K:/AI/MultiAgent/app/node_modules/electron/dist/electron.exe")).toBe(true);
    expect(isLegacyElectronDevelopmentTarget("C:\\Programs\\Electron\\electron.exe")).toBe(false);
    expect(isLegacyElectronDevelopmentTarget("C:\\Programs\\MultiAgent\\MultiAgent.exe")).toBe(false);
  });

  it("removes matching Start Menu and taskbar shortcuts", () => {
    const appDataDir = "C:\\Users\\tester\\AppData\\Roaming";
    const candidates = legacyElectronShortcutPaths(appDataDir);
    const unlinkSync = vi.fn();
    const removed = cleanupLegacyElectronShortcuts({
      appDataDir,
      existsSync: () => true,
      readShortcutLink: () => ({ target: "K:\\repo\\node_modules\\electron\\dist\\electron.exe" }),
      unlinkSync,
    });

    expect(removed).toEqual(candidates);
    expect(unlinkSync).toHaveBeenCalledTimes(2);
  });

  it("keeps unrelated Electron shortcuts and ignores read failures", () => {
    const appDataDir = "C:\\Users\\tester\\AppData\\Roaming";
    const candidates = legacyElectronShortcutPaths(appDataDir);
    const unlinkSync = vi.fn();
    const removed = cleanupLegacyElectronShortcuts({
      appDataDir,
      existsSync: () => true,
      readShortcutLink: (shortcutPath) => {
        if (shortcutPath === candidates[0]) return { target: path.join("C:\\Apps", "Electron", "electron.exe") };
        throw new Error("broken shortcut");
      },
      unlinkSync,
    });

    expect(removed).toEqual([]);
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});
