import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedNativeBridgeUrl,
  nativeBridgeEventScript,
  normalizeNotificationOpenUrl,
  parseNativeBridgeRequest,
} from "../src/lib/notificationBridge.ts";

test("allows the native token bridge only on the configured Remote origin", () => {
  const base = "https://agent.example.com/";
  assert.equal(isTrustedNativeBridgeUrl(base, `${base}?agent=1`), true);
  assert.equal(isTrustedNativeBridgeUrl(base, "https://github.com/login/device"), false);
  assert.equal(isTrustedNativeBridgeUrl(base, "https://agent.example.com.evil.test/"), false);
});

test("accepts only validated foreground-monitor requests", () => {
  const token = `ma1_${"A".repeat(43)}`;
  assert.deepEqual(
    parseNativeBridgeRequest(JSON.stringify({ type: "multiagent:start-native-monitor", token, cursor: 42 })),
    { type: "multiagent:start-native-monitor", token, cursor: 42 },
  );
  assert.deepEqual(
    parseNativeBridgeRequest('{"type":"multiagent:stop-native-monitor"}'),
    { type: "multiagent:stop-native-monitor", revoke: true },
  );
  assert.equal(parseNativeBridgeRequest('{"type":"multiagent:start-native-monitor","token":"bad"}'), null);
  assert.equal(parseNativeBridgeRequest('{"type":"open-external-url"}'), null);
  assert.equal(parseNativeBridgeRequest("not json"), null);
});

test("escapes injected event data and never emits a raw script terminator", () => {
  const script = nativeBridgeEventScript("safe-event", { value: "</script><script>alert(1)</script>" });
  assert.equal(script.includes("</script>"), false);
  assert.equal(script.includes("\\u003c/script>"), true);
});

test("derives a same-origin route from a validated agent id", () => {
  assert.deepEqual(normalizeNotificationOpenUrl("multiagent://open?agent=agent%3Abuild-1"), {
    profileId: null,
    agentId: "agent:build-1",
    url: "/?agent=agent%3Abuild-1",
  });
  assert.deepEqual(normalizeNotificationOpenUrl("multiagent://open?profile=pc-work&agent=agent-2"), {
    profileId: "pc-work",
    agentId: "agent-2",
    url: "/?agent=agent-2",
  });
  assert.equal(normalizeNotificationOpenUrl("https://evil.test/?agent=agent-1"), null);
  assert.equal(normalizeNotificationOpenUrl("multiagent://open?agent=%3Cscript%3E"), null);
  assert.equal(normalizeNotificationOpenUrl("multiagent://open?profile=%3Cscript%3E&agent=agent-1"), null);
});
