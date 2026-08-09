import assert from "node:assert/strict";
import test from "node:test";
import {
  createRemoteProfile,
  parseRemoteProfileState,
  profileIdForUrl,
  upsertRemoteProfile,
} from "../src/lib/profiles.ts";

test("creates a stable profile id and defaults its name to the host", () => {
  const first = createRemoteProfile("https://pc-one.example.com/path");
  const second = createRemoteProfile("pc-one.example.com");
  assert.equal(first.id, second.id);
  assert.equal(first.id, profileIdForUrl("https://pc-one.example.com/"));
  assert.equal(first.name, "pc-one.example.com");
  assert.equal(first.baseUrl, "https://pc-one.example.com/");
});

test("migrates the legacy single URL into the multi-PC profile store", () => {
  const state = parseRemoteProfileState(null, "https://legacy.example.com/");
  assert.equal(state.profiles.length, 1);
  assert.equal(state.selectedProfileId, state.profiles[0].id);
  assert.equal(state.profiles[0].baseUrl, "https://legacy.example.com/");
});

test("keeps valid unique profiles and rejects invalid stored endpoints", () => {
  const raw = JSON.stringify({
    selectedProfileId: "pc-two",
    profiles: [
      { id: "pc-one", name: "작업실", baseUrl: "https://one.example.com/" },
      { id: "pc-two", name: "서버실", baseUrl: "https://two.example.com/" },
      { id: "duplicate", name: "중복", baseUrl: "https://one.example.com/" },
      { id: "unsafe", name: "위험", baseUrl: "http://public.example.com/" },
    ],
  });
  const state = parseRemoteProfileState(raw);
  assert.deepEqual(state.profiles.map((profile) => profile.id), ["pc-one", "pc-two"]);
  assert.equal(state.selectedProfileId, "pc-two");
});

test("updates a profile with the same origin instead of duplicating it", () => {
  const original = { id: "saved-id", name: "기존", baseUrl: "https://pc.example.com/" };
  const next = upsertRemoteProfile([original], createRemoteProfile("https://pc.example.com/", "새 이름"));
  assert.deepEqual(next, [{ id: "saved-id", name: "새 이름", baseUrl: "https://pc.example.com/" }]);
});
