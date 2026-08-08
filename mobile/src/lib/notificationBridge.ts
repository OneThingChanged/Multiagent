export type NativeBridgeRequest = {
  type: "multiagent:enable-native-push";
};

export function parseNativeBridgeRequest(value: string): NativeBridgeRequest | null {
  try {
    const parsed = JSON.parse(value);
    return parsed?.type === "multiagent:enable-native-push"
      ? { type: parsed.type }
      : null;
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

export function normalizeNotificationOpenData(value: unknown) {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const agentId = String(data.agentId || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(agentId)) return null;
  return { agentId, url: `/?agent=${encodeURIComponent(agentId)}` };
}
