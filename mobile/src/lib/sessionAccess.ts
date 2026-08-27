import { NativeModules, Platform } from "react-native";

export type NativeSessionSnapshot = {
  profileId: string;
  baseUrl: string;
  ok: boolean;
  authRequired?: boolean;
  statusCode?: number;
  body?: string;
  error?: string;
};

type SessionAccessModule = {
  registerSessionAccess(
    profileId: string,
    profileName: string,
    baseUrl: string,
    token: string,
  ): Promise<{ active: boolean }>;
  removeSessionAccess(
    profileId: string,
    baseUrl: string,
    revoke: boolean,
  ): Promise<{ active: boolean }>;
  getSessionAccessStatus(
    profileId: string,
    baseUrl: string,
  ): Promise<{ active: boolean }>;
  listSessionSnapshots(): Promise<NativeSessionSnapshot[]>;
};

function module(): SessionAccessModule | null {
  return (NativeModules.MultiAgentMonitor as SessionAccessModule | undefined) ?? null;
}

export async function registerMobileSessionAccess(
  profileId: string,
  profileName: string,
  baseUrl: string,
  token: string,
) {
  const native = module();
  if (Platform.OS !== "android" || !native) return { active: false };
  return native.registerSessionAccess(profileId, profileName, baseUrl, token);
}

export async function removeMobileSessionAccess(
  profileId: string,
  baseUrl: string,
  revoke = true,
) {
  const native = module();
  if (Platform.OS !== "android" || !native) return { active: false };
  return native.removeSessionAccess(profileId, baseUrl, revoke);
}

export async function mobileSessionAccessStatus(profileId: string, baseUrl: string) {
  const native = module();
  if (Platform.OS !== "android" || !native) return { active: false };
  try {
    return await native.getSessionAccessStatus(profileId, baseUrl);
  } catch {
    return { active: false };
  }
}

export async function listMobileSessionSnapshots(): Promise<NativeSessionSnapshot[]> {
  const native = module();
  if (Platform.OS !== "android" || !native) return [];
  return native.listSessionSnapshots();
}
