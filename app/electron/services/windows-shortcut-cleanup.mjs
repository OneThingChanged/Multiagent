import fs from "node:fs";
import path from "node:path";

const LEGACY_ELECTRON_TARGET = "\\node_modules\\electron\\dist\\electron.exe";

export function isLegacyElectronDevelopmentTarget(target) {
  const normalized = String(target || "")
    .trim()
    .replaceAll("/", "\\")
    .toLowerCase();
  return normalized.endsWith(LEGACY_ELECTRON_TARGET);
}

export function legacyElectronShortcutPaths(appDataDir) {
  const root = path.resolve(String(appDataDir || ""));
  return [
    path.join(root, "Microsoft", "Windows", "Start Menu", "Programs", "Electron.lnk"),
    path.join(root, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar", "Electron.lnk"),
  ];
}

export function cleanupLegacyElectronShortcuts({
  appDataDir,
  readShortcutLink,
  existsSync = fs.existsSync,
  unlinkSync = fs.unlinkSync,
} = {}) {
  if (!appDataDir || typeof readShortcutLink !== "function") return [];
  const removed = [];
  for (const shortcutPath of legacyElectronShortcutPaths(appDataDir)) {
    try {
      if (!existsSync(shortcutPath)) continue;
      const details = readShortcutLink(shortcutPath);
      if (!isLegacyElectronDevelopmentTarget(details?.target)) continue;
      unlinkSync(shortcutPath);
      removed.push(shortcutPath);
    } catch {
      // A stale or locked shortcut must never prevent MultiAgent startup.
    }
  }
  return removed;
}
