import { LS_AGENTS, LS_GROUPS, LS_PROJECTS, LS_SSH_HOSTS } from "../types";

export const SHARED_WORKSPACE_KEYS = [
  LS_PROJECTS,
  LS_AGENTS,
  LS_GROUPS,
  LS_SSH_HOSTS,
] as const;

export type SharedWorkspaceKey = (typeof SHARED_WORKSPACE_KEYS)[number];
export type SharedWorkspaceValues = Record<SharedWorkspaceKey, string>;

function parseEntities(raw: string | undefined): Array<Record<string, unknown>> | null {
  if (raw === undefined) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
    );
  } catch {
    return null;
  }
}

function mergeEntityArray(localRaw: string | undefined, sharedRaw: string | undefined) {
  const local = parseEntities(localRaw);
  const shared = parseEntities(sharedRaw);
  if (!local && !shared) return "[]";
  if (!local) return JSON.stringify(shared);
  if (!shared) return JSON.stringify(local);

  const merged = new Map<string, Record<string, unknown>>();
  for (const item of [...local, ...shared]) {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;
    // Shared values are visited last and win only when the same stable id
    // exists in both stores. Local-only legacy data is never discarded during
    // the first migration.
    merged.set(id, item);
  }
  return JSON.stringify([...merged.values()]);
}

export function sanitizeSharedWorkspaceValues(
  values: Record<string, unknown> | null | undefined
): SharedWorkspaceValues {
  return Object.fromEntries(
    SHARED_WORKSPACE_KEYS.map((key) => [
      key,
      typeof values?.[key] === "string" ? values[key] : "[]",
    ])
  ) as SharedWorkspaceValues;
}

export function mergeSharedWorkspaceValues(
  local: Record<string, unknown>,
  shared: Record<string, unknown>
): SharedWorkspaceValues {
  return Object.fromEntries(
    SHARED_WORKSPACE_KEYS.map((key) => [
      key,
      mergeEntityArray(
        typeof local[key] === "string" ? local[key] : undefined,
        typeof shared[key] === "string" ? shared[key] : undefined
      ),
    ])
  ) as SharedWorkspaceValues;
}

export function sharedWorkspaceSignature(values: SharedWorkspaceValues) {
  return SHARED_WORKSPACE_KEYS.map((key) => `${key}\0${values[key]}`).join("\0");
}

export function hasSharedWorkspaceData(values: SharedWorkspaceValues) {
  return SHARED_WORKSPACE_KEYS.some((key) => {
    const parsed = parseEntities(values[key]);
    return Boolean(parsed?.length);
  });
}
