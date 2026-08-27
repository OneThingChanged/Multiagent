# OneThingChanged MultiAgent

**English** | [한국어](README.ko.md)

[![Version](https://img.shields.io/badge/version-0.6.18-blue)](https://github.com/OneThingChanged/Multiagent/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)](https://github.com/OneThingChanged/Multiagent)

**One workspace for every AI agent terminal.** MultiAgent runs and organizes multiple AI-agent CLI sessions — Claude Code, Codex, Qwen, Cline — as project-scoped tabs and split panes in a single Windows desktop app, with hook-based status detection, session resume, a chat view, remote phone access, and token-usage tracking.

Instead of juggling a pile of terminal windows, you register each project once, then launch named sessions inside it — switching, splitting, and monitoring everything from one window.

---

## Features

### Sessions & Layout
- **Project-first workflow** — register a project folder, then create aliased sessions under it in the collapsible sidebar tree
- **Tabs & nested splits** — horizontal/vertical panes, 5-zone drag-and-drop (center = merge as tab, edges = split), resizable splitters
- **Screens** — every session belongs to exactly one split group; sidebar summaries like `Screen 1 (A+B+C)` jump straight to that layout
- **Session management** — restart, deactivate (kill the PTY but keep the session), rename, relink to the latest on-disk session, pin a group to specific session IDs

### Agent Status & Notifications
- **Working/done detection** — Claude Code / Codex / Qwen hooks report over a local HTTP channel; every session shows a live status dot (idle / starting / running / working / exited)
- **Completion alerts** — in-app toast, Windows notification, and a configurable sound (system sound / custom file / off)
- **Desktop Pet** — an always-on-top, non-focusable mascot showing idle/working/done, running & completed counts, and the latest prompt; click to jump to the session

### Chat View
- A rich conversation view alongside the raw terminal (for transcript-based tools): tool-call blocks with summaries and edit diffs, inline question/permission cards, thinking indicator
- Composer with `/` command and `@` file autocomplete, clipboard-image paste, large-paste collapsing, message queueing while the agent works, Esc to cancel

### Session Resume
- `SessionStart` hooks capture each tool's session ID; reopening a session runs `codex resume <id>` / `claude --resume <id>` automatically
- Scrollback snapshots restore the terminal view after an app restart
- **Relink to current session** recovers a lost resume target by scanning the newest on-disk transcript

### Files, Docs & Git
- **File tree sidebar** — lazy-loaded project explorer with git status badges, find-files filter, and full file operations (new/duplicate/rename/delete/copy path)
- **Source Control view** — branch & ahead/behind, staged vs. changes, per-file +/− counts, commit box, recent commits
- **Document tabs** — Markdown (GFM + syntax highlight), sandboxed HTML, images, and read-only text open next to your terminals; clicking paths in terminal output opens them inline

### Remote Access
- **Remote PWA / Android app** — monitor and nudge sessions over a Cloudflare Tunnel, protected by GitHub login + owner approval; browser Web Push and configured native APK builds can report completion or required answers in the background (standard builds only)
- **SSH remote sessions** — run agents on another machine over SSH; Windows remotes get full status dots and resume via a reverse hook tunnel

### Monitoring & Usage
- **Local dashboard** (`127.0.0.1:4421`) — live sessions, hook state, project docs, and token usage on one web page
- **Usage tracking** — transcript JSONL parsed into SQLite; per-project/session token stats with charts
- **Account rate limits** — Codex (transcript) and Claude (OAuth usage endpoint) limits in the status bar, with warning colors at 70%/90%
- **Resource manager & Ports monitor** — per-session CPU/memory process tree, and open TCP ports attributed to projects

### Productivity
- **Quick Open** (`Ctrl+K`) — projects, sessions, Screens, docs, and commands in one search
- **Attention Center** — unread waiting/blocked/completed items that jump to the session
- Customizable keyboard shortcuts, four themes (Soft / GitHub / Warm / Light), multi-window, always-on-top
- **Auto-updates** from signed GitHub Releases

## Supported Agents

| Agent | Status hooks | Session resume | Chat view |
|---|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ (`--resume`) | ✅ |
| Codex | ✅ | ✅ (`resume`) | ✅ |
| Qwen | ✅ | — | — (terminal-only) |
| Cline | — | — | — (terminal-only) |
| Shell only | — | — | — |

Any CLI works in **Shell only** mode — you get the terminal without hooks, resume, or chat.

## Requirements

**Runtime:** Windows 10/11 (WebView2 runtime — included with Windows 11), plus the agent CLIs you plan to use (`claude`, `codex`, … on PATH)

**Development:**

| Tool | Version |
|---|---|
| Node.js | 24+ |
| Rust | 1.95+ stable |
| Visual Studio 2022 Build Tools | "Desktop development with C++" workload |
| PowerShell | 7+ recommended (falls back to 5.1) |

## Quick Start

```bash
cd app
npm install

npm run tauri dev       # Tauri shell (dev, HMR on port 4420)
npm run electron:dev    # Electron shell (dev, HMR on port 4420)
```

### Build & Test

```bash
npm test                       # vitest unit/integration tests

npm run tauri build            # Tauri release (standard)
npm run tauri:build:all        # Tauri standard + company
npm run electron:dist          # Electron installer (standard)
npm run electron:dist:all      # Electron standard + company
```

Tauri artifacts land in `app/src-tauri/target/release/bundle/` (the NSIS `*-setup.exe` is the recommended installer); Electron artifacts land in `app/electron-dist/`.
Standard Electron packaging requires an external release-signed Android APK plus its
allowed certificate SHA-256 in `MULTIAGENT_MOBILE_APK_PATH` and
`MULTIAGENT_ANDROID_CERT_SHA256`; it fails before packaging rather than bundling a
source-tree or debug APK. Company packaging remains APK-free.

## Build Variants

| Variant | Identifier | Remote PWA / Tunnel |
|---|---|---|
| **standard** | `com.jintae.multiagent` | ✅ included |
| **company** | `com.jintae.multiagent.company` | ❌ removed (UI and backend) |

Both variants share the same code and version; only the identifier, updater channel, and remote features differ. Signed-release and update-manifest procedures are documented in [docs/release-playbook.md](docs/release-playbook.md).

## Project Structure

```text
├─ app/                    # Desktop app
│  ├─ src/                 # React 19 + TypeScript renderer
│  ├─ src-tauri/           # Legacy Tauri updater-transition assets
│  ├─ electron/            # Production main process + services (node-pty)
│  └─ scripts/             # Build / release scripts
├─ docs/                   # OKF v0.2 project knowledge
├─ SETUP.md                # Setup guide
└─ LICENSE                 # MIT
```

## Documentation

The canonical OKF v0.2 knowledge index is [`docs/index.md`](docs/index.md):

- [product-overview.md](docs/product-overview.md) — product goals, runtime shape, capabilities, and variants
- [system-architecture.md](docs/system-architecture.md) — Electron boundaries, workspace model, layout, and IPC
- [workspace-interactions.md](docs/workspace-interactions.md) — durable workspace interaction rules
- [remote-service.md](docs/remote-service.md) — authenticated Remote PWA and Android access
- [session-lifecycle-and-resume.md](docs/session-lifecycle-and-resume.md) — PTY lifecycle, hooks, cancellation, and provider resume
- [local-dashboard.md](docs/local-dashboard.md) / [usage-accounting.md](docs/usage-accounting.md) — local Dashboard and usage accounting
- [development-and-build.md](docs/development-and-build.md) / [release-playbook.md](docs/release-playbook.md) — development, packaging, signing, and publication
- [electron-migration-decision.md](docs/electron-migration-decision.md) — production-runtime decision record
- [known-limitations.md](docs/known-limitations.md) — confirmed constraints and review triggers

## License

[MIT](LICENSE)
