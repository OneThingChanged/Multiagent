# MultiAgent Dashboard

A feature that shows active MultiAgent sessions, split groups, hook status, project `docs`, and Usage data on a single local web page. Implementation files: `app/src-tauri/src/monitor.rs`, `monitor_dashboard.html`.

## Purpose

With many Claude/Codex sessions running at once, it gets hard to tell which sessions are live, which split is selected, and where each project's phase/TODO docs live. The monitor combines in-app state and filesystem docs on one screen.

## Server

- Binds to `127.0.0.1:<port>`, default **4421**. Falls back within 4421–4499 on conflict.
- In Settings → **Dashboard** tab you can Start/Stop/Open/Copy the single Dashboard server, enable auto-start, and change the port.
- Auto-start is ON by default. Config file: `%LOCALAPPDATA%\com.jintae.multiagent\monitor-config.json`.

## Data Sources

For accuracy, it does not rely on a single source.

| purpose | primary source | secondary source |
|---|---|---|
| liveness | Rust `AppState.ptys` + `session-locks` file lock | frontend agent status |
| work state | hook last event (`working`/`done`/`session-start`) | frontend agent status |
| token usage | UsageHub SQLite aggregation | transcript reindex |
| app layout | `projects`/`agents`/`groups`/`view` synced from React | localStorage originals |
| session ID | hook `session_id` | agent `lastSessionId` |
| docs | `docs`/`Docs`/`DOCS` under the project folder | filename score |

Important: even without hook events, a session is live if its PTY or lock is alive. This is shown as `hook missing` on screen.

## API

| path | returns |
|---|---|
| `GET /` | Dashboard HTML (includes `Monitor`/`Usage` screens) |
| `GET /api/state` | projects, groups, sessions, status, docs candidate list |
| `GET /api/docs/read?path=...` | contents of `.md`/`.html` inside a known project docs folder |
| `POST /api/hooks/reconnect?agentId=...` | rewrites hook config for that local Claude/Codex project |
| `GET /api/usage/*` | Usage summary/projects/sessions/recent events/timeline on the same server |
| `POST /api/usage/reindex` | immediate transcript reindex |

`/api/docs/read` only reads files inside the `docs` folder of synced projects. It previews up to 3MB.

## State Model

| state | meaning |
|---|---|
| `working` | live, and hook or frontend status says working |
| `live` | live, hook exists but not specifically working/done |
| `live-done` | live, and last hook was `done` |
| `hook-missing` | live but no hook events yet |
| `stale` | not live, but a recent hook remains |
| `idle`/`running`/`exited` | frontend status fallback |

## Hook Reconnect

`hook missing` sessions show a **Reconnect hooks** button. It rewrites the Claude/Codex hook config in that agent's `folder` with the current MultiAgent instance's `notify.ps1`, hook port/token.

Settings → **General → Agent Hooks → Hook check & repair** (Hook 점검 및 복구) compares the entire synced session list against the actual active sessions in `AppState.ptys`. For active local Claude/Codex sessions it verifies helper files and hook config, and re-merges only missing/damaged items. If the local hook HTTP server does not respond, it relaunches the server with a new port/token and updates `hook-info.json`. An already-running local helper retries once with the latest `hook-info.json` when its existing env connection fails, so you can recover without force-killing the app or sessions.

An active SSH session's reverse tunnel is fixed to the local hook port at launch time. In that case the repair result shows **session restart required** (세션 다시 열기 필요) and you must restart that remote session.

Note: when an already-running CLI re-reads its hook config depends on the tool's implementation. A reconnect reliably applies to future hook events or the next session start; a running session may pick it up on the next prompt/stop event.

## Usage Integration

The Dashboard also reads the `UsageHub` `usage.db` session aggregates and shows total tokens, latest model, and per-project/session usage on session cards, detail areas, and the `Usage` screen. If there is no Usage data or the DB is not initialized yet, those badges are omitted.

## Docs Scan Rules

Under each agent folder, `docs`, `Docs`, and `DOCS` are scanned recursively and only `.md`, `.markdown`, `.html`, `.htm` are shown. Priority order:

- contains agent name: e.g. `ToonShader`, `Weather`
- `CURRENT`, `PLAN`, `TODO`, `PHASE`, `Roadmap`
- `README.md`
- `overview`, `architecture`

Thanks to these rules, the best-matching files rise to the top even when each project has a different docs structure.

## Common Claude/Codex Operating Rules

For new projects or long-running work, keep one of the following if possible:

- `docs/CURRENT.md`: current work, next actions, blockers
- `docs/PLAN.md`: per-phase plan
- `docs/TODO.md` or `docs/TODO_<AgentName>.md`: per-agent todos

When both Claude and Codex update the same file on work start/completion/phase change, the monitor automatically surfaces it first.
