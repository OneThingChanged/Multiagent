# Known Issues & Future Work

## Known Limitations

### Persistence Limits
- Project **settings** (name·folder) and session **settings** (alias·project·AI tool·dangerous·lastSessionId), **layout** (group/split/tab order·active), **view**, **app theme**, **Docs width**, and **terminal font size** are stored in localStorage
- Group session pins (`sessionPins`, `sessionLocked`) are also stored with the group data in localStorage
- However, **the OS processes of terminal sessions cannot be restored**: when the app closes, the PowerShell+Claude/Codex processes die
- **Codex conversations can resume**: automatic `/quit` on window close → token capture → `codex resume <token>` on next run
- **Claude conversations can also resume**: `session_id` capture via SessionStart hook → `claude --resume <id>` on next run. Details in [RESUME.md](RESUME.md)
- While the app is running, Electron's per-session 512K sequence model in main covers
  renderer reload/hidden pane reattach, and on exit it saves the newest 1,000 xterm lines
  as runtime-local scrollback. But there is no daemon keeping the PTY itself alive after
  the app exits, so this is not a permanent full-output transcript feature. The canonical
  Codex/Claude conversation originals are the provider resume data.

### Scrollback on Window Resize
- xterm reflows automatically when cols change, but output that Codex/Claude **baked in with wrapping based on the previous width** does not re-wrap to the new width. Only new output uses the new width

### Wheel Scroll / TUI
- Wheel handling depends on **which screen buffer** the terminal is using at that moment. Buffer selection is decided by the **running program**, not the terminal (app) (`\x1b[?1049h` enters alternate, `…l` returns). Shell prompts and normal output use the normal buffer; vim/less/man, git pager, and claude/codex interactive screens use the alternate buffer.
- **Normal (main) buffer**: the wheel is intercepted at the capture phase to force-scroll the xterm scrollback (ignoring TUI mouse tracking) — using the immediate buffer scroll path (`scrollTerminalLinesImmediately`) instead of the public `scrollLines()`, so scrolling up during streaming output does not jump to the bottom.
- **Alternate-screen buffer (fullscreen TUIs like claude/codex)**: alt-screen has no scrollback, so going through xterm's wheel path shows blank lines that snap back to the bottom on the next repaint. Instead of rolling the viewport directly, **the scroll signal is handed to the TUI itself**:
  - If the TUI has **mouse reporting on** (`term.modes.mouseTrackingMode !== "none"`), a **native SGR mouse wheel event** (`\x1b[<64/65;col;rowM`) with the wheel position (col/row) is sent to the PTY, so the TUI scrolls its own screen like a standard terminal.
  - If mouse reporting is **off**, it falls back to `PageUp/PageDown` (`\x1b[5~`/`\x1b[6~`).
  - `Shift+wheel` is 3x.

### Codex + xterm.js Scrollback Deletion Mitigation
- On Windows xterm.js hosts, the Codex TUI emits `CSI 2J`/`CSI 3J` on the normal buffer, an upstream issue where the session JSONL is fine but the terminal's previous screen disappears. Related reports: [openai/codex#14277](https://github.com/openai/codex/issues/14277), [xtermjs/xterm.js#5745](https://github.com/xtermjs/xterm.js/issues/5745).
- Since v0.5.26, Codex is automatically launched with `--no-alt-screen`, and only Codex's `CSI 3J` (scrollback purge) is removed from PTY output by a streaming filter. `CSI 2J` and other ANSI controls pass through for TUI rendering.
- Filter state is preserved even when an ANSI sequence splits across multiple PTY reads. Not applied to Claude or plain Shell output.
- Not retroactive to already-running Codex sessions, so reopen sessions after updating. This measure is a compatibility mitigation to preserve the xterm screen; it does not change Codex's JSONL conversation original or resume data.
- **Known limit — re-render truncation**: `CSI 2J` passes through, and xterm.js's 2J deletes viewport contents instead of pushing them into scrollback like Windows Terminal does (xterm.js#5745). When Codex rebuilds the screen (resize, after long work, etc.) and redraws only the transcript tail, some lines then on screen drop out of scrollback and it can **look like the middle was cut**. The conversation original (JSONL, `ctrl+t` transcript) is lossless.
- **Per-session workaround**: enable **Alt-screen mode** in session properties to run that Codex on the alternate screen without `--no-alt-screen` (same approach as Orca). Truncation/scrollback issues disappear at the source, but the conversation does not remain in xterm scrollback (Ctrl+F search, drag copy); history is viewed via Codex's internal scroll and `ctrl+t`. Applies from restart.

### Why Wheel Behavior Differs per Machine (normal scroll vs PageUp/Down)
- Even with the same app and code, depending on the **claude/codex CLI version/mode** running on that PC, the interactive screen may be drawn on the normal buffer or the alternate buffer. Codex launched by the app after v0.5.26 forces the normal buffer for the compatibility mitigation above. Claude and other TUIs launched manually follow each program's buffer choice as before.
- Even on alternate, if that TUI enables mouse reporting, wheel scrolling works naturally; if off, it pages by PageUp/Down.
- In other words, "normal scroll on one computer, PageUp/Down on another" is not an app bug but **a difference in screen buffer/mouse reporting of that PC's claude/codex**. Aligning `claude --version` on both sides makes behavior match. If a pager like git/man is the cause, use `git config --global core.pager 'less -X'` or `export LESS='-X'` to stay on the normal buffer.

### Markdown Document Viewer Scan Limits
- Markdown scan collects up to 500 files for performance protection
- Single Markdown files over 2MB are not read
- Internal/large folders like `node_modules`, `target`, `dist`, `.git`, `.claude`, `.codex` are excluded from scanning

### Hook Dependency
- Work status uses Codex's 6 hook kinds and Claude's 8 hook kinds. `working/waiting/blocked/done` is managed separately from PTY survival.
- Merged into `.claude/settings.local.json` for Claude and `.codex/config.toml` for Codex
- Hook execution spawns a PowerShell interpreter once more — small delay
- Electron auto-checks the local hook server/helper/config every minute. If status display stalls, Settings → **General → Agent Hooks → Hook check & repair** (Hook 점검 및 복구) can reconfigure immediately. SSH remote sessions may need a session restart because of the reverse tunnel.
- Codex re-reviews newly added or content-changed project hooks by hash. If a start warning appears, check the MultiAgent command and path in `/hooks` and trust them. The app does not automatically use `--dangerously-bypass-hook-trust`, which would also bypass other user hooks.
- If no work event refreshes for 30+ minutes, it is not assumed `done` but lowered to the PTY's `running` display. To analyze the cause, save a diagnostics JSON in Settings → **About → Support diagnostics**.

### Cannot Show the Same Agent Simultaneously
- One xterm Terminal instance can only mount to one DOM location
- The same agent cannot be shown in two panes at once (dropping always moves it to one place)

### Desktop Pet
- The pet does not create a new WebView at completion like the old completion popup; it reuses a window created with `focused(false)` on the Tauri setup main thread. After page load it switches to `focusable(false)` — a design to avoid the regression where notification window creation stole terminal focus on Windows
- Currently only the main MultiAgent process owns a pet. There is no broker yet that merges session completions from a **new window** (separate process) into the single pet, and new windows do not spawn duplicate pets
- The pet's transparent window rectangle can block some mouse input to apps below due to Windows hit testing. It is implemented to stay small and be draggable

### Scope of Group Session Pinning
- The current implementation pins the "currently stored session IDs" to the group. There is no UI yet that lists and selects from past sessions
- Pins apply from the next spawn. Already-running Codex/Claude processes are not restarted automatically
- If a pinned session ID is no longer resumable by the tool, the user must unpin or start a new session

### Auto-Update / Release Operations
- Auto-update relies on `latest.json` (+`.sig`) attached to the **Latest release** on GitHub. If the release stays a draft, or latest marking/signing/manifest are missed, no update appears (see the [RELEASE.md](RELEASE.md) checklist)
- The `/releases/latest/download/` path may serve the old version for a few minutes after publishing due to GitHub CDN caching
- Losing the signing private key means existing users cannot auto-update (new key + manual reinstall required)

### Remote Access Constraints
- The internal localhost segment is plain HTTP (external is Cloudflare TLS). Direct LAN access (legacy token) is plaintext on the same network
- Quick tunnel URLs change every launch. A fixed domain requires a Cloudflare account + domain for a named tunnel
- Viewing the same session on desktop and web shares one PTY, so output is shared (intended; desktop owns the screen size)

### SSH Remote Sessions
- **Windows remote = working/done status + session resume supported (Phase 2)**: at spawn, an `ssh -R <port>:127.0.0.1:<hookPort>` reverse tunnel lets remote hooks reach the local server. Pushes the remote `<folder>\.claude\multiagent-notify.ps1` and merges hooks into `settings.local.json`/`config.toml` (remote read → local Rust merge → write, base64 transfer). env (`MULTIAGENT_PORT/TOKEN/AGENT_ID`) is injected into the remote PowerShell command. The session-start hook fills `lastSessionId` so the next spawn runs `claude --resume <id>` (codex `resume <id>`)
- **POSIX (Linux/macOS) remote = status/resume unsupported**: Phase 2 not applied yet. The remote shell opens but status dots only reach running; the resume branch is skipped
- **Usage accounting unsupported (all remotes)**: the usage dashboard only parses local transcripts → remote session tokens are not captured
- **Docs/image viewer unsupported**: based on local folder scans, so disabled for SSH projects (no local folder)
- **OpenSSH client required**: Windows built-in `ssh.exe` (OpenSSH client) must be on PATH. Otherwise spawn/Test fails
- **Remote shell type selection**: when registering in SSH Hosts, choose **Remote OS** (Linux/macOS = POSIX, Windows = PowerShell) for the right command format. POSIX is `cd '<folder>' && exec ...`; Windows runs inside `powershell -NoProfile -NoExit -EncodedCommand ...` with `$env:` injection + `Set-Location -LiteralPath` + `<tool>` execution. Default is POSIX
- **npm `.ps1` execution policy issue on Windows SSH**: Codex/Claude installed via npm on Windows create both `codex.ps1`/`claude.ps1` and `codex.cmd`/`claude.cmd`. The remote PowerShell grabs the `.ps1` shim first, which can throw `PSSecurityException`, so the SSH Hosts **Use .cmd shims for npm CLIs** option is ON by default and Windows remotes run `codex.cmd`/`claude.cmd`. Only hosts that specifically need `.ps1` turn this option off.
- **SSH TUI arrow-key correction**: on the Windows OpenSSH/ConPTY path, xterm application cursor mode (`ESC O A/B/C/D`) can be ignored by some remote TUIs. SSH sessions normalize arrow keys to plain CSI (`ESC [ A/B/C/D`) and force `TERM=xterm-256color`, `COLORTERM=truecolor` before remote tool execution, so menus like Codex/Claude hook review recognize arrow keys.
- **Graceful degrade when reverse tunnel is blocked**: if the remote sshd disables `AllowTcpForwarding`, `-R` fails silently → the session works normally but status/resume are disabled (`ExitOnForwardFailure` not set)
- **Independent of the Windows remote shell (cmd/PowerShell)**: the remote command is sent as `powershell -EncodedCommand <base64>`, so it works whether that server's SSH default shell is cmd or PowerShell (including legacy 5.1). Folder paths with spaces/special chars are safe via base64 + `-LiteralPath`. Concurrent sessions avoid collisions via per-host unique reverse tunnel ports
- **Auth method toggle (key/password)**: per-host **Auth method** selection when registering in SSH Hosts.
  - **Key (default)**: specifying an identity file automatically adds `-o IdentitiesOnly=yes` → prevents **"Too many authentication failures"** from ssh-agent holding many keys (tries only that one key). Key auth must already work.
  - **Password**: `-o PubkeyAuthentication=no` skips keys and goes straight to password. If the password is stored, the app **auto-types it into the PTY** on connect (`password:` prompt detection). Passwords are stored not in localStorage but in local `ssh-secrets.json` (`<app_local_data_dir>`) — same level of local plaintext as client_secret (never synced or returned to the UI). If not stored, type directly in the terminal.
- **Password-auth hosts do not support remote hooks (status/resume)**: Phase 2 hook setup uses non-interactive (BatchMode) ssh, so password auth is impossible → password hosts only get **auto-connect + terminal**; working/done·resume are unavailable (Phase 2 only for key-mode Windows remotes). (SSH_ASKPASS-based password hooks are a follow-up after real-server verification)
- **Server-side `AllowGroups` etc. cannot be fixed by the app**: if blocked by group/policy restrictions in the server's `sshd_config`, the account must be added to the allowed group on the server (cannot be bypassed with client options)

### Codex Plugin Hook Compatibility
- If a codex companion plugin's `hooks.json` does not match codex's hook schema (e.g., a top-level `description` field), hook loading fails → working display/session capture may not work ([RESUME.md](RESUME.md))

### Stale Children Possible if Parent Dies in Dev Mode
- Force-killing app.exe can leave the PowerShell child alive as an orphan
- On the normal exit path (window X), portable-pty drops master → slave EIO → child exit cascade

## Implemented (Past Phase 2 Candidates)

Session restart/deactivate/relink, global shortcuts (Ctrl+T/W/1-9/F), scrollback persistence, terminal search (Ctrl+F), notification sound options, auto-updater, project drag reorder/delete/properties, session properties, sidebar search, image/HTML viewers, remote access, and the usage dashboard are all implemented.

## Potential Improvements (Remaining)

- **Tab reorder**: drag tab order within the same leaf (currently a center drop on the same leaf is a no-op)
- **Extended session settings edit**: alias can be changed, but no UI for project/AI tool/dangerous changes
- **Model/flag customization**: specify extra per-tool CLI args (e.g., `claude -m sonnet`) in the modal
- **Session duplicate**: new session with identical settings in the same project
- **Group name/color**: stronger group identification in the sidebar
- **Session export/import**: groups/layouts as JSON
- **Log export**: per-agent output log files
- **Session process persistence**: keep PowerShell+CLI alive in the background when the app closes (hard on Windows; currently conversations are only restored via resume)
- **Mobile-specific remote UI**: the current remote web targets desktop browsers. A separate narrow-screen layout is needed
- **i18n**: UI mixes Korean/English → unify
