# MultiAgent Docs

A Tauri desktop app that manages multiple AI agent (Claude Code · Codex) terminals as per-project sessions, groups, tabs, and splits, with remote control from an external browser and token usage accounting.

## Document Map

### Overview & Design
- **[OVERVIEW.md](OVERVIEW.md)** — goals, tech stack, full feature catalog
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — process structure, Rust backend/React frontend models, hooks & window close, layout tree, commands, persistence

### Features
- **[UX.md](UX.md)** — complete interaction guide (sidebar, context menus, search, drop zones, shortcuts, viewers, notifications, settings tabs)
- **[RESUME.md](RESUME.md)** — session resume flow, session_id capture, relink to current session, limits
- **[MONITOR.md](MONITOR.md)** — single local Dashboard combining active sessions/splits/hooks/docs/usage
- **[REMOTE.md](REMOTE.md)** — remote access (axum server, Cloudflare Tunnel, GitHub auth, account approval, web client)
- **[USAGE_DASHBOARD.md](USAGE_DASHBOARD.md)** — token usage collection, SQLite, dashboard, and the Electron account rate-limit status bar

### Build, Release & Issues
- **[BUILD.md](BUILD.md)** — dev/debug/release builds, troubleshooting
- **[ELECTRON_MIGRATION.md](ELECTRON_MIGRATION.md)** — Electron phases 1–5 implementation, verification results, migration decision
- **[RELEASE.md](RELEASE.md)** — code signing + GitHub release publishing + auto-updater procedure/checklist
- **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — known limitations + remaining improvement candidates

## Quick Start

```bash
cd K:\AI\MultiAgent\app
npm install
npm run tauri dev        # development (dev port 4420)
```

For release builds, signing, and publishing see [RELEASE.md](RELEASE.md); for build environment requirements see [BUILD.md](BUILD.md).
