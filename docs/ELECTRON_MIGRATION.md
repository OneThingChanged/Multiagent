# Electron Migration Experiment

## Conclusion

Phases 1–5 implementation and the packaged smoke test are complete on the
`experiment/electron-shell` branch. Electron can now run as a local daily-use candidate,
but it does not immediately replace the main/Tauri distribution. The migration decision
comes after finishing verification of the remote web terminal's expressiveness, the first
Electron update channel, and long-running tests on other Windows PCs.

- Base version: `0.5.28`
- renderer: the existing React/xterm.js shared by Tauri and Electron
- Electron host: `app/electron/main.mjs`
- preload API: `app/electron/preload.cjs`
- dev port: `4420` (auxiliary HMR port `4422`)
- package app ID: `com.jintae.multiagent.electron`

## Phase 1 — Security Boundaries

Completed items:

- `contextIsolation: true`, `nodeIntegration: false`, renderer sandbox
- preload command/event allowlist and sender/frame/origin re-validation in main
- external top-level navigation, popups, and renderer permission requests blocked
- HTTP(S) links only handed to the OS browser
- CSP applied. Only packaged `file://` renderer and the dev origin allowed
- lifecycle smoke test that attempts a malicious `data:` navigation and stays on the original renderer

There is no generic IPC where the renderer reaches Node/PTY with arbitrary command names.
Adding a new command requires explicitly changing both the preload allowlist and the main
switch.

## Phase 2 — Hooks, Status, Resume

`app/electron/services/hook-service.mjs` handles the following.

- Loopback random-port + session-token hook HTTP server
- UTF-8 `notify.ps1`, `hook-info.json`, `hook.log`
- Claude JSON / Codex TOML managed merge that preserves user hooks
- Settings > **Hook check & repair** (Hook 점검 및 복구) comparing running PTYs against config
- Non-disruptive auto-maintenance checking the hook server/helper/active local projects every minute
- Auto-recovery of living helpers via `hook-info.json` fallback when the port changed
- `ssh -R` reverse forwarding and remote Node bootstrap for SSH sessions
- Claude/Codex hook file creation on Windows/POSIX remotes

Status was split into a runtime axis (PTY survival) and an activity axis (provider work).
Codex forwards `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`,
`PostToolUse`, and `Stop`; Claude adds `PostToolUseFailure` and `StopFailure` on top.
`AskUserQuestion` shows as `waiting`, recoverable tool failures as `working`, and
turn-ending API `StopFailure` as `blocked`. A working display with no new events for 30
minutes is not misjudged as done; it is lowered to `running` for a living PTY.

Codex re-reviews changed project hooks by hash, so if a start warning appears after the
first expansion or a repair, check and trust the MultiAgent command in `/hooks`. Since
app-owned hooks cannot be selectively bypassed, `--dangerously-bypass-hook-trust`, which
would also run other user hooks, is not added automatically.

`app/electron/services/session-service.mjs` scans Codex/Claude transcripts to validate the
preferred session ID, and if missing, resumes/relinks to the newest session in the same
working folder. It includes a test that actually runs the PowerShell helper and verifies a
Korean prompt survives to the HTTP event.

## Phase 3 — Terminal Reliability

- node-pty spawn/write/resize/kill and packaged native module round-trip verified
- Codex runs with `--no-alt-screen` by default so its conversation uses xterm's normal
  buffer. A Codex-only shadow xterm filter removes `CSI 3 J`, advances the current
  viewport into native scrollback before `CSI 2 J`, and compares synchronized-output
  repaint frames to preserve only rows shifted off the top. Claude and plain Shell output
  stays pass-through
- The shadow filter buffers split ANSI/synchronized-frame boundaries, follows terminal
  resize before the PTY resize is delivered, and is disposed with its PTY. The packaged
  app explicitly includes `@xterm/xterm`, which is also used by the Electron main process
- A per-PTY 512K-char bounded sequence model in main; incrementally replays between `baseSequence` and `nextSequence`
- Only visible renderers subscribe to PTY output. Pane/tab switches and Screen moves detach/attach, and hidden session output accumulates only in the main model without growing renderer queues
- Live output arriving during attach is queued, then deduplicated against the replay sequence. If the buffer was truncated or a stale process cursor arrives, recovery uses the retained reset snapshot
- On renderer reload, living PTYs replay only from the main model; stored xterm scrollback is restored first only for new PTYs, preventing double display of the same output
- xterm scrollback is capped at 5,000 lines, the main model at 512K chars
- `detach / sleep / close / restart / quit` are defined as distinct session actions. close-before-spawn and old-exit-after-restart races are blocked by main generation/entry identity
- When sleeping/closing/restarting a Windows local Codex/Claude or quitting the app, the child process tree is cleaned first with `taskkill /T /F` instead of just killing the PTY root. Plain Shell and SSH keep the existing PTY close contract to preserve background jobs and remote ownership, falling back safely to PTY kill if tree kill fails
- The terminal session owner and IPC handlers were split into `app/electron/services/terminal-session-service.mjs` and `app/electron/handlers/terminal-handlers.mjs`

- The command/event allowlist and main validator are owned by `app/electron/ipc-contract.cjs`;
  the renderer's terminal request/response types are owned by `app/src/platform/ipcContract.ts`.
- Common Claude/Codex native clipboard
  - selection + `Ctrl+C`/`Ctrl+Shift+C`: copy
  - no selection + `Ctrl+C`: ETX interrupt
  - `Ctrl+V`/`Ctrl+Shift+V`: paste
- Windows native notifications with app/session activation on click
- Absolute/relative file paths in terminal output, line numbers, and sibling project navigation support

## Phase 4 — App Lifecycle & Data Migration

The system tray/main process now outlives every equal workspace window. Clicking a workspace X destroys only that renderer and releases its session ownership while PTYs continue in the main process. Tray Exit/update/relaunch processes in this order:

1. Broadcast the close request to every workspace
2. Each workspace stores running agent IDs and its window-specific Screen/view
3. Each workspace sends explicit `quit` to its owned Codex/Claude sessions and serializes xterm scrollback
4. Wait for every workspace's `confirm_close`
5. Kill all PTYs, Dashboard, Remote, Tunnel, Pet/workspace windows, and the tray process

Auto close smoke results are about 40–60ms (fixture with no active agents), and the old
5-second fallback wait did not occur. If closed before the renderer is ready, main cleans
up immediately.

Tauri and Electron use the shared workspace at
`%LOCALAPPDATA%\com.jintae.multiagent\storage-export.json`. Projects, sessions,
and the SSH host registry merge on first entry by stable id, and afterwards the
latest shared snapshot is applied via per-runtime revision markers. UI/runtime state like
per-window Screen layouts, pet position, theme, current selection, reopen lists, and terminal scrollback, plus SSH
passwords, are not shared. Running PTYs are not shared either; only the stored
`lastSessionId` is resumed on the other runtime.

Note: older Tauri versions have no snapshot command, so you must run a shared-workspace-
capable Tauri build once for existing localStorage to auto-merge.

## Phase 5 — Remaining Backend Features

### SSH

- Windows OpenSSH auto-detection, key/password auth, port/identity/extra options
- passwords encrypted with Electron `safeStorage` and stored in userData
- Windows remote uses UTF-16LE `EncodedCommand`; POSIX uses safe single-quote commands
- remote folder, Codex/Claude start commands, hook reverse tunnel/bootstrap, public key read/generate

### Remote, Tunnel, Monitor

- Remote HTTP server, GitHub OAuth web flow, owner/approve/pending/revoke storage
- agent list/recent output/input delivery for approved browsers
- named/quick tunnel execution and URL detection with the existing `cloudflared.exe`
- Monitor and legacy Usage loopback dashboards, port conflict fallback, auto-start settings

Electron Remote is served as a mobile-first PWA. With 1.6s state polling it shows
projects, sessions, hooks, and recent output, and supports question answers/short input,
home screen install, and completion/question notifications while running. The API binds
to loopback only and includes GitHub Device Flow for quick tunnels plus automatic
cloudflared setup. A full xterm.js remote terminal and background Web Push are later
scope.

### Usage

Node 24's built-in SQLite reuses the existing `usage.db` schema as-is. Claude
`message.usage` and Codex `last_token_usage` are incrementally parsed only after
`usage_sources.last_offset`, with deterministic source keys preventing duplicates.
Hook `done` auto-ingests that transcript; Reindex in Settings re-indexes all known
transcripts.

The latest snapshot of Codex `token_count.rate_limits` is stored per limit ID in
`usage_rate_limits`. The Electron renderer always shows usage rate and time-to-reset on
the bottom status bar, opening a detailed popover with multiple limit windows on click.
First lookup and manual refresh only scan the last 1MiB of the newest transcript, so
large session logs are never re-read in full.

### updater and installer

`electron-updater` is connected to the GitHub `OneThingChanged/Multiagent` channel.
Download progress is delivered through the existing Settings UI contract, and
relaunch-after-download calls `quitAndInstall`. check is capped at 30 seconds and
download at 15 minutes, with per-stage records left in
`%LOCALAPPDATA%\com.jintae.multiagent\electron-updater.log` with bounded state.
If install does not start within 20 seconds, a watchdog cleans up app processes. A
synchronous `quitAndInstall` failure releases the window-close lock so the user can
retry. Real auto-update must be finally verified on another PC after the first Electron
`latest.yml`/NSIS/blockmap release and Windows code signing are published.

Settings → **About → Support diagnostics** saves app/runtime versions, PTY metadata, hook
health and recent event metadata, updater lifecycle, and limited hook/updater logs as
JSON. Terminal output and prompts are excluded, and token/password/secret plus user home
paths are redacted before export.

### Quick Open, Command Registry, Attention Center

- The sidebar's **Quick Open** or `Ctrl+K` searches projects, sessions, Screens, local
  docs, and commands in one place. Docs use the existing bounded docs scanner across all
  local projects when opened.
- `app/src/lib/commandRegistry.ts` owns command metadata and default/user shortcuts.
  The Settings General tab records new combos and handles duplicates/unassign/restore
  defaults.
- `app/src/lib/attention.ts` keeps up to 100 Attention items in runtime-local
  localStorage. waiting/blocked/stale/completed are deduplicated by provider session ID.
- When hook progress resumes, resolved waiting/blocked items are removed, while
  completed, stale, and PTY-exit-while-working items remain unread. Clicking an item
  jumps to that session.

`-electron.*` prerelease builds use a fixed `electron-test` release asset URL, separate
from Tauri's GitHub Latest channel. Only the first `0.5.28` Electron test build enters
the test channel by uploading the same `latest.yml` and NSIS file to the existing Latest
release; later test updates replace the assets on the `electron-test` release. That
release stays a prerelease so it does not affect Tauri's `latest.json`/`latest-company.json`
lookup.

From the official migration release onward, stable Electron versions are used. The
`latest.json` read by standard Tauri points to the standard Electron NSIS, and the
`latest-company.json` read by company Tauri points to the Company Electron NSIS. Both
installers are additionally signed with the existing Tauri updater private key, so Tauri
0.5.29+ can verify and install them with no intermediate version.

Electron's own update metadata uses `latest.yml` for standard and `latest-company.yml`
for company. Company Electron uses a separate app ID and userData, but imports existing
Company projects/sessions from
`%LOCALAPPDATA%\com.jintae.multiagent.company\storage-export.json`. Beyond hiding the
Remote tab, it also rejects Remote and Tunnel commands in main IPC.

## Running & Verification

Run from the `app` folder.

```powershell
npm run electron:dev
npm test
npm run electron:smoke
npm run electron:bridge-smoke
npm run electron:lifecycle-smoke
npm run electron:pack
npm run electron:packaged-smoke
npm run electron:packaged-lifecycle-smoke
npm run electron:dist
npm run electron:dist:company
npm run electron:dist:all
npm run electron:company-packaged-smoke
npm run electron:company-packaged-lifecycle-smoke
```

Automated verification scope:

- 23 test files, 109 unit/integration tests
- node-pty standalone and renderer → preload → main → PTY → renderer round-trip
- Korean PowerShell hooks, hook auth/merge/repair contract
- session resolve/fallback, terminal path, CSI 3 J split sequences, bounded sequence replay
- hidden view delivery limits, replay/live dedup, move detach/attach, lifecycle race/idempotency, typed IPC validation
- command shortcut normalization/conflicts, Quick Open Korean & prefix search, Attention dedupe/resolve/cap
- SSH args/Windows encoding/remote hook bootstrap
- Usage SQLite incremental/idempotent load, Dashboard HTTP state
- close/security lifecycle of source and packaged renderers

The current unpacked size is about 381MB. It is much larger than the Tauri release, so
install size is a clear cost of the Electron migration.

## Remaining Real-Use Checks Before Migration

1. NSIS install on two separate Windows PCs, Defender/SmartScreen, `node-pty` check
2. Run real Codex/Claude for 8+ hours and check scrollback/memory/resume
3. Verify hook working/done/session-start on Windows and POSIX SSH hosts
4. Verify OAuth pending/approve/revoke and long input over a Cloudflare public URL
5. Verify update/rollback with two signed Electron releases
6. Decide whether to raise Remote to Tauri-level WebSocket/xterm UX or keep the current simplified UI

Until these checks finish, the Tauri build/release path is maintained.
