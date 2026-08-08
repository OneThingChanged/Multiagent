import * as Linking from "expo-linking";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import {
  isAllowedInAppNavigation,
  remoteAppUrl,
} from "../lib/remoteUrl";
import {
  isTrustedNativeBridgeUrl,
  nativeBridgeEventScript,
  normalizeNotificationOpenData,
  parseNativeBridgeRequest,
} from "../lib/notificationBridge";
import {
  Notifications,
  registerNativePushAsync,
  type NativePushRegistration,
} from "../lib/nativePush";

type Props = {
  baseUrl: string;
  onDisconnect: () => void;
};

export function RemoteScreen({ baseUrl, onDisconnect }: Props) {
  const webView = useRef<WebView>(null);
  const pageLoaded = useRef(false);
  const nativeRegistration = useRef<NativePushRegistration | null>(null);
  const pendingOpen = useRef<{ agentId: string; url: string } | null>(null);
  const handledNotification = useRef("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const appUrl = useMemo(() => remoteAppUrl(baseUrl), [baseUrl]);
  const hostname = useMemo(() => new URL(baseUrl).host, [baseUrl]);
  const remoteOrigin = useMemo(() => new URL(baseUrl).origin, [baseUrl]);
  const nativeBootstrap = useMemo(() => `
    if (location.origin === ${JSON.stringify(remoteOrigin)}) {
      window.__MULTIAGENT_NATIVE_APP__ = true;
      document.documentElement.dataset.nativeApp = "true";
    }
    true;
  `, [remoteOrigin]);

  const isRemotePage = (url: string) => {
    return isTrustedNativeBridgeUrl(baseUrl, url);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canGoBack) {
          webView.current?.goBack();
          return true;
        }
        if (toolbarCollapsed) {
          setToolbarCollapsed(false);
          return true;
        }
        return false;
      }
    );
    return () => subscription.remove();
  }, [canGoBack, toolbarCollapsed]);

  const dispatchToPage = (eventName: string, detail: unknown) => {
    if (!pageLoaded.current) return false;
    webView.current?.injectJavaScript(nativeBridgeEventScript(eventName, detail));
    return true;
  };

  const deliverRegistration = (
    registration: NativePushRegistration,
    userInitiated = false,
  ) => {
    nativeRegistration.current = registration;
    dispatchToPage("multiagent:native-push-registration", {
      ...registration,
      userInitiated,
    });
  };

  const deliverNotificationOpen = (response: Notifications.NotificationResponse | null) => {
    if (!response || handledNotification.current === response.notification.request.identifier) return;
    const target = normalizeNotificationOpenData(response.notification.request.content.data);
    if (!target) return;
    handledNotification.current = response.notification.request.identifier;
    if (!dispatchToPage("multiagent:native-notification-open", target)) {
      pendingOpen.current = target;
    }
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(deliverNotificationOpen);
    void Notifications.getLastNotificationResponseAsync().then(deliverNotificationOpen);
    void registerNativePushAsync(false).then((registration) => {
      if (registration.ok) deliverRegistration(registration);
    });
    return () => subscription.remove();
  }, []);

  const handleNativeMessage = (event: WebViewMessageEvent) => {
    if (!isRemotePage(event.nativeEvent.url)) return;
    const request = parseNativeBridgeRequest(event.nativeEvent.data);
    if (!request) return;
    void registerNativePushAsync(true).then((registration) => {
      deliverRegistration(registration, true);
    });
  };

  const navigationChanged = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  };

  const shouldStart = (request: { url: string }) => {
    if (
      request.url === "about:blank" ||
      isAllowedInAppNavigation(baseUrl, request.url)
    ) {
      return true;
    }
    if (/^https?:\/\//i.test(request.url)) {
      void Linking.openURL(request.url).catch(() => {});
    }
    return false;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View
        style={[
          styles.toolbar,
          toolbarCollapsed && styles.toolbarCollapsed,
        ]}
      >
        {toolbarCollapsed ? (
          <Pressable
            style={styles.expandButton}
            onPress={() => setToolbarCollapsed(false)}
            accessibilityLabel="연결 도구 열기"
          >
            <View style={styles.liveDot} />
            <Text numberOfLines={1} style={styles.collapsedHost}>
              {hostname}
            </Text>
            <Text style={styles.expandGlyph}>⌄</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={styles.toolButton}
              onPress={() => {
                if (canGoBack) webView.current?.goBack();
                else onDisconnect();
              }}
              accessibilityLabel="뒤로"
            >
              <Text style={styles.toolGlyph}>‹</Text>
            </Pressable>
            <View style={styles.hostBlock}>
              <Text numberOfLines={1} style={styles.hostTitle}>
                MultiAgent
              </Text>
              <Text numberOfLines={1} style={styles.hostName}>
                {hostname}
              </Text>
            </View>
            <Pressable
              style={styles.toolButton}
              onPress={() => webView.current?.reload()}
              accessibilityLabel="새로고침"
            >
              <Text style={styles.toolGlyph}>↻</Text>
            </Pressable>
            <Pressable
              style={styles.toolButton}
              onPress={onDisconnect}
              accessibilityLabel="연결 설정"
            >
              <Text style={styles.toolGlyph}>⚙</Text>
            </Pressable>
            <Pressable
              style={styles.collapseButton}
              onPress={() => setToolbarCollapsed(true)}
              accessibilityLabel="연결 도구 접기"
            >
              <Text style={styles.collapseGlyph}>⌃</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.webContainer}>
        <WebView
          ref={webView}
          source={{ uri: appUrl }}
          originWhitelist={["https://*", "http://*"]}
          injectedJavaScriptBeforeContentLoaded={nativeBootstrap}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled={false}
          cacheEnabled
          pullToRefreshEnabled={Platform.OS === "android"}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          allowsBackForwardNavigationGestures
          mixedContentMode="never"
          applicationNameForUserAgent="MultiAgentMobile/0.1.0"
          onShouldStartLoadWithRequest={shouldStart}
          onNavigationStateChange={navigationChanged}
          onMessage={handleNativeMessage}
          onLoadStart={() => {
            pageLoaded.current = false;
            setLoading(true);
            setLoadError("");
          }}
          onLoadEnd={(event) => {
            pageLoaded.current = isRemotePage(event.nativeEvent.url);
            setLoading(false);
            if (pageLoaded.current && nativeRegistration.current) {
              dispatchToPage("multiagent:native-push-registration", {
                ...nativeRegistration.current,
                userInitiated: false,
              });
            }
            if (pageLoaded.current && pendingOpen.current) {
              dispatchToPage("multiagent:native-notification-open", pendingOpen.current);
              pendingOpen.current = null;
            }
          }}
          onError={(event) => {
            setLoading(false);
            setLoadError(
              event.nativeEvent.description || "Remote 화면을 열 수 없습니다."
            );
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 500) {
              setLoadError(`서버 오류 (${event.nativeEvent.statusCode})`);
            }
          }}
          style={styles.web}
        />
        {loading && (
          <View pointerEvents="none" style={styles.loading}>
            <ActivityIndicator color="#55e4d4" size="large" />
            <Text style={styles.loadingText}>Remote 연결 중…</Text>
          </View>
        )}
        {!!loadError && !loading && (
          <View style={styles.errorPanel}>
            <Text style={styles.errorTitle}>연결할 수 없습니다</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <View style={styles.errorActions}>
              <Pressable
                style={styles.retryButton}
                onPress={() => webView.current?.reload()}
              >
                <Text style={styles.retryText}>다시 시도</Text>
              </Pressable>
              <Pressable style={styles.settingsButton} onPress={onDisconnect}>
                <Text style={styles.settingsText}>주소 변경</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#06101a",
  },
  toolbar: {
    position: "relative",
    zIndex: 3,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#173447",
    backgroundColor: "#07131d",
  },
  toolbarCollapsed: {
    height: 25,
    paddingHorizontal: 0,
  },
  expandButton: {
    flex: 1,
    height: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#55e4d4",
  },
  collapsedHost: {
    maxWidth: "60%",
    color: "#7794a6",
    fontSize: 9,
  },
  expandGlyph: {
    color: "#567589",
    fontSize: 12,
  },
  toolButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 8,
    backgroundColor: "#0b1c28",
  },
  toolGlyph: {
    color: "#c6dce5",
    fontSize: 18,
    lineHeight: 20,
  },
  hostBlock: {
    minWidth: 0,
    flex: 1,
    paddingHorizontal: 3,
  },
  hostTitle: {
    color: "#ecf7fb",
    fontSize: 11,
    fontWeight: "800",
  },
  hostName: {
    marginTop: 1,
    color: "#607f92",
    fontSize: 8,
  },
  collapseButton: {
    width: 20,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  collapseGlyph: {
    color: "#567589",
    fontSize: 11,
  },
  webContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: "#06101a",
  },
  web: {
    flex: 1,
    backgroundColor: "#06101a",
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#06101a",
  },
  loadingText: {
    color: "#7894a6",
    fontSize: 12,
  },
  errorPanel: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#06101a",
  },
  errorTitle: {
    color: "#ecf7fb",
    fontSize: 19,
    fontWeight: "800",
  },
  errorText: {
    maxWidth: 320,
    marginTop: 8,
    color: "#8fa9ba",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  errorActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 18,
  },
  retryButton: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#55e4d4",
  },
  retryText: {
    color: "#03201d",
    fontSize: 12,
    fontWeight: "800",
  },
  settingsButton: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#26485c",
    borderRadius: 9,
    backgroundColor: "#0a1925",
  },
  settingsText: {
    color: "#c6dce5",
    fontSize: 12,
    fontWeight: "700",
  },
});
