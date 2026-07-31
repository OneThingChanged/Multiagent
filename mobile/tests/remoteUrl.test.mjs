import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedInAppNavigation,
  normalizeRemoteUrl,
  remoteAppUrl,
} from "../src/lib/remoteUrl.ts";

test("normalizes a public Remote host to HTTPS", () => {
  assert.equal(
    normalizeRemoteUrl("agent.example.com/path?ignored=yes"),
    "https://agent.example.com/",
  );
});

test("allows cleartext only for loopback and private IPv4 hosts", () => {
  assert.equal(normalizeRemoteUrl("http://10.0.2.2:18900"), "http://10.0.2.2:18900/");
  assert.equal(normalizeRemoteUrl("http://192.168.0.25:18900"), "http://192.168.0.25:18900/");
  assert.throws(
    () => normalizeRemoteUrl("http://agent.example.com"),
    /HTTPS/,
  );
});

test("rejects credentials and non-HTTP protocols", () => {
  assert.throws(
    () => normalizeRemoteUrl("https://user:secret@agent.example.com"),
    /계정 정보/,
  );
  assert.throws(() => normalizeRemoteUrl("file:///tmp/remote"), /HTTP/);
});

test("builds the native app URL without changing the Remote origin", () => {
  assert.equal(
    remoteAppUrl("https://agent.example.com/"),
    "https://agent.example.com/?source=mobile-app",
  );
});

test("keeps Remote and GitHub auth in-app but rejects unrelated origins", () => {
  const base = "https://agent.example.com/";
  assert.equal(isAllowedInAppNavigation(base, `${base}api/state`), true);
  assert.equal(
    isAllowedInAppNavigation(base, "https://github.com/login/device"),
    true,
  );
  assert.equal(
    isAllowedInAppNavigation(base, "https://docs.example.com/guide"),
    false,
  );
});
