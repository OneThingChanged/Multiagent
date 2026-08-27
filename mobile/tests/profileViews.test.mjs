import assert from "node:assert/strict";
import test from "node:test";
import {
  forgetProfileView,
  rememberProfileView,
  resolveRemoteBackAction,
} from "../src/lib/profileViews.ts";

test("keeps a lazily opened profile view alive without duplicating it", () => {
  const opened = rememberProfileView([], "pc-one");
  assert.deepEqual(rememberProfileView(opened, "pc-one"), ["pc-one"]);
  assert.deepEqual(rememberProfileView(opened, "pc-two"), ["pc-one", "pc-two"]);
});

test("forgets only the deleted profile view", () => {
  assert.deepEqual(
    forgetProfileView(["pc-one", "pc-two", "pc-three"], "pc-two"),
    ["pc-one", "pc-three"],
  );
});

test("uses WebView history before returning to the native session hub", () => {
  assert.equal(resolveRemoteBackAction(true), "web-history");
  assert.equal(resolveRemoteBackAction(false), "session-hub");
});
