import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
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

const STORAGE_KEY = "multiagent.mobile.remoteUrl.v1";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync("#06101a");
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        setRemoteUrl(stored);
        setConnectedUrl(stored);
      })
      .finally(() => setBooting(false));
  }, []);

  const connect = async (value: string) => {
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
      await AsyncStorage.setItem(STORAGE_KEY, normalized);
      setRemoteUrl(normalized);
      setConnectedUrl(normalized);
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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {booting ? (
        <View style={styles.boot}>
          <ActivityIndicator color="#55e4d4" size="large" />
          <Text style={styles.bootText}>MultiAgent 연결 준비 중…</Text>
        </View>
      ) : connectedUrl ? (
        <RemoteScreen
          baseUrl={connectedUrl}
          onDisconnect={() => setConnectedUrl(null)}
        />
      ) : (
        <ConnectionScreen
          initialUrl={remoteUrl}
          busy={connecting}
          error={connectionError}
          onConnect={connect}
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
