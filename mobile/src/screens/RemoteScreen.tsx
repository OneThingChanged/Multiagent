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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import {
  isAllowedInAppNavigation,
  mobileAuthCompleteUrl,
  remoteAppUrl,
} from "../lib/remoteUrl";
import {
  isTrustedNativeBridgeUrl,
  nativeBridgeEventScript,
  parseNativeBridgeRequest,
} from "../lib/notificationBridge";
import {
  foregroundMonitorStatus,
  startForegroundMonitor,
  stopForegroundMonitor,
  type ForegroundMonitorState,
} from "../lib/foregroundMonitor";
import {
  mobileSessionAccessStatus,
  registerMobileSessionAccess,
} from "../lib/sessionAccess";
import type { RemoteProfile } from "../lib/profiles";
import { resolveRemoteBackAction } from "../lib/profileViews";

type Props = {
  active: boolean;
  profile: RemoteProfile;
  mobileAuthTarget: { profileId: string; ticket: string; nonce: number } | null;
  notificationTarget: { profileId: string | null; agentId: string; url: string; nonce: number } | null;
  onMobileAuthConsumed: () => void;
  onNotificationConsumed: () => void;
  onReturnToHub: () => void;
  onManageProfiles: () => void;
};

export function RemoteScreen({
  active,
  profile,
  mobileAuthTarget,
  notificationTarget,
  onMobileAuthConsumed,
  onNotificationConsumed,
  onReturnToHub,
  onManageProfiles,
}: Props) {
  const safeAreaInsets = useSafeAreaInsets();
  const baseUrl = profile.baseUrl;
  const webView = useRef<WebView>(null);
  const pageLoaded = useRef(false);
  const nativeMonitorState = useRef<ForegroundMonitorState | null>(null);
  const nativeSessionAccessState = useRef<{ active: boolean } | null>(null);
  const pendingOpen = useRef<{ agentId: string; url: string } | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const appUrl = useMemo(() => remoteAppUrl(baseUrl), [baseUrl]);
  const [navigationUrl, setNavigationUrl] = useState(() => mobileAuthTarget
    ? mobileAuthCompleteUrl(baseUrl, mobileAuthTarget.ticket)
    : appUrl);
  const hostname = useMemo(() => new URL(baseUrl).host, [baseUrl]);
  const remoteOrigin = useMemo(() => new URL(baseUrl).origin, [baseUrl]);
  const nativeSafeAreaScript = useMemo(() => `
    document.documentElement.style.setProperty(
      "--native-safe-area-bottom",
      ${JSON.stringify(`${Math.max(0, Math.round(safeAreaInsets.bottom))}px`)},
    );
    true;
  `, [safeAreaInsets.bottom]);
  const nativeBootstrap = useMemo(() => `
    if (location.origin === ${JSON.stringify(remoteOrigin)}) {
      window.__MULTIAGENT_NATIVE_APP__ = true;
      window.__MULTIAGENT_NATIVE_EXTERNAL_PREVIEW__ = true;
      window.__MULTIAGENT_PROFILE_ID__ = ${JSON.stringify(profile.id)};
      document.documentElement.dataset.nativeApp = "true";
      ${nativeSafeAreaScript}
    }
    true;
  `, [nativeSafeAreaScript, profile.id, remoteOrigin]);

  const isRemotePage = (url: string) => {
    return isTrustedNativeBridgeUrl(baseUrl, url);
  };

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (resolveRemoteBackAction(canGoBack) === "web-history") {
          webView.current?.goBack();
          return true;
        }
        onReturnToHub();
        return true;
      }
    );
    return () => subscription.remove();
  }, [active, canGoBack, onReturnToHub]);

  const dispatchToPage = (eventName: string, detail: unknown) => {
    if (!pageLoaded.current) return false;
    webView.current?.injectJavaScript(nativeBridgeEventScript(eventName, detail));
    return true;
  };

  const deliverMonitorState = (
    state: ForegroundMonitorState,
    userInitiated = false,
  ) => {
    nativeMonitorState.current = state;
    dispatchToPage("multiagent:native-monitor-state", {
      ...state,
      userInitiated,
    });
  };

  const deliverSessionAccessState = (state: { active: boolean }) => {
    nativeSessionAccessState.current = state;
    dispatchToPage("multiagent:native-session-access-state", state);
  };

  useEffect(() => {
    void foregroundMonitorStatus(profile.id, remoteOrigin).then((state) => deliverMonitorState(state));
    void mobileSessionAccessStatus(profile.id, remoteOrigin).then(deliverSessionAccessState);
  }, [profile.id]);

  // Android edge-to-edge layout can change its bottom inset when rotating or
  // when a tablet taskbar appears. Keep the already loaded Remote page in sync
  // without reserving a second native SafeAreaView strip below the WebView.
  useEffect(() => {
    if (pageLoaded.current) webView.current?.injectJavaScript(nativeSafeAreaScript);
  }, [nativeSafeAreaScript]);

  useEffect(() => {
    if (!mobileAuthTarget || mobileAuthTarget.profileId !== profile.id) return;
    setNavigationUrl(mobileAuthCompleteUrl(baseUrl, mobileAuthTarget.ticket));
    onMobileAuthConsumed();
  }, [mobileAuthTarget?.nonce, profile.id]);

  useEffect(() => {
    if (!notificationTarget || notificationTarget.profileId !== profile.id) return;
    const target = { agentId: notificationTarget.agentId, url: notificationTarget.url };
    if (!dispatchToPage("multiagent:native-notification-open", target)) pendingOpen.current = target;
    onNotificationConsumed();
  }, [notificationTarget?.nonce, profile.id]);

  const handleNativeMessage = (event: WebViewMessageEvent) => {
    if (!isRemotePage(event.nativeEvent.url)) return;
    const request = parseNativeBridgeRequest(event.nativeEvent.data);
    if (!request) return;
    if (request.type === "multiagent:start-native-monitor") {
      void startForegroundMonitor(profile.id, profile.name, remoteOrigin, request.token, request.cursor)
        .then((state) => deliverMonitorState(state, true));
      return;
    }
    if (request.type === "multiagent:register-native-session-access") {
      void registerMobileSessionAccess(
        profile.id,
        profile.name,
        remoteOrigin,
        request.token,
      ).then(deliverSessionAccessState);
      return;
    }
    if (request.type === "multiagent:open-external-preview") {
      try {
        const target = new URL(request.url);
        if (
          isTrustedNativeBridgeUrl(baseUrl, target.href) &&
          /^\/preview\/[A-Za-z0-9_-]{43}\//.test(target.pathname)
        ) {
          void Linking.openURL(target.href).catch(() => {});
        }
      } catch {}
      return;
    }
    void stopForegroundMonitor(profile.id, remoteOrigin, request.revoke)
      .then((state) => deliverMonitorState(state, true));
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
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
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
                else onReturnToHub();
              }}
              accessibilityLabel="뒤로"
            >
              <Text style={styles.toolGlyph}>‹</Text>
            </Pressable>
            <View style={styles.hostBlock}>
              <Text numberOfLines={1} style={styles.hostTitle}>
                {profile.name}
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
              onPress={onManageProfiles}
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
          source={{ uri: navigationUrl }}
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
          applicationNameForUserAgent="MultiAgentMobile/0.3.5"
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
            if (pageLoaded.current && nativeMonitorState.current) {
              dispatchToPage("multiagent:native-monitor-state", {
                ...nativeMonitorState.current,
                userInitiated: false,
              });
            }
            if (pageLoaded.current && nativeSessionAccessState.current) {
              dispatchToPage("multiagent:native-session-access-state", nativeSessionAccessState.current);
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
              <Pressable style={styles.settingsButton} onPress={onManageProfiles}>
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
