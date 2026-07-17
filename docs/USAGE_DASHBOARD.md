# 사용량 집계와 계정 한도

세션·프로젝트별 토큰 사용량을 집계해 `usage.db`에 저장하는 기능. 현재 사용량 화면은 별도 Usage 서버가 아니라 [MONITOR.md](MONITOR.md)의 단일 Dashboard 서버(`/api/usage/*`) 안에서 제공한다. 집계 구현 파일은 Tauri의 `app/src-tauri/src/usage.rs`와 Electron의 `app/electron/services/usage-service.mjs`다.

Electron 앱은 토큰 합계와 별개로 Codex 계정의 기간별 한도를 하단 상태 바에 표시한다. 토큰 사용량은 세션·프로젝트별 누적 통계이고, 계정 한도는 현재 계정에서 보고된 최신 사용률 스냅샷이다.

## 데이터 소스

CLI transcript JSONL을 파싱해 토큰 수치를 읽는다 (앱은 PTY로 CLI를 띄울 뿐 API 응답을 못 봄).

| 도구 | 경로 | 읽는 필드 |
|---|---|---|
| Claude | `~/.claude/projects/**/*.jsonl` | `message.usage`의 `input_tokens`·`output_tokens`·`cache_creation_input_tokens`·`cache_read_input_tokens`, `message.model`, `timestamp`, `cwd` |
| Codex | `~/.codex/sessions/**/*.jsonl` | `payload.type=="token_count"`의 `payload.info.last_token_usage`(input/output/cached_input/reasoning_output/total), `session_meta`/`turn_context`의 `payload.model`·`payload.id` |

## Electron 계정 한도 상태 바

Codex transcript의 `token_count.rate_limits`에는 한도 ID별 사용률, 기간, 초기화 시각, 플랜 정보가 포함될 수 있다. Electron 백엔드는 이 메타데이터가 관측되면 `usage_rate_limits`에 최신 스냅샷을 저장한다.

- 앱 하단에는 기본 한도와 모델별 한도를 독립된 항목으로 표시한다
- 각 항목은 사용률, 진행 막대, 초기화까지 남은 시간을 제공한다
- 항목을 누르면 전체 한도 윈도우, 마지막 갱신 시각, 플랜과 추가 사용량 여부를 확인할 수 있다
- 사용률 70% 이상은 경고색, 90% 이상은 위험색으로 표시한다
- Hook `done` 이벤트 뒤 자동으로 갱신하며 사용자가 상태 바의 새로고침 버튼으로 다시 확인할 수 있다
- 최초 조회와 수동 새로고침은 최근 transcript의 마지막 1MiB만 확인해 대형 세션 전체를 반복해서 읽지 않는다

Claude transcript의 `message.usage`는 토큰 합계에는 사용할 수 있지만 계정의 기간별 한도 스냅샷은 포함하지 않는다. 따라서 Claude 토큰은 기존 대시보드에 집계되지만 현재 Electron 하단 계정 한도에는 표시되지 않는다. SSH 원격 세션도 로컬 transcript 기반 계정 한도 조회 대상에 포함하지 않는다.

**중복 방지(source_key)** — 같은 record를 다시 읽어도 합계가 안 늘게 deterministic key 사용:
- Claude: `claude:<session_id>:<requestId|message.id|uuid>`
- Codex: `codex:<session_id>:<timestamp>:<누적 total_tokens>`

## 수집 흐름

hook 흐름을 확장해서 자동 적재한다.

1. `notify.ps1`이 모든 hook의 stdin에서 `session_id`·`transcript_path`·`cwd`를 읽어 `/event`로 전달
2. `session-start` → `usage.note_session(agent_id, session_id)` (활성 세션 추적)
3. `done` → `usage.ingest_agent(agent_id, transcript_path)` → 백그라운드 스레드로 파싱
4. `ingest_file`: `usage_sources`에 기록된 **마지막 offset 이후만** 증분 파싱 (파일 truncate/소유 불일치 시 offset 0으로 리셋)
5. `INSERT ... ON CONFLICT(source_key)`로 멱등 적재

수동 재색인: 대시보드 **Reindex** 버튼 또는 `usage_ingest_now` → `ingest_known_now()`가 카탈로그의 모든 claude/codex 세션을 스캔.

## 저장 (SQLite)

`<app_local_data_dir>/usage.db` (`%LOCALAPPDATA%\com.jintae.multiagent\usage.db`).

**usage_events** — 적재된 토큰 이벤트:
`id, source_key(UNIQUE), ts, project_id, project_name, agent_id, agent_name, session_id, tool, model, cwd, source_path, source_offset, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_output_tokens, total_tokens, raw_kind`
(인덱스: ts / (project_id,ts) / (agent_id,ts) / (session_id,ts))

**usage_sources** — 파일별 증분 진행 상태:
`source_path(PK), tool, session_id, last_offset, last_size, updated_at`

**usage_rate_limits** — Electron에서 관측한 계정 한도의 최신 스냅샷:
`limit_id(PK), tool, used_percent, window_minutes, resets_at, updated_at, raw_json`

> 원본 transcript가 삭제·로테이션돼도 적재된 통계는 usage.db에 남는다.

## Dashboard 연동

Dashboard 서버는 `127.0.0.1:4421` 기본 포트를 사용하며, 설정 → **Dashboard** 탭에서 관리한다. Usage 데이터는 같은 서버의 `Usage` 화면과 `/api/usage/*` API로 표시된다.

### API

| 경로 | 쿼리 | 반환 |
|---|---|---|
| `GET /api/usage/summary` | `range`, `projectId?` | 합계 카드(input/output/cache/reasoning/total/events) |
| `GET /api/usage/projects` | `range` | 프로젝트별 합계 + 세션 수 (사용량 0인 프로젝트도 포함) |
| `GET /api/usage/sessions` | `range`, `projectId?` | 세션별 합계 (tool/model 포함) |
| `GET /api/usage/timeseries` | `range`, `bucket=hour\|day`, `projectId?` | 시간 버킷별 추이 |
| `GET /api/usage/recent` | `range`, `limit`, `projectId?` | 최근 이벤트 |
| `POST /api/usage/reindex` | — | 즉시 재색인 `{files, events, errors}` |

`range`: `today` / `week` / `month` / `all`.

### 화면

Dashboard의 `Usage` 화면에서 범위 버튼(오늘/7일/30일/전체), Reindex, 요약 카드, 프로젝트/세션/최근 이벤트/타임라인 테이블을 제공한다.

## 카탈로그 동기화

`sync_usage_catalog`(프론트 → Rust)가 프로젝트(`id/name/folder`)와 에이전트(`id/projectId/name/folder/aiToolId/lastSessionId`) 메타데이터를 `UsageHub.catalog`에 보관. 적재 시 당시 이름/프로젝트를 `usage_events`에도 같이 저장해, 나중에 프로젝트명을 바꿔도 과거 통계의 이름은 보존된다.

## 관련 Tauri 커맨드

`sync_usage_catalog` / `usage_ingest_now` / `resolve_cli_session` / `relink_cli_session`.

`start_usage_server` / `stop_usage_server` / `usage_server_status` / `usage_config_get` / `usage_config_set`은 이전 별도 Usage 서버용 legacy command로 남아 있지만, 현재 UI에서는 단일 Dashboard 서버를 사용한다.

(`resolve_cli_session`·`relink_cli_session`은 transcript 위치 탐색 로직을 세션 resume 재등록 기능과 공유한다. [RESUME.md](RESUME.md) 참고.)
