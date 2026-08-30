import { invoke } from "./runtime";
import {
  hasSharedWorkspaceData,
  mergeSharedWorkspaceValues,
  sanitizeSharedWorkspaceValues,
  sharedWorkspaceSignature,
  SHARED_WORKSPACE_KEYS,
} from "./sharedWorkspace";
import type { SharedWorkspaceValues } from "./sharedWorkspace";

const SYNC_REVISION_KEY = "multiagent.sharedWorkspaceRevision.v1";
const MAX_SNAPSHOT_CHARACTERS = 50 * 1024 * 1024;
export const LS_REOPEN_AGENTS = "multiagent.reopenAgents.v1";

export type StorageSnapshot = {
  version: 1 | 2;
  revision?: string;
  updatedAt: string;
  values: Record<string, string>;
};

let lastPersistedSignature: string | null = null;

export function captureSharedWorkspaceValues(): SharedWorkspaceValues {
  return Object.fromEntries(
    SHARED_WORKSPACE_KEYS.map((key) => [key, localStorage.getItem(key) ?? "[]"])
  ) as SharedWorkspaceValues;
}

function applySharedWorkspaceValues(values: SharedWorkspaceValues) {
  for (const key of SHARED_WORKSPACE_KEYS) localStorage.setItem(key, values[key]);
}

function createSnapshot(values: SharedWorkspaceValues): StorageSnapshot {
  let total = 0;
  for (const [key, value] of Object.entries(values)) {
    total += key.length + value.length;
    if (total > MAX_SNAPSHOT_CHARACTERS) {
      throw new Error("공용 작업공간 데이터가 너무 큽니다.");
    }
  }
  return {
    version: 2,
    revision: `${Date.now()}-${crypto.randomUUID()}`,
    updatedAt: new Date().toISOString(),
    values,
  };
}

export async function persistStorageSnapshot(force = false) {
  const values = captureSharedWorkspaceValues();
  const signature = sharedWorkspaceSignature(values);
  if (!force && signature === lastPersistedSignature) return false;

  const snapshot = createSnapshot(values);
  await invoke("persist_storage_snapshot", { snapshot });
  localStorage.setItem(SYNC_REVISION_KEY, snapshot.revision ?? "");
  lastPersistedSignature = signature;
  return true;
}

export async function syncReopenStateBeforeRender() {
  const state = await invoke<{
    version: number;
    updatedAt?: string | null;
    agentIds: unknown[];
  } | null>("reopen_state_get").catch(() => null);
  if (!state || state.version !== 1 || !Array.isArray(state.agentIds)) {
    return false;
  }
  const agentIds = [
    ...new Set(
      state.agentIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value && value.length <= 256)
        .slice(0, 10_000)
    ),
  ];
  localStorage.setItem(LS_REOPEN_AGENTS, JSON.stringify(agentIds));
  return true;
}

/**
 * Synchronize project/session registries before React reads localStorage.
 *
 * A runtime with no revision marker is entering the shared store for the first
 * time, so its existing records are unioned with the shared records by stable
 * id. Once a marker exists, the shared revision is authoritative. This keeps
 * intentional deletions deleted while protecting an existing local workspace
 * from an older empty shared snapshot.
 */
export async function syncSharedStorageBeforeRender() {
  const snapshot = await invoke<StorageSnapshot | null>("storage_snapshot_get").catch(
    () => null
  );
  const localValues = captureSharedWorkspaceValues();

  if (!snapshot?.values) {
    lastPersistedSignature = null;
    if (hasSharedWorkspaceData(localValues)) await persistStorageSnapshot(true);
    return false;
  }

  const sharedValues = sanitizeSharedWorkspaceValues(snapshot.values);
  const localRevision = localStorage.getItem(SYNC_REVISION_KEY);
  const sharedRevision = snapshot.version === 2 ? snapshot.revision ?? "" : "";

  if (snapshot.version === 2 && localRevision) {
    if (localRevision !== sharedRevision) applySharedWorkspaceValues(sharedValues);
    localStorage.setItem(SYNC_REVISION_KEY, sharedRevision);
    lastPersistedSignature = sharedWorkspaceSignature(sharedValues);
    return localRevision !== sharedRevision;
  }

  const merged = mergeSharedWorkspaceValues(localValues, sharedValues);
  applySharedWorkspaceValues(merged);
  const mergedSignature = sharedWorkspaceSignature(merged);
  const sharedSignature = sharedWorkspaceSignature(sharedValues);

  if (snapshot.version !== 2 || mergedSignature !== sharedSignature) {
    lastPersistedSignature = null;
    await persistStorageSnapshot(true);
  } else {
    localStorage.setItem(SYNC_REVISION_KEY, sharedRevision);
    lastPersistedSignature = mergedSignature;
  }
  return mergedSignature !== sharedWorkspaceSignature(localValues);
}
