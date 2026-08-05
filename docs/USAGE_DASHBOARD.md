# Usage Accounting & Account Rate Limits

A feature that aggregates per-session/per-project token usage into `usage.db`. The usage screen is currently served inside the single Dashboard server (`/api/usage/*`) from [MONITOR.md](MONITOR.md), not a separate Usage server. The aggregation implementations are `app/src-tauri/src/usage.rs` (Tauri) and `app/electron/services/usage-service.mjs` (Electron).

Separately from token totals, the Electron app shows per-period limits of Codex/Claude accounts on the bottom status bar. Token usage is cumulative per-session/project statistics; account limits are the latest usage-rate snapshots reported by the account. Codex limits come from session transcripts; Claude limits come from the OAuth usage endpoint.

The authenticated Remote PWA and loopback Dashboard expose cumulative token totals and normalized account-limit snapshots through the shared **Usage** tab. The token section shows total, input, output, cache read/write, reasoning tokens, and ingested event count. The account section converts stored `usedPercent` into an emphasized remaining percentage (`100 - usedPercent`) and shows each rolling window's reset time. `GET /api/usage?refresh=1` requests a live limit refresh, with server-side throttling at one refresh per 30 seconds; no OAuth token or transcript path is sent to the browser.

## Data Sources

CLI transcript JSONL is parsed for token figures (the app only launches CLIs via PTY and never sees API responses).

| tool | path | fields read |
|---|---|---|
| Claude | `~/.claude/projects/**/*.jsonl` | `input_tokens`·`output_tokens`·`cache_creation_input_tokens`·`cache_read_input_tokens` in `message.usage`, `message.model`, `timestamp`, `cwd` |
| Codex | `~/.codex/sessions/**/*.jsonl` | `payload.info.last_token_usage` of `payload.type=="token_count"` (input/output/cached_input/reasoning_output/total), `payload.model`·`payload.id` of `session_meta`/`turn_context` |

## Electron Account Rate-Limit Status Bar

Codex transcripts' `token_count.rate_limits` can include per-limit-ID usage rates, periods, reset times, and plan info. Claude transcripts lack this, so instead the `five_hour`·`seven_day`·`limits[]` from the OAuth usage endpoint response are read. When the Electron backend observes this metadata, it stores the latest snapshot in `usage_rate_limits` (common Codex/Claude schema).

- The bottom of the app shows the default limit and (Claude) per-model limits as independent items. However, Codex keeps only the representative limit (`limit_id="codex"`); per-model weekly limits of the form `codex_<model>` are neither stored nor shown (e.g., GPT-5.3-Codex-Spark)
- Each item provides usage rate, a progress bar, and time remaining until reset
- Clicking an item shows all limit windows, last refresh time, plan, and extra-usage availability
- 70%+ usage is warning color, 90%+ is danger color
- Auto-refreshes after a hook `done` event; the status bar refresh button re-checks manually
- First lookup and manual refresh only scan the last 1MiB of the newest transcript, avoiding repeated full reads of large sessions

Claude transcripts' `message.usage` works for token totals but does not include per-period account limit snapshots like Codex's `token_count.rate_limits`. So Claude limits are filled by **querying the usage endpoint directly with Claude Code's OAuth credentials**, not from transcripts.

- Calls `GET https://api.anthropic.com/api/oauth/usage` with `claudeAiOauth.accessToken` from `~/.claude/.credentials.json` (`anthropic-beta: oauth-2025-04-20`). If the token is expired or the file is missing, it silently skips and keeps the last snapshot.
- The response's `five_hour` (5-hour) and `seven_day` (weekly) are stored as one `limit_id="claude"` row's primary/secondary window, and model-scoped limits in `limits[]` (e.g., `weekly_scoped` / Fable·Opus) are stored as separate `claude:<kind>:<model>` rows. Same `usage_rate_limits` schema and status bar UI as Codex.
- Refreshes with a minimum 60s throttle: automatically after a Claude session's hook `done`, and forcibly on status bar refresh and app start.

SSH remote sessions are excluded from local-credential/transcript-based account limit lookups.

**Dedup (source_key)** — a deterministic key so re-reading the same record never grows totals:
- Claude: `claude:<session_id>:<requestId|message.id|uuid>`
- Codex: `codex:<session_id>:<timestamp>:<cumulative total_tokens>`
## Collection Flow

Extends the hook flow for automatic ingestion.

1. `notify.ps1` reads `session_id`·`transcript_path`·`cwd` from every hook's stdin and forwards them to `/event`
2. `session-start` → `usage.note_session(agent_id, session_id)` (track active sessions)
3. `done` → `usage.ingest_agent(agent_id, transcript_path)` → parse on a background thread
4. `ingest_file`: incrementally parses only after the **last offset** recorded in `usage_sources` (resets offset to 0 on file truncate/ownership mismatch)
5. Idempotent load via `INSERT ... ON CONFLICT(source_key)`

Manual reindex: the dashboard **Reindex** button or `usage_ingest_now` → `ingest_known_now()` scans all claude/codex sessions in the catalog.

## Storage (SQLite)

`<app_local_data_dir>/usage.db` (`%LOCALAPPDATA%\com.jintae.multiagent\usage.db`).

**usage_events** — ingested token events:
`id, source_key(UNIQUE), ts, project_id, project_name, agent_id, agent_name, session_id, tool, model, cwd, source_path, source_offset, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_output_tokens, total_tokens, raw_kind`
(indexes: ts / (project_id,ts) / (agent_id,ts) / (session_id,ts))

**usage_sources** — per-file incremental progress:
`source_path(PK), tool, session_id, last_offset, last_size, updated_at`

**usage_rate_limits** — latest snapshots of account limits observed by Electron:
`limit_id(PK), tool, used_percent, window_minutes, resets_at, updated_at, raw_json`

> Loaded statistics remain in usage.db even if source transcripts are deleted/rotated.

## Dashboard Integration

The Dashboard server uses default port `127.0.0.1:4421` and is managed in Settings → **Dashboard** tab. Usage data is shown on the same server's `Usage` screen and `/api/usage/*` API.

### API

| path | query | returns |
|---|---|---|
| `GET /api/usage/summary` | `range`, `projectId?` | totals cards (input/output/cache/reasoning/total/events) |
| `GET /api/usage/projects` | `range` | per-project totals + session counts (includes zero-usage projects) |
| `GET /api/usage/sessions` | `range`, `projectId?` | per-session totals (tool/model included) |
| `GET /api/usage/timeseries` | `range`, `bucket=hour\|day`, `projectId?` | trend per time bucket |
| `GET /api/usage/recent` | `range`, `limit`, `projectId?` | recent events |
| `POST /api/usage/reindex` | — | immediate reindex `{files, events, errors}` |

`range`: `today` / `week` / `month` / `all`.

### Screens

The Dashboard's `Usage` screen provides range buttons (today/7 days/30 days/all), Reindex, summary cards, and project/session/recent events/timeline tables.

## Catalog Sync

`sync_usage_catalog` (frontend → Rust) keeps project (`id/name/folder`) and agent (`id/projectId/name/folder/aiToolId/lastSessionId`) metadata in `UsageHub.catalog`. The name/project at ingest time are also stored on `usage_events`, so renaming a project later preserves the names in past statistics.

## Related Tauri Commands

`sync_usage_catalog` / `usage_ingest_now` / `resolve_cli_session` / `relink_cli_session`.

`start_usage_server` / `stop_usage_server` / `usage_server_status` / `usage_config_get` / `usage_config_set` remain as legacy commands for the previous standalone Usage server, but the current UI uses the single Dashboard server.

(`resolve_cli_session`·`relink_cli_session` share the transcript location search logic with the session resume relink feature. See [RESUME.md](RESUME.md).)
