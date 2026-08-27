import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  mergeHubSnapshots,
  type HubProfileState,
  type HubSession,
  type HubSessionStatus,
} from "../lib/sessionHubData";
import { listMobileSessionSnapshots } from "../lib/sessionAccess";
import type { RemoteProfile } from "../lib/profiles";

type Props = {
  profiles: RemoteProfile[];
  onOpenProfile: (profile: RemoteProfile) => void;
  onOpenSession: (profile: RemoteProfile, agentId: string) => void;
  onManageProfiles: () => void;
};

const STATUS: Record<HubSessionStatus, { label: string; color: string }> = {
  working: { label: "작업 중", color: "#f7c75b" },
  attention: { label: "답변 필요", color: "#63c9ff" },
  recovering: { label: "복구 중", color: "#c7a0ff" },
  starting: { label: "시작 중", color: "#8db8ff" },
  done: { label: "완료", color: "#63e6ad" },
  idle: { label: "대기", color: "#8fa9ba" },
  offline: { label: "비활성", color: "#ff8589" },
};

export function SessionHubScreen({
  profiles,
  onOpenProfile,
  onOpenSession,
  onManageProfiles,
}: Props) {
  const [servers, setServers] = useState<HubProfileState[]>(() => mergeHubSnapshots(profiles, []));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      const rows = await listMobileSessionSnapshots();
      setServers(mergeHubSnapshots(profiles, rows));
    } catch {
      setServers(mergeHubSnapshots(profiles, []));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profiles]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sessions = useMemo(
    () => servers.flatMap((server) => server.sessions),
    [servers],
  );
  const counts = useMemo(() => ({
    total: sessions.length,
    working: sessions.filter((session) => session.status === "working").length,
    attention: sessions.filter((session) => session.status === "attention").length,
    active: sessions.filter((session) => session.active).length,
  }), [sessions]);

  const openSession = (session: HubSession) => {
    const profile = profiles.find((item) => item.id === session.profileId);
    if (profile) onOpenSession(profile, session.id);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>MULTI-PC SESSION HUB</Text>
          <Text style={styles.title}>전체 세션</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => void refresh(true)} accessibilityLabel="새로고침">
          <Text style={styles.iconGlyph}>↻</Text>
        </Pressable>
        <Pressable style={styles.settingsButton} onPress={onManageProfiles}>
          <Text style={styles.settingsText}>서버 설정</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.page}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh(true)}
            tintColor="#55e4d4"
            colors={["#55e4d4"]}
          />
        )}
      >
        <View style={styles.summaryRow}>
          <Summary label="전체" value={counts.total} color="#d9eaf0" />
          <Summary label="활성" value={counts.active} color="#55e4d4" />
          <Summary label="작업" value={counts.working} color="#f7c75b" />
          <Summary label="답변" value={counts.attention} color="#63c9ff" />
        </View>

        <Text style={styles.sectionTitle}>등록된 서버</Text>
        <View style={styles.serverList}>
          {servers.map((server) => {
            const online = server.state === "online";
            return (
              <Pressable
                key={server.profile.id}
                style={({ pressed }) => [styles.serverCard, pressed && styles.pressed]}
                onPress={() => onOpenProfile(server.profile)}
              >
                <View style={[styles.serverDot, { backgroundColor: online ? "#55e4d4" : server.state === "login-required" ? "#f7c75b" : "#ff8589" }]} />
                <View style={styles.serverCopy}>
                  <Text numberOfLines={1} style={styles.serverName}>{server.profile.name}</Text>
                  <Text numberOfLines={1} style={styles.serverHost}>{new URL(server.profile.baseUrl).host}</Text>
                </View>
                <View style={styles.serverState}>
                  <Text style={[styles.serverStateText, !online && styles.serverStateWarning]}>
                    {online ? `${server.sessions.length}개 세션` : server.state === "login-required" ? "연결 필요" : "오프라인"}
                  </Text>
                  <Text style={styles.openText}>열기 ›</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sessionHeading}>
          <Text style={styles.sectionTitle}>모든 세션</Text>
          {loading && <ActivityIndicator color="#55e4d4" size="small" />}
        </View>

        {!loading && sessions.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>표시할 세션이 없습니다</Text>
            <Text style={styles.emptyText}>
              위 서버를 열어 로그인과 PC 승인을 완료하면 해당 서버의 세션이 이 화면에 함께 표시됩니다.
            </Text>
          </View>
        )}

        <View style={styles.sessionList}>
          {sessions.map((session) => {
            const meta = STATUS[session.status];
            return (
              <Pressable
                key={`${session.profileId}:${session.id}`}
                style={({ pressed }) => [styles.sessionCard, pressed && styles.pressed]}
                onPress={() => openSession(session)}
              >
                <View style={[styles.statusLine, { backgroundColor: meta.color }]} />
                <View style={styles.sessionCopy}>
                  <View style={styles.sessionTitleRow}>
                    <Text numberOfLines={1} style={styles.sessionName}>{session.name}</Text>
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.sessionMeta}>
                    {session.project} · {session.tool}
                  </Text>
                  <Text numberOfLines={1} style={styles.profileBadge}>{session.profileName}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>

        {servers.some((server) => server.state !== "online") && (
          <View style={styles.notice}>
            {servers.filter((server) => server.state !== "online").map((server) => (
              <Text key={server.profile.id} style={styles.noticeText}>
                {server.profile.name}: {server.error}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#06101a" },
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#173447",
    backgroundColor: "#07131d",
  },
  headerCopy: { minWidth: 0, flex: 1 },
  eyebrow: { color: "#55e4d4", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 2, color: "#ecf7fb", fontSize: 20, fontWeight: "900" },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#234358",
    borderRadius: 10,
    backgroundColor: "#0a1925",
  },
  iconGlyph: { color: "#b7d0dc", fontSize: 18 },
  settingsButton: {
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#14362f",
  },
  settingsText: { color: "#6ee7c0", fontSize: 11, fontWeight: "900" },
  scroll: { flex: 1 },
  page: { flexGrow: 1, padding: 14, paddingBottom: 28 },
  summaryRow: { flexDirection: "row", gap: 7, marginBottom: 20 },
  summaryCard: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 10,
    backgroundColor: "#0a1925",
  },
  summaryValue: { fontSize: 18, fontWeight: "900" },
  summaryLabel: { marginTop: 2, color: "#66869a", fontSize: 9, fontWeight: "800" },
  sectionTitle: { color: "#d9eaf0", fontSize: 12, fontWeight: "900" },
  serverList: { gap: 8, marginTop: 9, marginBottom: 22 },
  serverCard: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 12,
    backgroundColor: "#0a1925",
  },
  pressed: { backgroundColor: "#102535" },
  serverDot: { width: 8, height: 8, borderRadius: 4 },
  serverCopy: { minWidth: 0, flex: 1 },
  serverName: { color: "#e7f4f7", fontSize: 13, fontWeight: "900" },
  serverHost: { marginTop: 3, color: "#66869a", fontSize: 9 },
  serverState: { alignItems: "flex-end", gap: 2 },
  serverStateText: { color: "#55e4d4", fontSize: 9, fontWeight: "800" },
  serverStateWarning: { color: "#f7c75b" },
  openText: { color: "#7894a6", fontSize: 9 },
  sessionHeading: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emptyCard: {
    marginTop: 9,
    padding: 18,
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 12,
    backgroundColor: "#0a1925",
  },
  emptyTitle: { color: "#d9eaf0", fontSize: 13, fontWeight: "800" },
  emptyText: { marginTop: 6, color: "#7894a6", fontSize: 11, lineHeight: 17 },
  sessionList: { gap: 8, marginTop: 9 },
  sessionCard: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 12,
    backgroundColor: "#091824",
  },
  statusLine: { width: 3 },
  sessionCopy: { minWidth: 0, flex: 1, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 9 },
  sessionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sessionName: { minWidth: 0, flex: 1, color: "#e7f4f7", fontSize: 13, fontWeight: "900" },
  statusText: { fontSize: 9, fontWeight: "900" },
  sessionMeta: { marginTop: 4, color: "#8ba5b5", fontSize: 10 },
  profileBadge: { marginTop: 4, color: "#55e4d4", fontSize: 9, fontWeight: "800" },
  chevron: { alignSelf: "center", paddingRight: 12, color: "#567589", fontSize: 21 },
  notice: {
    gap: 4,
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#493f24",
    borderRadius: 10,
    backgroundColor: "#18170f",
  },
  noticeText: { color: "#c9b76f", fontSize: 10, lineHeight: 15 },
});
