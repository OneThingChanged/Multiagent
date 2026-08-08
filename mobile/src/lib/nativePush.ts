import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const NATIVE_PUSH_CHANNEL = "multiagent-agent-events";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NativePushRegistration =
  | { ok: true; token: string; platform: "android" | "ios" }
  | { ok: false; error: string; skipped?: boolean };

function expoProjectId() {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  return String(Constants.easConfig?.projectId || extra?.eas?.projectId || "").trim();
}

export async function registerNativePushAsync(
  requestPermission: boolean,
): Promise<NativePushRegistration> {
  if (!Device.isDevice) {
    return { ok: false, error: "푸시 알림은 실제 Android/iOS 기기에서만 사용할 수 있습니다." };
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(NATIVE_PUSH_CHANNEL, {
      name: "에이전트 작업 상태",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#55E4D4",
      sound: "default",
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted" && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== "granted") {
    return {
      ok: false,
      skipped: !requestPermission,
      error: "휴대폰 설정에서 MultiAgent 알림 권한을 허용해 주세요.",
    };
  }

  const projectId = expoProjectId();
  if (!projectId) {
    return {
      ok: false,
      error: "이 APK에는 Expo Push 프로젝트 ID가 설정되지 않았습니다.",
    };
  }
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return {
      ok: true,
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
    };
  } catch {
    return {
      ok: false,
      error: "기기 푸시 토큰을 발급받지 못했습니다. 네트워크와 FCM 설정을 확인해 주세요.",
    };
  }
}

export { Notifications };
