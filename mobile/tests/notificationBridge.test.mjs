import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedNativeBridgeUrl,
  nativeBridgeEventScript,
  normalizeNotificationOpenData,
  parseNativeBridgeRequest,
} from "../src/lib/notificationBridge.ts";

test("allows the native token bridge only on the configured Remote origin", () => {
  const base = "https://agent.example.com/";
  assert.equal(isTrustedNativeBridgeUrl(base, `${base}?agent=1`), true);
  assert.equal(isTrustedNativeBridgeUrl(base, "https://github.com/login/device"), false);
  assert.equal(isTrustedNativeBridgeUrl(base, "https://agent.example.com.evil.test/"), false);
});

test("accepts only the allowlisted WebView push request", () => {
  assert.deepEqual(
    parseNativeBridgeRequest('{"type":"multiagent:enable-native-push","token":"ignored"}'),
    { type: "multiagent:enable-native-push" },
  );
  assert.equal(parseNativeBridgeRequest('{"type":"open-external-url"}'), null);
  assert.equal(parseNativeBridgeRequest("not json"), null);
});

test("escapes injected event data and never emits a raw script terminator", () => {
  const script = nativeBridgeEventScript("safe-event", { value: "</script><script>alert(1)</script>" });
  assert.equal(script.includes("</script>"), false);
  assert.equal(script.includes("\\u003c/script>"), true);
});

test("derives a same-origin route from a validated agent id", () => {
  assert.deepEqual(normalizeNotificationOpenData({ agentId: "agent:build-1", url: "https://evil.test" }), {
    agentId: "agent:build-1",
    url: "/?agent=agent%3Abuild-1",
  });
  assert.equal(normalizeNotificationOpenData({ agentId: "<script>" }), null);
});
