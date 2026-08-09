import {
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native";

type MonitorModule = {
  startMonitoring(profileId: string, profileName: string, baseUrl: string, token: string, cursor: number): Promise<{ active: boolean; count?: number }>;
  stopMonitoring(profileId: string, baseUrl: string, revoke: boolean): Promise<{ active: boolean; count?: number }>;
  getStatus(profileId: string, baseUrl: string): Promise<{ active: boolean; count?: number }>;
};

function module(): MonitorModule | null {
  return (NativeModules.MultiAgentMonitor as MonitorModule | undefined) ?? null;
}

export type ForegroundMonitorState =
  | { ok: true; active: boolean; count?: number }
  | { ok: false; active: false; error: string };

async function ensureNotificationPermission() {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

async function revokeIssuedToken(baseUrl: string, token: string) {
  try {
    await fetch(new URL("/api/monitor/device", baseUrl), {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {}
}

export async function startForegroundMonitor(
  profileId: string,
  profileName: string,
  baseUrl: string,
  token: string,
  cursor: number,
): Promise<ForegroundMonitorState> {
  const native = module();
  if (Platform.OS !== "android" || !native) {
    await revokeIssuedToken(baseUrl, token);
    return { ok: false, active: false, error: "이 APK는 백그라운드 모니터링 모듈을 포함하지 않습니다." };
  }
  if (!await ensureNotificationPermission()) {
    await revokeIssuedToken(baseUrl, token);
    return { ok: false, active: false, error: "휴대폰 설정에서 MultiAgent 알림 권한을 허용해 주세요." };
  }
  try {
    const result = await native.startMonitoring(profileId, profileName, baseUrl, token, cursor);
    return { ok: true, active: Boolean(result?.active), count: Number(result?.count) || undefined };
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error instanceof Error ? error.message : "백그라운드 모니터링을 시작하지 못했습니다.",
    };
  }
}

export async function stopForegroundMonitor(
  profileId: string,
  baseUrl: string,
  revoke = true,
): Promise<ForegroundMonitorState> {
  const native = module();
  if (Platform.OS !== "android" || !native) return { ok: true, active: false };
  try {
    const result = await native.stopMonitoring(profileId, baseUrl, revoke);
    return { ok: true, active: false, count: Number(result?.count) || undefined };
  } catch (error) {
    return {
      ok: false,
      active: false,
      error: error instanceof Error ? error.message : "백그라운드 모니터링을 중지하지 못했습니다.",
    };
  }
}

export async function foregroundMonitorStatus(profileId: string, baseUrl: string): Promise<ForegroundMonitorState> {
  const native = module();
  if (Platform.OS !== "android" || !native) return { ok: true, active: false };
  try {
    const result = await native.getStatus(profileId, baseUrl);
    return { ok: true, active: Boolean(result?.active), count: Number(result?.count) || undefined };
  } catch {
    return { ok: true, active: false };
  }
}
