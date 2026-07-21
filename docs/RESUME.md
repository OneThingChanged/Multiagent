# Session Resume

The mechanism for continuing Codex/Claude sessions after closing and reopening the app. Currently, the `session_id` delivered by each tool's `SessionStart` hook is stored in the common field `lastSessionId`, and used as the tool-specific resume command on the next spawn.

## Scenario

1. User chats/works with a Codex/Claude agent
2. User clicks the window **X**
3. The backend intercepts the close and emits an `app:close-requested` event to the frontend
4. The frontend sends `/quit\r` to all running Codex/Claude agents
5. The session ID is already stored by the `SessionStart` hook, so the close path only shuts the tools down gracefully
6. After a short wait, the `confirm_close` command performs the actual exit
7. Next app run → click that agent in the sidebar → spawn auto-types `codex resume <id>` or `claude --resume <id>` (+ dangerous flag)

## Window Close Intercept (Rust)

```rust
window.on_window_event(move |event| {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let confirmed = *state.close_confirmed.lock().unwrap();
        if !confirmed {
            api.prevent_close();
            let _ = app_handle.emit("app:close-requested", ());
        }
    }
});
```

The `confirm_close` command sets the `close_confirmed` flag to true and then calls `window.close()` → the second close event passes through.

## Session ID Capture

1. The app merges a `SessionStart` hook into each agent folder's `.claude/settings.local.json` and `.codex/config.toml`
2. When the tool starts, the hook fires → `notify.ps1 session-start`
3. `notify.ps1` extracts `session_id` (+ `transcript_path`, `cwd`) from stdin JSON
4. POSTs `{ id, event: "session-start", session_id, token, ... }` to HTTP `/event`
   - Port/token come from the per-session env vars `MULTIAGENT_PORT`/`MULTIAGENT_TOKEN` first, falling back to `hook-info.json` only if absent. A session is bound 1:1 to the (living) app that spawned it, so this stays correct across app restarts and multiple instances
5. The Rust server validates the token and emits `agent:hook-event`
6. The frontend stores it in `agent.lastSessionId` and persists to `multiagent.agents.v1`

When a new session starts via resume/compact/clear, the hook fires again and the newest session ID overwrites it.

## Using the Session ID at Spawn

In PaneSlot's apply:

```ts
let cmd = tool.command;  // "codex"
const sessionId = group.sessionPins?.[agent.id] ?? agent.lastSessionId;
if (sessionId) {
  if (agent.aiToolId === "codex") {
    cmd = `${cmd} resume ${sessionId}`;
  } else if (agent.aiToolId === "claude") {
    cmd = `${cmd} --resume ${sessionId}`;
  }
}
if (agent.dangerous && tool.dangerousFlag) {
  cmd = `${cmd} ${tool.dangerousFlag}`;
}
// invoke spawn_pty with initCommand = cmd
```

Example result: `codex resume 019e3eda-7a41-77e2-9165-cb5e11e13021 --dangerously-bypass-approvals-and-sandbox`
Claude example: `claude --resume <session_id> --dangerously-skip-permissions`
On Windows SSH hosts, the `.cmd` shims are used by default instead of the npm `.ps1` shims, producing `codex.cmd resume ...` / `claude.cmd --resume ...`.

## Pinning Group Sessions

The sidebar context menu's **Pin group to current sessions** (현재 세션으로 그룹 고정) stores the group members' current `lastSessionId` values into `Group.sessionPins`. Afterwards, agents spawned in that group prefer the group's pinned session IDs over the latest `lastSessionId`.

A pinned group becomes `sessionLocked`, so outside agents cannot be added via tabs/splits/drag. Already-running terminal processes are not restarted automatically, so pins apply from the next spawn.

## Relink to Current Session (Recovery)

If the hook never fired (e.g., a broken codex plugin `hooks.json` fails to parse so SessionStart never fires) or `lastSessionId` is stuck on an old value, resume targets the wrong session. Sidebar session right-click → **Relink to current session** (현재 세션으로 재등록):

- `relink_cli_session` (Rust) → `usage.rs`'s `find_latest_for_folder(tool, folder)` extracts the session_id from the **newest on-disk transcript** for that tool+folder
  - claude: newest of `~/.claude/projects/<encoded-folder>/<id>.jsonl`
  - codex: newest of `~/.codex/sessions/**/rollout-...<id>.jsonl` with matching cwd
- Updates `lastSessionId` with the found id → **from the next spawn**, resume targets that session
- The transcript search logic is shared with the usage dashboard ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md))

## Limits / Unsupported

- **Shell only mode**: `/quit` does not exist in PowerShell so an error may flash briefly (harmless, not a resume target)
- **Session ID invalidated**: if the tool can no longer resume that session or the jsonl was deleted, it fails → a new session starts (relink can re-target the newest on-disk session)
- **First spawn**: right after creation there is no resume target because SessionStart has not fired yet. Works from the first actual run onwards
- **SSH remote sessions**: **Windows remotes support resume via Phase 2** — the `ssh -R` reverse tunnel + remote hooks fill `lastSessionId` via session-start, and the next spawn continues with `claude --resume <id>` (codex `resume <id>`). The local-disk `resolve_cli_session` is skipped (remote transcripts are not visible, so the stored id is trusted). **POSIX remotes are not supported yet** (new session). Details & constraints in [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- **Codex plugin hooks.json compatibility**: if a codex companion plugin's `hooks.json` has unsupported top-level fields like `description`, codex fails to load hooks and SessionStart never arrives → remove those fields or clean up the plugin

## Persistence

`StoredAgent.lastSessionId?: string` is stored in the `multiagent.agents.v1` localStorage key. The legacy fields `lastResumeToken` and `lastClaudeSessionId` are migrated into `lastSessionId` on load.

Pinned group sessions are stored in `Group.sessionPins` and `Group.sessionLocked` inside `multiagent.groups.v1`.
