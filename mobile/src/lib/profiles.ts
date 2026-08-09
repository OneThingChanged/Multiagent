import { normalizeRemoteUrl } from "./remoteUrl.ts";

export type RemoteProfile = {
  id: string;
  name: string;
  baseUrl: string;
};

export type RemoteProfileState = {
  profiles: RemoteProfile[];
  selectedProfileId: string | null;
};

const PROFILE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function defaultProfileName(baseUrl: string) {
  return new URL(baseUrl).host;
}

function normalizedProfileName(value: string, baseUrl: string) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 60);
  return name || defaultProfileName(baseUrl);
}

export function profileIdForUrl(baseUrl: string) {
  let hash = 0x811c9dc5;
  for (const character of baseUrl) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `pc-${(hash >>> 0).toString(36)}`;
}

export function createRemoteProfile(url: string, name = ""): RemoteProfile {
  const baseUrl = normalizeRemoteUrl(url);
  return {
    id: profileIdForUrl(baseUrl),
    name: normalizedProfileName(name, baseUrl),
    baseUrl,
  };
}

export function parseRemoteProfileState(raw: string | null, legacyUrl: string | null = null): RemoteProfileState {
  const candidates: unknown[] = [];
  let selectedProfileId: string | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed?.profiles)) candidates.push(...parsed.profiles);
    if (PROFILE_ID_PATTERN.test(String(parsed?.selectedProfileId || ""))) {
      selectedProfileId = String(parsed.selectedProfileId);
    }
  } catch {}

  if (candidates.length === 0 && legacyUrl) {
    try { candidates.push(createRemoteProfile(legacyUrl)); } catch {}
  }

  const profiles: RemoteProfile[] = [];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    try {
      const value = candidate as Partial<RemoteProfile>;
      const profile = createRemoteProfile(String(value.baseUrl || ""), String(value.name || ""));
      if (PROFILE_ID_PATTERN.test(String(value.id || ""))) profile.id = String(value.id);
      if (origins.has(profile.baseUrl)) continue;
      origins.add(profile.baseUrl);
      profiles.push(profile);
    } catch {}
  }

  if (!profiles.some((profile) => profile.id === selectedProfileId)) {
    selectedProfileId = profiles[0]?.id ?? null;
  }
  return { profiles, selectedProfileId };
}

export function upsertRemoteProfile(profiles: RemoteProfile[], profile: RemoteProfile) {
  const existingIndex = profiles.findIndex((item) => item.id === profile.id || item.baseUrl === profile.baseUrl);
  if (existingIndex < 0) return [...profiles, profile];
  const next = [...profiles];
  next[existingIndex] = { ...profile, id: next[existingIndex].id };
  return next;
}
