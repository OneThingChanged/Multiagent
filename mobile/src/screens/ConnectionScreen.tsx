import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RemoteProfile } from "../lib/profiles";

type Props = {
  profiles: RemoteProfile[];
  selectedProfileId: string | null;
  busy: boolean;
  error: string;
  onConnect: (name: string, url: string) => void;
  onSelect: (profile: RemoteProfile) => void;
  onDelete: (profile: RemoteProfile) => void;
};

export function ConnectionScreen({
  profiles,
  selectedProfileId,
  busy,
  error,
  onConnect,
  onSelect,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (profiles.length === 0) return;
    setName("");
    setUrl("");
  }, [profiles.length]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          <View style={styles.hero}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} />
            <Text style={styles.title}>MultiAgent Mobile</Text>
            <Text style={styles.subtitle}>
              여러 PC의 Remote를 등록하고 동시에 알림을 받을 수 있습니다.
            </Text>
          </View>

          {profiles.length > 0 && (
            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>등록된 PC</Text>
              {profiles.map((profile) => (
                <View key={profile.id} style={styles.profileCard}>
                  <Pressable
                    style={({ pressed }) => [styles.profileMain, pressed && styles.profilePressed]}
                    onPress={() => void onSelect(profile)}
                  >
                    <View style={styles.profileDot} />
                    <View style={styles.profileCopy}>
                      <Text numberOfLines={1} style={styles.profileName}>{profile.name}</Text>
                      <Text numberOfLines={1} style={styles.profileUrl}>{new URL(profile.baseUrl).host}</Text>
                    </View>
                    {profile.id === selectedProfileId && <Text style={styles.recentBadge}>최근</Text>}
                    <Text style={styles.profileOpen}>열기</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteButton}
                    accessibilityLabel={`${profile.name} 삭제`}
                    onPress={() => Alert.alert(
                      "PC 연결 삭제",
                      `${profile.name} 연결과 이 PC의 백그라운드 알림 토큰을 삭제할까요?`,
                      [
                        { text: "취소", style: "cancel" },
                        { text: "삭제", style: "destructive", onPress: () => void onDelete(profile) },
                      ],
                    )}
                  >
                    <Text style={styles.deleteGlyph}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{profiles.length > 0 ? "새 PC 추가" : "PC 연결"}</Text>
            <Text style={styles.label}>PC 이름</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              editable={!busy}
              maxLength={60}
              placeholder="예: 작업실 PC"
              placeholderTextColor="#557083"
              style={styles.input}
            />
            <Text style={[styles.label, styles.urlLabel]}>REMOTE HTTPS 주소</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              placeholder="https://agent.example.com"
              placeholderTextColor="#557083"
              style={styles.input}
              onSubmitEditing={() => {
                if (!busy) void onConnect(name, url);
              }}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={({ pressed }) => [
                styles.connectButton,
                pressed && styles.connectPressed,
                busy && styles.connectDisabled,
              ]}
              disabled={busy}
              onPress={() => void onConnect(name, url)}
            >
              {busy ? (
                <ActivityIndicator color="#03201d" size="small" />
              ) : (
                <Text style={styles.connectText}>{profiles.length > 0 ? "추가하고 열기" : "연결"}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.guide}>
            <Text style={styles.guideTitle}>PC마다 별도 주소가 필요합니다</Text>
            <Text style={styles.guideText}>
              각 PC의 MultiAgent 설정 → Remote에서 HTTPS 터널을 켠 다음 표시되는 주소를 등록하세요.
            </Text>
            <Text style={styles.guideNote}>
              로그인과 기기 승인은 PC별로 한 번씩 진행합니다. 외부 연결은 HTTPS만 허용합니다.
            </Text>
          </View>

          <Text style={styles.version}>Mobile 0.3.3</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#06101a",
  },
  keyboard: {
    flex: 1,
  },
  page: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: "#06101a",
  },
  hero: {
    alignItems: "center",
    marginBottom: 26,
  },
  profileSection: {
    gap: 8,
    marginBottom: 18,
  },
  sectionTitle: {
    marginBottom: 8,
    color: "#d9eaf0",
    fontSize: 13,
    fontWeight: "800",
  },
  profileCard: {
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 12,
    backgroundColor: "#0a1925",
  },
  profileMain: {
    minWidth: 0,
    flex: 1,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
  },
  profilePressed: {
    backgroundColor: "#102535",
  },
  profileDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#55e4d4",
  },
  profileCopy: {
    minWidth: 0,
    flex: 1,
  },
  profileName: {
    color: "#e7f4f7",
    fontSize: 13,
    fontWeight: "800",
  },
  profileUrl: {
    marginTop: 3,
    color: "#66869a",
    fontSize: 10,
  },
  recentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#12382f",
    color: "#6ee7c0",
    fontSize: 8,
    fontWeight: "800",
  },
  profileOpen: {
    color: "#78d9cf",
    fontSize: 10,
    fontWeight: "800",
  },
  deleteButton: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#173447",
  },
  deleteGlyph: {
    color: "#ff8e91",
    fontSize: 20,
  },
  logo: {
    width: 76,
    height: 76,
    marginBottom: 14,
    borderRadius: 20,
  },
  title: {
    color: "#ecf7fb",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    maxWidth: 310,
    marginTop: 7,
    color: "#8fa9ba",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#173447",
    borderRadius: 18,
    backgroundColor: "#0a1925",
  },
  urlLabel: {
    marginTop: 13,
  },
  label: {
    marginBottom: 8,
    color: "#78d9cf",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  input: {
    height: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#26485c",
    borderRadius: 10,
    backgroundColor: "#07131d",
    color: "#e7f4f7",
    fontSize: 14,
  },
  error: {
    marginTop: 9,
    color: "#ff8e91",
    fontSize: 12,
    lineHeight: 17,
  },
  connectButton: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#55e4d4",
  },
  connectPressed: {
    opacity: 0.82,
  },
  connectDisabled: {
    opacity: 0.6,
  },
  connectText: {
    color: "#03201d",
    fontSize: 14,
    fontWeight: "900",
  },
  guide: {
    marginTop: 18,
    paddingHorizontal: 4,
  },
  guideTitle: {
    color: "#d9eaf0",
    fontSize: 12,
    fontWeight: "700",
  },
  guideText: {
    marginTop: 5,
    color: "#7894a6",
    fontSize: 11,
    lineHeight: 17,
  },
  guideNote: {
    marginTop: 5,
    color: "#557083",
    fontSize: 10,
    lineHeight: 15,
  },
  version: {
    marginTop: 20,
    color: "#3f5c6d",
    fontSize: 10,
    textAlign: "center",
  },
});
