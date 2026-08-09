export type NativeBridgeRequest =
  | { type: "multiagent:start-native-monitor"; token: string; cursor: number }
  | { type: "multiagent:stop-native-monitor"; revoke: boolean };

export function parseNativeBridgeRequest(value: string): NativeBridgeRequest | null {
  try {
    const parsed = JSON.parse(value);
    if (
      parsed?.type === "multiagent:start-native-monitor" &&
      /^ma1_[A-Za-z0-9_-]{43}$/.test(String(parsed.token || ""))
    ) {
      return {
        type: parsed.type,
        token: String(parsed.token),
        cursor: Number.isFinite(Number(parsed.cursor)) ? Math.max(0, Number(parsed.cursor)) : 0,
      };
    }
    if (parsed?.type === "multiagent:stop-native-monitor") {
      return { type: parsed.type, revoke: parsed.revoke !== false };
    }
    return null;
  } catch {
    return null;
  }
}

export function isTrustedNativeBridgeUrl(baseUrl: string, targetUrl: string) {
  try {
    return new URL(baseUrl).origin === new URL(targetUrl).origin;
  } catch {
    return false;
  }
}

export function nativeBridgeEventScript(eventName: string, detail: unknown) {
  const safeEventName = JSON.stringify(eventName).replace(/</g, "\\u003c");
  const safeDetail = JSON.stringify(detail).replace(/</g, "\\u003c");
  return `window.dispatchEvent(new CustomEvent(${safeEventName},{detail:${safeDetail}}));true;`;
}

export function normalizeNotificationOpenUrl(value: string | null | undefined) {
  let agentId = "";
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "multiagent:" || url.hostname !== "open") return null;
    agentId = String(url.searchParams.get("agent") || "").trim();
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(agentId)) return null;
  return { agentId, url: `/?agent=${encodeURIComponent(agentId)}` };
}
