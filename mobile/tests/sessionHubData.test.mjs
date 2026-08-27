import assert from "node:assert/strict";
import test from "node:test";
import { mergeHubSnapshots } from "../src/lib/sessionHubData.ts";

const profiles = [
  { id: "pc-one", name: "작업 PC", baseUrl: "https://one.example.com/" },
  { id: "pc-two", name: "서버 PC", baseUrl: "https://two.example.com/" },
];

test("merges sessions from every registered server and preserves their profile identity", () => {
  const result = mergeHubSnapshots(profiles, [
    {
      profileId: "pc-one",
      baseUrl: profiles[0].baseUrl,
      ok: true,
      body: JSON.stringify({
        sessions: [
          { id: "idle", name: "대기", project: "A", tool: "codex", status: "idle", active: true },
          { id: "work", name: "빌드", project: "A", tool: "claude", status: "working", active: true },
        ],
      }),
    },
    {
      profileId: "pc-two",
      baseUrl: profiles[1].baseUrl,
      ok: true,
      body: JSON.stringify({
        sessions: [{ id: "done", name: "문서", project: "B", tool: "codex", status: "done", active: false }],
      }),
    },
  ]);

  assert.deepEqual(result.map((server) => server.state), ["online", "online"]);
  assert.deepEqual(result[0].sessions.map((session) => session.id), ["work", "idle"]);
  assert.equal(result[0].sessions[0].profileName, "작업 PC");
  assert.equal(result[1].sessions[0].profileId, "pc-two");
});

test("distinguishes missing authorization from an offline server", () => {
  const result = mergeHubSnapshots(profiles, [
    {
      profileId: "pc-two",
      baseUrl: profiles[1].baseUrl,
      ok: false,
      authRequired: false,
      error: "timeout",
    },
  ]);

  assert.equal(result[0].state, "login-required");
  assert.equal(result[1].state, "offline");
  assert.equal(result[1].error, "timeout");
});

test("rejects malformed server payloads without leaking them into the session list", () => {
  const [result] = mergeHubSnapshots([profiles[0]], [{
    profileId: "pc-one",
    baseUrl: profiles[0].baseUrl,
    ok: true,
    body: "not json",
  }]);

  assert.equal(result.state, "offline");
  assert.deepEqual(result.sessions, []);
});
