import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  initialUrl: string;
  busy: boolean;
  error: string;
  onConnect: (url: string) => void;
};

export function ConnectionScreen({
  initialUrl,
  busy,
  error,
  onConnect,
}: Props) {
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => setUrl(initialUrl), [initialUrl]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.hero}>
          <Image source={require("../../assets/icon.png")} style={styles.logo} />
          <Text style={styles.title}>MultiAgent Mobile</Text>
          <Text style={styles.subtitle}>
            PC의 MultiAgent Remote 서버에 안전하게 연결합니다.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>REMOTE HTTPS 주소</Text>
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
              if (!busy) void onConnect(url);
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
            onPress={() => void onConnect(url)}
          >
            {busy ? (
              <ActivityIndicator color="#03201d" size="small" />
            ) : (
              <Text style={styles.connectText}>연결</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.guide}>
          <Text style={styles.guideTitle}>연결 주소 확인</Text>
          <Text style={styles.guideText}>
            데스크톱 MultiAgent의 설정 → Remote에서 서버와 HTTPS 터널을 켠
            다음 표시되는 주소를 입력하세요.
          </Text>
          <Text style={styles.guideNote}>
            외부 연결은 HTTPS만 허용합니다. 로컬 개발 주소는
            localhost·사설망만 사용할 수 있습니다.
          </Text>
        </View>

        <Text style={styles.version}>Mobile prototype 0.1.0</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#06101a",
  },
  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: "#06101a",
  },
  hero: {
    alignItems: "center",
    marginBottom: 26,
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
