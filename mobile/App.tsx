import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionScreen } from "./src/screens/ConnectionScreen";
import { RemoteScreen } from "./src/screens/RemoteScreen";
import { normalizeRemoteUrl } from "./src/lib/remoteUrl";
import { normalizeNotificationOpenUrl } from "./src/lib/notificationBridge";
import { stopForegroundMonitor } from "./src/lib/foregroundMonitor";
import {
  createRemoteProfile,
  parseRemoteProfileState,
  upsertRemoteProfile,
  type RemoteProfile,
} from "./src/lib/profiles";

const LEGACY_STORAGE_KEY = "multiagent.mobile.remoteUrl.v1";
const PROFILE_STORAGE_KEY = "multiagent.mobile.profiles.v2";

type NotificationTarget = NonNullable<ReturnType<typeof normalizeNotificationOpenUrl>> & {
  nonce: number;
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [profiles, setProfiles] = useState<RemoteProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [connectedProfileId, setConnectedProfileId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [notificationTarget, setNotificationTarget] = useState<NotificationTarget | null>(null);
  const [pendingLinkVersion, setPendingLinkVersion] = useState(0);
  const pendingLink = useRef<string | null>(null);

  const persistProfiles = async (nextProfiles: RemoteProfile[], nextSelectedProfileId: string | null) => {
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      profiles: nextProfiles,
      selectedProfileId: nextSelectedProfileId,
    }));
  };

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync("#06101a");
    void Promise.all([
      AsyncStorage.getItem(PROFILE_STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_STORAGE_KEY),
    ])
      .then(([storedProfiles, legacyUrl]) => {
        const state = parseRemoteProfileState(storedProfiles, legacyUrl);
        setProfiles(state.profiles);
        setSelectedProfileId(state.selectedProfileId);
        setConnectedProfileId(state.selectedProfileId);
        if (!storedProfiles && state.profiles.length > 0) {
          void persistProfiles(state.profiles, state.selectedProfileId);
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const queueLink = (url: string | null) => {
      if (!url) return;
      pendingLink.current = url;
      setPendingLinkVersion((version) => version + 1);
    };
    const subscription = Linking.addEventListener("url", (event) => queueLink(event.url));
    void Linking.getInitialURL().then(queueLink);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (booting || !pendingLink.current) return;
    const target = normalizeNotificationOpenUrl(pendingLink.current);
    pendingLink.current = null;
    if (!target) return;
    const profile = target.profileId
      ? profiles.find((item) => item.id === target.profileId)
      : profiles.find((item) => item.id === selectedProfileId) ?? profiles[0];
    if (!profile) return;
    setSelectedProfileId(profile.id);
    setConnectedProfileId(profile.id);
    setNotificationTarget({ ...target, profileId: profile.id, nonce: Date.now() });
    void persistProfiles(profiles, profile.id);
  }, [booting, pendingLinkVersion, profiles, selectedProfileId]);

  const connect = async (name: string, value: string) => {
    setConnecting(true);
    setConnectionError("");
    try {
      const normalized = normalizeRemoteUrl(value);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(new URL("/auth/mode", normalized), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`서버 응답 오류 (${response.status})`);
        }
      } finally {
        clearTimeout(timer);
      }
      const nextProfiles = upsertRemoteProfile(profiles, createRemoteProfile(normalized, name));
      const profile = nextProfiles.find((item) => item.baseUrl === normalized)!;
      await persistProfiles(nextProfiles, profile.id);
      setProfiles(nextProfiles);
      setSelectedProfileId(profile.id);
      setConnectedProfileId(profile.id);
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "서버 연결 시간이 초과되었습니다."
          : error instanceof Error
            ? error.message
            : "서버에 연결하지 못했습니다.";
      setConnectionError(message);
    } finally {
      setConnecting(false);
    }
  };

  const selectProfile = async (profile: RemoteProfile) => {
    setConnectionError("");
    await persistProfiles(profiles, profile.id);
    setSelectedProfileId(profile.id);
    setConnectedProfileId(profile.id);
  };

  const deleteProfile = async (profile: RemoteProfile) => {
    await stopForegroundMonitor(profile.id, profile.baseUrl, true);
    const nextProfiles = profiles.filter((item) => item.id !== profile.id);
    const nextSelected = selectedProfileId === profile.id
      ? nextProfiles[0]?.id ?? null
      : selectedProfileId;
    await persistProfiles(nextProfiles, nextSelected);
    setProfiles(nextProfiles);
    setSelectedProfileId(nextSelected);
    if (connectedProfileId === profile.id) setConnectedProfileId(null);
  };

  const connectedProfile = profiles.find((profile) => profile.id === connectedProfileId) ?? null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {booting ? (
        <View style={styles.boot}>
          <ActivityIndicator color="#55e4d4" size="large" />
          <Text style={styles.bootText}>MultiAgent 연결 준비 중…</Text>
        </View>
      ) : connectedProfile ? (
        <RemoteScreen
          key={connectedProfile.id}
          profile={connectedProfile}
          notificationTarget={notificationTarget?.profileId === connectedProfile.id ? notificationTarget : null}
          onNotificationConsumed={() => setNotificationTarget(null)}
          onManageProfiles={() => setConnectedProfileId(null)}
        />
      ) : (
        <ConnectionScreen
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          busy={connecting}
          error={connectionError}
          onConnect={connect}
          onSelect={selectProfile}
          onDelete={deleteProfile}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#06101a",
  },
  bootText: {
    color: "#8fa9ba",
    fontSize: 13,
  },
});
