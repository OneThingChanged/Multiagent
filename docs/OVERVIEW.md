# MultiAgent — Overview

A desktop app that manages multiple AI agent (Claude Code, Codex) terminal sessions per project in one window with groups, tabs, and splits, remote control from an external browser, and token usage accounting.

## Goals

- When running Claude/Codex across many projects at once, switch and organize within one window instead of opening many OS terminal windows
- Show which agents are "working" vs "done" with status dots + notifications (including sound)
- IDE-like multi-split + multi-tab layout
- Connect from a browser away from home / on another PC to view and command sessions
- Track token consumption by tool, session, and project on a dashboard

## Tech Stack

- **Shell**: Tauri 2 (Rust backend + WebView2 frontend), two build variants: standard / company
- **Frontend**: React 19 + TypeScript + Vite (dev port 4420)
- **Terminal**: `@xterm/xterm` v6 + addon-fit / -search / -serialize / -web-links
- **PTY**: Rust `portable-pty` (Windows ConPTY)
- **Local HTTP (hook receiver)**: `tiny_http` (127.0.0.1:random)
- **Remote server**: `axum` + `tokio` (WebSocket), Cloudflare Tunnel (`cloudflared`)
- **Usage DB**: `rusqlite` (SQLite)
- **Auth**: GitHub Device Flow / OAuth web flow
- **Updates**: `tauri-plugin-updater` (signed GitHub release auto-install)
- **Other plugins**: notification / dialog / opener / process

## Feature Catalog

### Sessions & Layout
| feature | description |
|---|---|
| Project/session model | register a project → create aliased sessions inside a collapsible tree |
| Multi-tab / splits | multiple tabs per pane, 2+ h/v panes per Screen with nested splits, resize via handles |
| Groups | sessions joined by splits form one group — clicking any member shows the whole group. A session belongs to exactly one group globally |
| Split Screen summary | above the sidebar's `This PC`/project tree, shows `Screen N (A+B+C)`, with the same-color `SN` badge on cross-project members. Rows jump directly by Screen ID, not session search |
| Drag & drop | rearrange tabs/sidebar sessions via 5 drop zones (center = tab, 4 edges = multi-pane split). Moving to another Screen removes it from its previous membership |
| Pin group sessions | pin a group to specific session IDs (PIN), blocking outside session additions |
| 1-line sidebar | compress projects/sessions to single lines |
| Project reorder | drag projects in the sidebar to change order |
| Search | filter by project/session name at the top of the sidebar |
| SSH remote sessions | connect a project to a registered SSH host → sessions run on the remote machine (Windows remotes get status dots + resume; see the dedicated entry below) |

### Session Management (context menu)
Switch / add as tab / split right·down / rename alias / **Restart session** / **Deactivate session** (only when not visible; kills just the PTY to free resources) / **Relink to current session** (finds the newest on-disk session and updates the resume target) / pin·unpin group sessions / **Properties** (session ID, creation time, tool, folder, etc.). Project right-click: rename / delete / properties.

### Status & Notifications
| feature | description |
|---|---|
| Working/Done detection | Claude/Codex hooks (UserPromptSubmit/Stop) → local HTTP → status dot (yellow pulse / green) |
| Notifications | on completion: in-app toast + OS notification + **notification sound** (system sound / custom file / off, chosen in Settings) |
| Desktop Pet | an always-on-top, non-focusable pet window showing idle/working/done plus working/completed counts. Clicking the working badge shows session·tool·latest question; clicking an item/completion balloon jumps to that session |
| Session resume | capture session_id via SessionStart hook → `codex resume`/`claude --resume` on next run ([RESUME.md](RESUME.md)) |
| Scrollback restore | save scrollback just before exit → restore on restart |

### Viewers & Terminal
| feature | description |
|---|---|
| File tree sidebar | full project file tree on the right sidebar — project dropdown, pin (📌), per-project expansion state persistence, expand/collapse all, git status badges (M/U/A/D colors, folder propagation, 10s polling), Find files search, context menu (new file/folder, duplicate, rename, trash delete, copy path). Open via the 🗀 button at the window's top-right; open state/width persisted |
| Source Control view | the ⎇ tab of the file tree panel — branch/ahead-behind, Staged/Changes groups (per-file & stage-all), per-file +/− line counts, Commit after entering a message (Ctrl+Enter), recent commits list. A change-count badge is always shown on the tab |
| Document tabs | open a file from the tree/terminal link/QuickOpen → rendered as a tab in the main workspace (md = GFM + highlight, html = sandbox iframe, images, text = read-only source). Splits/drags/restores in the same tab strip as terminal tabs |
| Image viewer | click an image path (png/jpg/…) in terminal output → in-app viewer |
| Document links | click a `.md`/`.html` path in the terminal → document tab (outside the project folder opens the OS default app) |
| Ctrl+Enter | newline input (IME composition safe) |
| Ctrl+F | terminal search |
| Ctrl+C/V | copy/paste text; image clipboard goes through as a raw keystroke |
| Ctrl+wheel | terminal font zoom (persisted) |
| Wheel scroll | normal buffer always scrolls scrollback (ignores mouse tracking); fullscreen TUIs receive the wheel (mouse wheel events or PageUp/Down) |

### Shortcuts
`Ctrl+T` new session · `Ctrl+Shift+P` new project · `Ctrl+W` close active tab ·
`Ctrl+Shift+T` restore recently closed tab · `Ctrl+1~9` switch tabs · `Ctrl+F` search ·
`Esc` close search/Docs.

### Remote Access ([REMOTE.md](REMOTE.md))
Built-in web server + Cloudflare Tunnel (quick/named, fixed domain possible) + GitHub login + **account approval**. Session list, terminal, input, and sandboxed local-project Markdown/HTML viewing from an external browser. Independent viewer (views a different session than the desktop).

### SSH Remote Sessions
Connect via SSH to another computer reachable on the same network (or office VPN) and run shell/claude/codex on that machine. In Settings → **SSH Hosts** tab, register hosts (host/user/port/identity/extraOptions/Remote OS) (the **Usage guide** (사용 방법) button has a step-by-step guide + public key copy/generate), then in New Project choose **"Run on remote host"** with host + remote folder. The backend spawns the PTY with `ssh -tt` instead of local PowerShell (Windows built-in OpenSSH). On Windows remotes, `codex.cmd`/`claude.cmd` shims are used by default to avoid the npm `.ps1` execution policy error.
- **Windows remote (Phase 2)**: `ssh -R` reverse tunnel + remote hook push gives **working/done status dots + session resume** (same as local).
- **POSIX (Linux/macOS) remote**: shell/tool execution works; status dots only reach running (status/resume is a later Phase). Usage accounting is unsupported for all remotes.
- Details & constraints in [KNOWN_ISSUES.md](KNOWN_ISSUES.md), resume flow in [RESUME.md](RESUME.md).

### Usage Dashboard ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md))
Parses transcript JSONL to load token usage into SQLite, visualized on a separate local web dashboard (charts, summaries, per-session).
The Electron app also preserves per-period account rate limits observed from Codex (session transcripts) and Claude (OAuth usage endpoint) in SQLite, shown on the bottom status bar as **per-tool segments** (gauge + per-tool popover on click).

### Misc
| feature | description |
|---|---|
| Custom top bar | native titlebar/menu removed (Electron). Left/right sidebar toggles, Quick Open, notifications, pin, new window, pet, settings buttons + window drag zone. Native min/max/close overlay kept (Snap Layouts works) |
| Resource Manager | ▦ on the right of the status bar — total app memory + popover with per-project→session process tree CPU%/memory |
| Ports monitor | 🔌 on the right of the status bar — open TCP ports attributed per project (session child processes/command-line paths), open in browser, copy address, kill process, External collapsed section |
| Left sidebar collapse | ⫞ toggle in the top bar, state persisted |
| Auto updates | Settings → About → Check; downloads, installs, and restarts after signature verification ([RELEASE.md](RELEASE.md)) |
| Multi-window | open a new window (top bar) |
| Always on top | always-on-top toggle (top bar pin) |
| Themes | Soft / GitHub / Warm / Light (shared across app, terminal, Docs) |
| Persistence | localStorage (projects/agents/groups/view/theme/…) + local JSON/SQLite (remote/usage). groups stores the current list authoritatively and auto-normalizes legacy duplicates preferring Screens |
