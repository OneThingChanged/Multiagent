import { electronBridge } from "./electronBridge";
import { invoke } from "./runtime";

const STORAGE_PREFIX = "multiagent.";
const MAX_SNAPSHOT_CHARACTERS = 50 * 1024 * 1024;

export type StorageSnapshot = {
  version: 1;
  updatedAt: string;
  values: Record<string, string>;
};

export function captureStorageSnapshot(): StorageSnapshot {
  const values: Record<string, string> = {};
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    total += key.length + value.length;
    if (total > MAX_SNAPSHOT_CHARACTERS) break;
    values[key] = value;
  }
  return { version: 1, updatedAt: new Date().toISOString(), values };
}

export async function persistStorageSnapshot() {
  await invoke("persist_storage_snapshot", {
    snapshot: captureStorageSnapshot(),
  });
}

export async function importTauriStorageBeforeRender() {
  const bridge = electronBridge();
  if (!bridge) return false;
  const snapshot = await bridge
    .invoke<StorageSnapshot | null>("import_tauri_storage")
    .catch(() => null);
  if (!snapshot || snapshot.version !== 1 || !snapshot.values) return false;

  let changed = false;
  for (const [key, value] of Object.entries(snapshot.values)) {
    if (!key.startsWith(STORAGE_PREFIX) || typeof value !== "string") continue;
    // Electron-owned values win after the first launch; only fill missing
    // entries from the Tauri snapshot so returning users do not regress.
    if (localStorage.getItem(key) !== null) continue;
    localStorage.setItem(key, value);
    changed = true;
  }
  return changed;
}
