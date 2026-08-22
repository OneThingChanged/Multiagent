# Architecture

## Process Structure

```
MultiAgent.exe (Electron main process + system tray)
├─ BrowserWindow × N (equal workspaces, React + xterm.js)
├─ Desktop Pet BrowserWindow (transparent, always-on-top, non-focusable)
├─ local hook HTTP service (127.0.0.1:RANDOM_PORT, Claude/Codex hooks)
├─ Remote/Dashboard HTTP services
│  ├─ VAPID Web Push completion delivery (service worker background notification)
│  ├─ revocable Android device-token + long-poll event delivery (Foreground Service)
│  └─ cloudflared child process (only when tunnel is on)
└─ node-pty session × N
   ├─ PowerShell via Windows ConPTY (local session)
   │  └─ claude / codex CLI
   └─ ssh.exe via Windows ConPTY (SSH remote session)
      └─ remote shell → remote claude / codex
```

Build variants: **standard** (`com.jintae.multiagent.electron`, `latest.yml`) /
**company** (`com.jintae.multiagent.company.electron`, `latest-company.yml`). Legacy
Tauri installs use transition manifests to move onto the matching Electron channel
([RELEASE.md](RELEASE.md)).

## File Layout

```
K:\AI\MultiAgent\
├─ docs/                ← these documents
└─ app/                 ← Electron production app + legacy Tauri transition sources
   ├─ electron/         ← Electron main/preload, IPC handlers, PTY/web services
   │  ├─ services/browser-mcp-server.mjs ← stdio MCP bridge for the embedded browser
   │  ├─ services/browser-context.mjs    ← snapshot/annotation redaction
   │  └─ browser-annotation-preload.cjs  ← isolated hover/click descriptor relay
   ├─ src/              ← frontend (React + TS)
   │  ├─ App.tsx        ← top-level orchestration, IPC listeners, workspace composition
   │  ├─ types.ts       ← shared types + AI_TOOLS + LS keys
   │  ├─ hooks/
   │  │  ├─ useAttentionState.ts          ← attention persistence, dedupe, read/resolve transitions, sidebar derivation
   │  │  └─ useSessionLifecycleActions.ts ← recover/deactivate/delete/status/session-id actions
   │  ├─ lib/
   │  │  ├─ agentActivity.ts  ← runtime/work state derivation + shared active-session predicate
   │  │  ├─ attention.ts      ← pure attention item transitions
   │  │  ├─ sessionLifecycle.ts ← pure session lifecycle messages/helpers
   │  │  ├─ layout.ts       ← tree operations (getAt/setAt/pruneAgent/…)
   │  │  ├─ persistence.ts  ← localStorage load + bootstrap
   │  │  ├─ appTheme.ts     ← global theme definitions + localStorage save
   │  │  ├─ appInfo.ts      ← app version/variant, GitHub repo URL
   │  │  ├─ notificationSound.ts ← notification sound settings/playback
   │  │  ├─ scrollback.ts   ← xterm scrollback save/restore (localStorage)
   │  │  ├─ desktopPet.ts   ← pet settings, session state aggregation, completion queue payload
   │  │  └─ terminal.ts     ← createEntry / theme / md·html·image links / search·serialize / zoom / Ctrl+Enter / notifyDone
   │  ├─ components/
   │  │  ├─ Sidebar.tsx        ← Screen summary, machine/folder/project tree, search, drag/move
   │  │  ├─ TerminalArea.tsx / PaneSlot.tsx / Splitter.tsx
   │  │  ├─ TopBar.tsx         ← custom titlebar (sidebar toggle, Quick Open, notifications, pin, new window, pet, settings)
   │  │  ├─ FileTreePanel.tsx  ← right file tree sidebar (lazy loading, Find files)
   │  │  ├─ DocViewer.tsx      ← document tab viewer (md/html/image/text)
   │  │  ├─ ResourceMonitor.tsx ← process tree CPU/memory monitor on the right of the status bar
   │  │  ├─ ImageViewer.tsx    ← terminal image path viewer
   │  │  ├─ DesktopPetPage.tsx / DesktopPetPage.css ← pet mascot, state animations
   │  │  ├─ SettingsModal.tsx  ← workspace/services/info settings navigation
   │  │  ├─ SearchBar.tsx      ← terminal Ctrl+F search bar
   │  │  ├─ NewProjectModal / NewAgentModal / RenameSessionModal / RenameProjectModal
   │  │  ├─ SessionPropertiesModal.tsx / ProjectPropertiesModal.tsx
   │  │  ├─ Toast.tsx
   │  │  └─ Menus.tsx         ← ContextMenu / ProjectContextMenu / TabContextMenu
   │  ├─ App.css
   │  └─ main.tsx
   ├─ src-tauri/        ← legacy Tauri transition backend
   │  ├─ src/lib.rs     ← PTY + hook server + commands + setup
   │  ├─ src/remote.rs  ← remote axum server, tunnel, auth, approval (REMOTE.md)
   │  ├─ src/remote_page.html / remote_login.html ← remote web client
   │  ├─ src/usage.rs   ← token accounting, SQLite, dashboard server (USAGE_DASHBOARD.md)
   │  ├─ src/usage_dashboard.html ← dashboard UI
   │  ├─ Cargo.toml
   │  ├─ tauri.conf.json / tauri.company.conf.json ← per-variant config
   │  └─ capabilities/default.json
   ├─ scripts/         ← Electron/Tauri build, smoke, and manifest helpers
   └─ package.json
```
## IPC Command Surface

Electron production commands are validated in the main process and exposed through the
preload bridge. The legacy Tauri backend retains a compatible command surface for the
transition channel; the table below describes the shared behavior.

### Commands

| command | args | behavior |
|---|---|---|
| `spawn_pty` | id, shell?, cwd?, init_command?, ai_tool_id?, ssh?, cols, rows | opens a PTY and runs PowerShell, creates/merges settings.local.json for hooks, injects env vars, types the init command 600ms later, starts the reader thread. With `ssh`, spawns a remote PTY via `ssh -tt user@host "<remote command>"` instead of PowerShell and skips typed-init (baked into the remote command). The remote command first injects `TERM=xterm-256color`/`COLORTERM=truecolor` for TUI key handling. **Windows remote**: the remote command is sent as `powershell -EncodedCommand <base64>` so it works whether the default shell is cmd or PowerShell (env via `$env:`, cd via `Set-Location`). To avoid the npm CLI `.ps1` execution policy issue, Windows SSH hosts use `codex.cmd`/`claude.cmd` shims by default. In Phase 2 (key mode), working/done·session-start hooks operate via an `-R <port>:127.0.0.1:<hookPort>` reverse tunnel + remote helper (`multiagent-notify.ps1`) push and hook merge (`setup_remote_hooks`). Password mode auto-types the password into the PTY (no hooks) |
| `ssh_test` | ssh | quickly checks connectivity with `ssh -o BatchMode=yes -o ConnectTimeout=8 ... "echo"` (Settings Test button) |
| `write_pty` | id, data | writes bytes to the active PTY writer |
| `resize_pty` | id, cols, rows | master.resize() (ConPTY → SIGWINCH equivalent for the child) |
| `kill_pty` | id | child.kill() + remove from state |
| `confirm_close` | (none) | sets the window-close confirmation flag to true + window.close() — called after the frontend's graceful shutdown completes |
| `list_markdown_files` | folder | recursively scans `.md/.html` under the folder, `{name, relative_path}[]` (max 500) |
| `read_markdown_file` | folder, relative_path | reads md/html. Absolute paths may leave the folder; over 2MB rejected |
| `resolve_markdown_path` | folder, path | validates/normalizes clicked terminal paths (supports absolute paths outside the folder) |
| `read_image_data_url` | path, folder? | image file as a data URL (for the image viewer, 25MB limit) |
| `document_browser_open` / `document_browser_navigate` | folder, relative_path, optional agent_id / browser_id, URL | opens or navigates an isolated HTTP(S) browser tab; tabs share the app-local browser profile and expose a stable tab/browser ID |
| `document_browser_attach_annotation` | browser_id, optional send_to_session | captures the explicitly selected element as sanitized JSON/HTML/PNG context; copies the prompt to the clipboard by default or sends it to the associated session when explicitly requested |
| `play_system_sound` / `read_audio_file` | — / path | notification sound (system beep / custom file bytes) |
| `set_desktop_pet_enabled` | enabled | show/hide the main-process Desktop Pet window pre-created in setup |
| `update_desktop_pet` / `desktop_pet_snapshot` | update / — | caches pet state payload + delivers window events / initial state query |
| `reset_desktop_pet_position` | — | moves the pet to the default bottom-right position of the most recently focused workspace monitor |

Additional command groups (details in each document):
- **Remote** ([REMOTE.md](REMOTE.md)): `start/stop_remote_server`, `remote_server_status`, `start/stop_tunnel`, `tunnel_status`, `remote_config_get/set`, `remote_access_list/approve/revoke`, `sync_remote_agents`, `sync_remote_view`
- Remote chat file previews reuse the authenticated document/file APIs. `/api/docs/read` and `/api/files/image` accept an optional agent id. HTML uses authenticated `/api/docs/preview` issuance and then opens a short-lived, unguessable `/preview/<token>/...` URL in a separate tab. That capability route is read-only, expires after 15 minutes, real-path checks every request against the synchronized project root, and serves only allowlisted web asset extensions. A response CSP gives the document an opaque sandbox origin without `allow-same-origin`, blocks forms/external network access, and prevents it from reading the Remote API; keeping the original path below the token preserves relative CSS/JavaScript/image URLs
- **Dashboard** ([MONITOR.md](MONITOR.md)): `sync_monitor_state`, `start/stop_monitor_server`, `monitor_server_status`, `monitor_config_get/set` — session monitoring and the Usage screen served by a single local server
- **Usage accounting** ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md)): `sync_usage_catalog`, `usage_ingest_now`, `resolve_cli_session`, `relink_cli_session` (the `start/stop_usage_server` family are legacy commands for the previous standalone Usage server)
- **Window**: `show_main_window`, `open_new_app_window`, `get_detached_agents`, `get_agent_window_usage`, `claim_agent_for_window`, new window/always-on-top related

#### Peer workspace windows and session ownership

The Electron main process and system tray are the persistent application shell. Every visible `BrowserWindow` is an equal workspace window with the same project/session controls; there is no parent/secondary renderer role.

- Each workspace receives a stable `workspaceWindowId`. Its Screen tree and active view use `multiagent.workspace.<id>.groups.v1` / `multiagent.workspace.<id>.view.v1`, so one window never overwrites another window's layout
- Projects, sessions, hooks, and PTYs remain process-wide. A main-process ownership map (`agentId → webContents.id`, still named `detachedAgents` internally for compatibility) prevents two windows from controlling one live session
- `claim_agent_for_window` is used by every workspace before selection. `spawn_pty`/`attach_terminal` also enforce the same ownership in the main process as a race-condition defense
- Opening a session in a new window atomically transfers ownership, removes it from the caller's layout, and marks it **"사용 중"** in every other window
- Natural PTY exit, deactivate/close, or workspace destruction releases ownership. A live PTY orphaned by a closed window remains in the main process and can be claimed and reattached by another workspace
- Closing the final workspace does not quit Electron. The tray remains; opening it recreates the most recently focused workspace ID and reattaches its live PTYs
- One workspace is transparently elected coordinator for singleton UI-to-service mirrors (Desktop Pet, Remote, Monitor, Usage). If it closes, the main process elects another and emits `workspace:coordinator-changed`; this role does not change window capabilities
- Tray Exit/update/relaunch broadcasts `app:close-requested` to every workspace and waits for every renderer's `confirm_close` before final process shutdown (5-second fallback remains)

**IPC contract:** `runtime_flags` returns `workspace_window`, `workspace_window_id`, and `coordinator`; window/session commands remain `open_new_app_window`, `get_detached_agents`, `get_agent_window_usage`, and `claim_agent_for_window`. Ownership events remain `session-detached` / `sessions-reattached`.

### Embedded browser and agent bridge

The Electron main process owns a single persistent application browser profile and
keeps multiple native `WebContentsView` tabs in a `browserId → tab` map. A tab may
be associated with an `agentId`; the association is used by the local
`multiagent-browser` stdio MCP server. The server calls authenticated
`/integration/v1/browser/:agentId/:action` routes and returns sanitized page
snapshots, screenshots, navigation results, and explicit element annotations to
Codex/Claude. It never exposes arbitrary JavaScript or the browser profile to
the web renderer. See [BROWSER_MCP.md](BROWSER_MCP.md) for the tool list,
annotation flow, and security boundaries.


### State (`AppState`)

```rust
struct AppState {
    ptys: Mutex<HashMap<String, PtyHandle>>,
    hook_info: HookInfo,  // { port, token, pid, integrationApiVersion, helper_path }
    close_confirmed: Mutex<bool>,  // marks graceful close in progress
    remote: Arc<remote::RemoteHub>,  // remote server/tunnel/session/approval
    usage: Arc<usage::UsageHub>,     // token accounting/dashboard server
}

struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,  // shared by read thread / write_pty / init thread
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}
```

### Hook Communication Flow

1. At app start, `start_hook_server` → `TcpListener::bind("127.0.0.1:0")` → random port + UUID token
2. `write_helper_script` → writes `%LOCALAPPDATA%\com.jintae.multiagent\notify.ps1`
3. `write_hook_info` → writes `hook-info.json { port, token, pid, integrationApiVersion }` in the same folder (helpers and MiraControl read it again when the port/token changes across app restarts)
4. On `spawn_pty`:
   - merges `UserPromptSubmit`/`Stop`/`SessionStart` hooks into that folder's `.claude/settings.local.json` (JSON)
   - merges the same 3 hooks into that folder's `.codex/config.toml` (TOML, `toml_edit` crate)
   - both preserve existing user hooks and replace only their own via the `__source: "multiagent"` marker
   - injects env vars: `MULTIAGENT_PORT` (for compatibility), `MULTIAGENT_TOKEN`, `MULTIAGENT_AGENT_ID`
5. Claude/Codex runs a hook → `powershell -File notify.ps1 working|done`; `UserPromptSubmit`'s `prompt` is also captured up to 500 chars
6. The script reads `hook-info.json` and POSTs UTF-8 JSON to `http://127.0.0.1:PORT/event { id, event, token, prompt? }`
7. The Rust HTTP server validates the token → emits Tauri event `agent:hook-event { id, event }`
8. The listening frontend updates state + notifies

App-relaunch recovery uses a separate `recovering` runtime state. Restored PTYs
stay in that state even when startup output arrives; `SessionStart` (or another
live CLI hook) promotes them to `running`, while only prompt/tool hooks can mark
them `working`. A 20-second live-PTY fallback prevents a missing hook from
blocking input forever. Remote and MiraControl expose this as initialization,
not work.

The Electron hook server also exposes the token-authenticated local
`/integration/v1/**` MiraControl API on that same loopback port. It returns compact
Codex/Claude status and accepts guarded activate/input actions without exposing
terminal output or changing hook configuration. See [MIRACONTROL.md](MIRACONTROL.md).

### Window Close Intercept

At setup, `window.on_window_event` intercepts `CloseRequested`.
- If the flag is false: `api.prevent_close()` + `app:close-requested` event to the frontend
- The frontend performs graceful shutdown (sends `/quit` + waits 2s), then calls the `confirm_close` command
- `confirm_close` sets the flag to true and closes Desktop Pet first, then the main WebView last → flushes the reactivation snapshot to localStorage, then the process exits. If the window remains after 750ms, `app.exit(0)` fallback

For the full flow and token capture, see [RESUME.md](RESUME.md).

### Default Shell Selection (`default_shell()`)

Existence checks in order:
1. `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` ← MS Store PowerShell 7.6+
2. `%ProgramFiles%\PowerShell\7\pwsh.exe`
3. `C:\Program Files\PowerShell\7\pwsh.exe`
4. Windows PowerShell 5.1
5. `cmd.exe`

When starting a PowerShell-family shell, the `-NoLogo` argument is added.

## Frontend (`src/App.tsx`)

### State

```ts
projects: Project[]                // project meta + optional UI-only projectFolderId
projectFolders: ProjectFolder[]    // one-level collections scoped to local or one SSH machine
agents: Agent[]                    // session meta (id, projectId, name, folder, aiToolId, dangerous, workerSettings?, status, createdAt, lastSessionId?)
groups: Group[]                    // each group = layout tree + optional reference projectId + session pins
activeProjectId: string | null     // the project the sidebar/Docs currently follow
activeGroupId: string | null       // the group currently shown
activePath: Path | null            // active leaf path within that group (number[])
filesOpen/filesWidth                // file tree sidebar open/width (both persisted)
appTheme: AppThemeId                // Soft/GitHub/Warm/Light global theme
projects/projectFolders/agents/groups/view/theme/filesOpen/filesWidth/terminalFontSize are all persisted to localStorage
```

`App.tsx` owns orchestration only for attention and session lifecycle. Attention
storage/derived unread state lives in `useAttentionState`; recover, deactivate,
delete, runtime-status, and session-id mutations live in
`useSessionLifecycleActions`. Pure transitions stay in `lib/attention.ts`,
`lib/agentActivity.ts`, and `lib/sessionLifecycle.ts` so they can be tested
without rendering the full app.

### Layout Tree (`LayoutNode`)

```ts
LeafNode  = { type: 'leaf';  id; tabs: string[]; activeIndex: number }
SplitNode = { type: 'split'; id; direction: 'h' | 'v'; children: LayoutNode[]; sizes: number[] }
```

- Each leaf is one pane. The tabs array = tab order of that pane, activeIndex = currently visible tab
- agents have tab customization fields `pinned`/`tabColor`, set from the tab context menu and persisted to localStorage. Pinned tabs are excluded from "close others/close to the right". The Codex-only `useAltScreen` and per-session `workerSettings` are also edited in session properties; both are launch-time options and take effect the next time the session is activated
- tabs entries are usually agent IDs, but **document tabs** are expressed as `doc:<projectId>:<relativePath>` prefix strings (`src/lib/docTabs.ts`). layout/groupOps operations treat strings as opaque so they just work, and `validateLayout` keeps doc ids as valid tabs so they restore after restart. Closing a document tab uses `closeDocTab` (no solo-group rearrangement), and they are removed via `stripDocTabs` before remote/monitor sync
- Split operations add a new leaf to the current Screen. If the parent split has the same direction it is added as a sibling; otherwise the target leaf is wrapped in a new split, nesting it
- So one Screen supports 3+ panes like `A+B+C` and nested left-right/top-bottom layouts
- `sizes` child ratios sum to 1

### Per-session Content Workers

- A Codex session can independently select a worker for **documentation/Markdown** and **HTML/presentation** work. `undefined` means disabled, so previously stored sessions remain backward-compatible
- Worker choices follow Settings → Agents: `Codex · Luna Max` is hidden when Codex is disabled, `Claude · Opus` is hidden when Claude is disabled, and the section is hidden when neither provider is enabled
- Luna uses Codex's native multi-agent support. `src/lib/sessionWorkers.ts` appends invocation-scoped `-c` overrides for the Luna model, max reasoning, two named roles, concurrency, and delegation guidance. It does not mutate the user's global `~/.codex/config.toml` or the project's `.codex/config.toml`
- Opus is not a Codex model. The per-session guidance tells the bounded worker role to invoke the installed Claude Code CLI with Opus/max, safe mode, a restricted tool list, no session persistence, and prompt input over stdin. Claude Code must be installed and authenticated; if it is unavailable, the primary Codex session continues safely and reports the failure
- The primary Codex agent owns file allocation, integration, and verification. Workers must not edit the same file concurrently
- Changing a running session does not hot-patch its CLI process. Deactivate and reopen it; the stored `lastSessionId` is reused, so the existing conversation resumes with the new worker configuration

### Group Model Invariants

- Every ID in agents appears exactly once in groups[*].layout (in some group, some leaf, some tab)
- Each agent has exactly one projectId
- A group can hold sessions from multiple projects. `group.projectId` is only a reference project for new solo groups or legacy fallback; it does not restrict member projects
- Existing installs that only had `multiagent.agents.v1` are migrated by auto-creating Projects per agent.folder
- If something goes missing for any reason, loading repairs it by creating a solo group
- A group whose layout empties is auto-deleted
- A split group can have 2+ panes, and each pane can hold multiple tabs
- On load, `normalizeStoredGroups` validates all groups at once. If the same agent is in multiple groups, a split Screen wins over a stale solo, and between same shapes the currently active group wins
- Multi-window save authoritatively overwrites the current groups array. Deleted old group IDs are not re-merged from localStorage
- `sessionPins?: Record<agentId, sessionId>` are resume session IDs pinned to the group
- `sessionLocked?: true` prevents outside sessions from being added to the group via tabs/splits/drag
- Session pins of sessions removed from the layout are cleaned up in `updateGroup`

### Sidebar Screen Summary

- Only groups whose root is a `split` are shown as `Screen N (A+B)` in the `SCREENS` area above the sidebar project tree. A single-leaf group with just multiple tabs is not a Screen
- Screen numbers and colors are assigned by current split group order, and each member row of a project also shows the same-color `SN` badge
- Sessions from different projects split together still appear on one Screen summary line, and clicking the row activates that `groupId` directly instead of re-finding a representative session via `groupOf`
- In `Screen 1 (A+B)`, splitting C inside pane A makes it `Screen 1 (A+C+B)` with the same group ID. If C was on another Screen, it is removed from the original Screen — it never belongs to two Screens at once

### Project Folder Collections

- `ProjectFolder = { id, name, machineKey, createdAt }`, where `machineKey` is `local` or `ssh:<hostId>`. `Project.projectFolderId` is optional
- Collections are sidebar metadata only. They do not rewrite `Project.folder`, `remoteFolder`, `sshHostId`, session cwd, Git scope, Docs scope, or file-tree scope
- The hierarchy is one level: `machine → project folder → project → session`. Projects without a valid same-machine folder render under the virtual `미분류` folder
- Folder and project array order remain authoritative. Folder reorder changes `projectFolders[]`; project drops update `projectFolderId` and the existing `projects[]` order
- Folder deletion removes only the collection entity and clears matching project assignments. It never deletes projects or sessions
- Folder collapse state is window-local UI state, while folder entities and project assignments are part of the shared workspace snapshot and synchronize between equal workspace windows
- The remote view payload includes `projectFolders` and each project's `projectFolderId`, so Remote navigation can adopt the same hierarchy without changing the data contract again

### Pinning Group Sessions

- Running `Pin group to current sessions` (현재 세션으로 그룹 고정) from the sidebar context menu stores the group members that have a `lastSessionId` into `group.sessionPins`
- At spawn, `PaneSlot` checks `group.sessionPins[agentId]` first, falling back to `agent.lastSessionId`
- Pinned groups show a `PIN` badge in the sidebar
- `groupOps.openAsTab`, `splitWith`, `performDrop` block moves where an outside session enters a locked group or a session leaves a locked source group
- The current implementation pins only the "currently stored session IDs" without keeping a list of past sessions

### xterm Lifecycle

- `termsRef: Map<agentId, TerminalEntry>` — Terminal instances per agent, preserved permanently
- Each entry owns one `el: HTMLDivElement`. `term.open(el)` happens only once
- When the active tab changes, `bodyRef.replaceChildren(entry.el)` swaps the slot (the previous tab's el is detached)
- An inactive tab's xterm stays alive in memory and keeps receiving PTY data into its scrollback. Clicking it again reattaches
- Codex sessions default to `--no-alt-screen`. Every terminal uses ConPTY on Windows, and xterm uses matching `windowsPty.backend = "conpty"` compatibility. Codex sessions additionally use the shadow scrollback filter; Claude and Shell keep pass-through output
- Wheel events are intercepted in a capture-phase handler and **branch by buffer kind**. On the **normal buffer**, scrollback is rolled directly via `scrollTerminalLinesImmediately()`, which updates xterm's buffer scroll state immediately (ignoring TUI mouse tracking). xterm's public `scrollLines()` first updates the viewport scrollTop and only later reconciles `ydisp`/`isUserScrolling` in an async scroll event, so during streaming output the "user is looking up" state applies late and the view can snap to the bottom — hence the direct buffer scroll path. On the **alternate buffer** (fullscreen TUI) there is no scrollback, so the viewport is not rolled; if the TUI has mouse reporting on, a native SGR wheel event (`\x1b[<64/65;col;rowM`), otherwise `PageUp/PageDown`, is sent to the PTY to move the TUI's own scroll ([KNOWN_ISSUES.md](KNOWN_ISSUES.md))
- Ctrl+wheel changes the `fontSize` of all terminals together and saves to `multiagent.terminalFontSize.v1`
- When the global theme changes, `term.options.theme` of all living xterm instances is updated
- `registerLinkProvider` exposes `.md/.markdown` paths as links. Ranges are built to match xterm's 1-based buffer coordinates, and clicking resolves via `resolve_markdown_path` then opens a document tab in the main workspace (absolute paths outside the project folder open the OS default app)

## Auto Update

- Based on `tauri-plugin-updater` + `tauri-plugin-process`. Settings → About → **Check**
- Queries the variant's updater endpoint (`latest.json` / `latest-company.json`) → if a newer version exists, downloads, installs, and restarts after **signature verification**
- The pubkey is baked into `tauri.conf.json`, and `.sig` is generated with the private key at build time. The full build/sign/publish process: [RELEASE.md](RELEASE.md)

## File Tree & Document Tabs

### Backend

- **`list_directory`** (Electron only): returns `{name, relative_path, is_dir}[]` for one directory under the project root (dirs-first sort, 2,000-entry cap per directory). Excludes `node_modules`/`.git`/`target`/`dist`/`build`/`.next`/`.cache`/`.venv`/`__pycache__`/`out`. `isInside` sandbox blocks access outside the root
- **`list_git_submodules`** (Electron only): parses the selected project's `.gitmodules`, recursively follows initialized nested submodules, and returns `{name, relative_path, url, initialized}[]` (200-entry cap). Paths are normalized and constrained to the project root; uninitialized submodules are reported for disabled UI options
- **`read_text_file`** (Electron only): returns any file inside the root as `{kind:"text",content} | {kind:"binary"} | {kind:"too_large",size}` (2MB cap, binary detected by NUL sniffing the first 8KB, `isInside` enforced)
- **`git_status`** (Electron only): probes the repository with `git rev-parse --is-inside-work-tree`, then runs `git status --porcelain -z` (30s safety timeout, 2,000-entry cap) → `{is_repo, entries: {relative_path, status}[]}`. Skips original-path tokens of rename/copy entries and compresses XY codes to a single letter (`U`/`D`/`R`/`A`/`M`). Only a successful non-repository probe returns `is_repo:false`; timeout and missing-git failures remain explicit errors
- **File operation IPC** (Electron only, all `isInside` sandboxed + name validation): `create_file` (`wx` flag protects existing files) / `create_directory` / `rename_path` (returns the new relative path) / `duplicate_path` (auto names `name copy[ n]`, folders copied recursively) / `delete_path` (`shell.trashItem` → trash, not permanent)
- **Source Control IPC** (Electron only): `git_changes` — `status --porcelain -z` (staged=X column/unstaged=Y column split, `MM` counts both) + `diff --numstat`/`--cached` line counts + branch + `rev-list --left-right --count @{u}...HEAD` ahead/behind + `log -n 8` run in parallel and returned at once. `git_stage`(`add --`) / `git_unstage`(`restore --staged --`) / `git_discard` (classifies per file via porcelain → tracked=`restore --source=HEAD --staged --worktree`, untracked/staged-new=`shell.trashItem`) / `git_commit`(`-m`, passed as execFile args so no shell injection). Path arrays (1–500) and messages are validated in the contract layer. UI Commit with 0 staged stages everything first then commits (Commit All)
- **`resource_usage`** (Electron only): builds a ppid tree from a full process snapshot (Windows `Win32_Process` CIM ~100ms / POSIX `ps`) and sums CPU%/memory/process counts of each local PTY root's subtree. CPU% is the User+Kernel time delta between two samples (normalized by core count). Returns the app's own tree total plus per-session details
- **`set_titlebar_overlay`** (Electron only): applies the native window button overlay color (hex validated) to all app windows on theme change
- **Ports IPC** (Electron only): `list_ports {projects}` — parses `netstat -ano` (not using `-p tcp`, which hides IPv6-only listeners) LISTENING entries + queries all `Win32_Process` (Name/CommandLine/ppid) for attribution: ① if the listener pid's ppid chain contains a session PTY root → `terminal_id` ② if the command line contains the project folder as a boundary token → `project_id` (deepest folder wins) ③ otherwise external. Wildcard binds normalize to `localhost`, `host:port:pid` dedup, 200 cap. `kill_port_process {pid, port}` — re-scans netstat right before kill to re-verify ownership + refuses own pid. POSIX uses `lsof -iTCP -sTCP:LISTEN` + `ps`
- **Window creation**: `titleBarStyle:'hidden'` + `titleBarOverlay` (36px) + `Menu.setApplicationMenu(null)` — the custom top bar replaces the titlebar and min/max/close are OS overlay. DevTools (F12/Ctrl+Shift+I) and dev reload (Ctrl+Shift+R) are restored via `before-input-event` (Ctrl+R intentionally unbound — reserved for the terminal)
- `list_markdown_files`/`read_markdown_file`/`resolve_markdown_path` are still used for document tab Markdown/HTML discovery and QuickOpen doc search (also works on Tauri). Electron-only `document_browser_open` creates the isolated HTML window; its shell uses the matching `document_browser_*` navigation commands
- `resolve_markdown_path` handles `Docs/TODO.md`, relative paths, absolute paths, and `file.md:12` line suffixes, canonicalizes, then checks whether it is inside the root
- The Tauri runtime has no `list_directory`/`read_text_file`, so the file tree and text view degrade to empty/error states there (Electron-first)

### Frontend

- **`FileTreePanel.tsx`** — right sidebar. Per-directory lazy cache in `dirCache: Map<relativePath, entry[]>`; only expanded folders project to flat visible rows. Find files is a debounced client-side BFS (400 dirs/200 results cap). Type chips recursively scan collapsed directories and derive `matchingFiles` plus `visibleDirs`, so only matching files and their ancestor folders remain; paths left unscanned at the safety cap stay visible rather than becoming false negatives
  - **Project selection**: header dropdown chooses the displayed project. Pin OFF follows the active project; pin ON fixes it (persisted in `multiagent.fileTreePin.v1`, auto-released when the project is deleted)
  - **Repository selection**: `list_git_submodules` populates a main/submodule dropdown. Selecting a repository changes the sandbox root used by Files and Source Control while document tab paths are re-prefixed to remain project-relative. The selected scope persists in `multiagent.fileTreeScope.v1`
  - **Expansion state**: stored per project/repository in `multiagent.fileTreeExpanded.v1`; the main-repository key remains the legacy project id for compatibility. Re-entering a project/submodule reloads the saved folders to restore. Expand all is BFS (400-dir cap)
  - **git badges**: processes `git_status` results into a file map + folder propagation map (D>M>A>U rank). Refresh is event-driven: project/repository entry, agent `done`, app-window focus, manual refresh, and local Git/file mutations. A single-flight coordinator coalesces refresh requests while a scan is active. Name and badge share the same color
  - **Context menu + inline input**: menus per file/folder/empty area; new file, new folder, and rename are handled as inline input rows (Enter/Esc). Renaming a folder also rewrites descendant expansion paths to the new prefix. After operations, that directory refreshes + git updates
  - **View tabs**: topmost 🗀 Files / ⎇ Source Control switch. The ⎇ badge count reuses the event-refreshed Files view `git_status` result (`gitFiles.size`)
  - **SourceControlView**: loads `git_changes` on view entry and on the same event-driven refresh signals; its branch row also has a manual refresh button. Requests are single-flight/coalesced. Stage/unstage/commit are serialized with a busy guard, then immediately reload + refresh tree badges. Single click toggles selection, Shift+click selects a range, and double-click opens the configured external diff for source/config/text files (HTML and non-text assets keep the document viewer). A permanently reserved batch-toolbar slot prevents selection from moving rows between the two clicks
  - The file tree open button is a **floating button at the window's top-right** (`.files-open-btn`, rendered only when the panel is closed), not in the left sidebar
- **`DocViewer.tsx`** — opens `doc:<projectId>:<relativePath>` tabs. md → `react-markdown`+`remark-gfm`+`rehype-highlight`, images → `read_image_data_url`, and other text files → `read_text_file` as a highlighted fenced code block. Electron HTML tabs request the isolated Document Browser through `document_browser_open`; the trusted React toolbar is rendered in the active document pane and the untrusted view is positioned over its browser host through `document_browser_bounds`. The old `srcdoc` path is not used there because it loses the document's relative asset base. Tauri keeps the sandboxed in-pane fallback. Read failures show a Retry/Reveal error panel
- **Electron Document Browser** — `DocumentPreviewService` binds a loopback-only ephemeral HTTP server and issues a 15-minute, project-root-scoped capability URL. An untrusted `WebContentsView` is attached to the current workspace window and positioned over the renderer's browser host, while the trusted toolbar remains a normal React document-tab component. The view uses the shared app-local persistent profile and a narrow sandboxed annotation preload with no Node APIs, denies permissions, blocks `file://` and project-root escapes, keeps same-token preview navigation in the view, and allows normal external HTTP(S) links to continue in that same pane (including popup links promoted to the current view). The toolbar supports back/forward/reload, an editable HTTP(S) address bar, default-browser open, clipboard annotation capture, and explicit session delivery. `document_browser_navigate` is the typed IPC seam for the authenticated local browser/MCP controller; PTY agents do not receive renderer IPC access directly
- **`PaneSlot.tsx`** — when the leaf's active tab is a doc id, the xterm host (`.pane-body`) is hidden with `display:none` and DocViewer renders. The xterm DOM and attach/detach lifecycle are kept intact so terminal↔document switching loses no output
- `Open`/`Reveal` open with the default app / reveal in Explorer

### Drop Zone Computation

`computeDropZone(rect, x, y)`:
- In the 25% edge regions (left/right/top/bottom), the edge closest to the mouse position wins
- If 25%+ away from all edges, `center`
- `top/bottom` → vertical split (`v`), `left/right` → horizontal split (`h`)
- An edge drop adds a sibling pane if the target's parent has the same direction; otherwise it wraps the target leaf in a new split
- `center` → addTabToLeafAt (merge as tab)

### Core Helpers (careful when modifying)

| function | role |
|---|---|
| `getAt(layout, path)` | descends by path and returns the node |
| `setAt(layout, path, next)` | replaces the node at path with next. next=null removes it + flattens if the parent split shrinks to 1 child |
| `findLeafPath(node, agentId)` | path to the leaf where leaf.tabs.includes(agentId) |
| `findLeafPathById(node, leafId)` | search by leaf.id (safe anchor after prune during DnD) |
| `pruneAgent(node, agentId)` | completely removes that agent from the tree. Deletes the leaf if it was the last tab; flattens the split if the leaf was alone |
| `splitLeafAt(layout, path, dir, newAgentId)` | wraps the leaf in a split. The new leaf has 1 tab |
| `addTabToLeafAt(layout, path, agentId)` | adds to leaf.tabs + moves activeIndex there |
| `setLeafActiveTab(layout, path, agentId)` | changes activeIndex |
| `insertNextTo(layout, targetPath, newLeaf, dir, before)` | adds as sibling if the parent split has the same dir, else wraps |
| `validateLayout(node, validIds)` | validation on load. Auto-migrates the old `{type:'leaf', agentId}` format |

`groupOps.selectGroup` takes a Screen row's `groupId` and representative agent and activates the exact group/leaf. Menu splits and edge drops share `insertNextTo`, and moves first `pruneAgent` to remove the session from its original group, maintaining global single membership.

### State Change Pattern

Most actions process the layout inside `setGroups((prev) => { ... })`, then read the latest active info from refs (`activeGroupIdRef`, `activePathRef`). `setActivePath`/`setActiveGroupId` are also called synchronously.

## Tauri Config (`tauri.conf.json`)

- `app.windows[0].dragDropEnabled: false` ← disables the OS file-drop handler to use HTML5 drag-and-drop
- Permissions (`capabilities/default.json`):
  - `core:default`, `opener:default`
  - `dialog:default`, `dialog:allow-open` (folder selection)
  - `notification:default` (OS toast)

## localStorage Keys

- `multiagent.projects.v1` — `StoredProject[]` (project name, physical folder, last used time, optional `sshHostId`/`remoteFolder`/`projectFolderId`)
- `multiagent.projectFolders.v1` — shared `ProjectFolder[]` registry (UI-only name, machine scope, order)
- `multiagent.sshHosts.v1` — `SshHost[]` (SSH host registry: label/host/user/port?/identityFile?/extraOptions?/remoteOs?/authMethod?/preferCmdShim?)
- `multiagent.agents.v1` — `StoredAgent[]` (session meta + projectId)
- `multiagent.workspace.<workspaceWindowId>.groups.v1` — that peer window's `Group[]` Screen tree
- `multiagent.workspace.<workspaceWindowId>.view.v1` — that peer window's `{ activeProjectId, activeGroupId, activePath }`
- `multiagent.groups.v1` / `multiagent.view.v1` — legacy single-window layout keys, copied once into the first peer workspace
- `multiagent.appTheme.v1` — global theme (`soft`/`github`/`warm`/`light`)
- `multiagent.docsTheme.v1` — legacy Docs-only theme key. Kept for compatibility while the new key is read/written
- `multiagent.filesWidth.v1` / `multiagent.filesOpen.v1` — file tree sidebar width/open state (old `multiagent.docsWidth.v1` unused)
- `multiagent.fileTreePin.v1` — file tree project pin `{ pinned, projectId }`
- `multiagent.fileTreeScope.v1` — last selected repository path per project (`""` = main repository)
- `multiagent.fileTreeExpanded.v1` — file tree expansion state keyed by project id for the main repository and `projectId::submodule/path` for submodules
- `multiagent.sidebarOpen.v1` — left sidebar collapsed state (default open)
- `multiagent.collapsedProjectFolders.v1` — collapsed project-folder ids for the current renderer profile
- `multiagent.terminalFontSize.v1` — xterm font size
- `multiagent.notificationSound.v1` — notification sound settings (mode + customPath)
- `multiagent.attentionItems.v1` — waiting/blocked/completed/stale attention history. Unread `completed` items derive the running-session-only cyan sidebar completion sweep/dot; opening the agent or beginning new work marks its previous completion read
- `multiagent.desktopPetEnabled.v1` — Desktop Pet visibility (default true)
- `multiagent.scrollback.<agentId>.v1` — per-session scrollback snapshot (for restart restore)
- (migration) `multiagent.layout.v1` — old single tree. Converted to a single group on first load, then deleted

> Remote/usage settings are stored not in localStorage but as JSON/SQLite in `%LOCALAPPDATA%\com.jintae.multiagent\`: `remote-config.json`, `remote-access.json`, `remote-push.json` (VAPID keypair + per-login browser endpoints), `remote-monitor-devices.json` (revocable device ids and token hashes only), `usage-config.json`, `usage.db`, `cloudflared.exe`. The Android raw monitor token is encrypted by Android Keystore. APK signing credentials remain build-machine inputs outside Git; Firebase/FCM/Expo Push credentials are not used.
