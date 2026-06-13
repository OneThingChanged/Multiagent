# 토큰 사용량 대시보드 설계

세션·프로젝트별 토큰 사용량을 측정·기록하고, 별도 웹 대시보드로 시각화하는 기능. 현재 문서는 구현 전 설계이며, 2026-06-13 로컬 파일 구조를 기준으로 데이터 소스를 1차 검증했다.

## 목표

- 각 AI 세션이 소비한 토큰(input / output / cache / reasoning)을 세션·프로젝트별로 집계
- 오늘 / 최근 7일 / 최근 30일 / 전체 작업량을 대시보드에서 확인
- 기존 터미널 원격 제어 서버(`remote.rs`)와 분리된 사용량 전용 서버 제공
- 원본 transcript가 삭제되거나 로테이션되어도 SQLite 적재분으로 과거 통계를 보존

## 포트

전역 포트 규칙상 서버 API는 3000번대를 사용한다.

| 용도 | 포트 | 비고 |
|---|---:|---|
| CodeCompany / MultiAgent 기본 서버 | 3003 | 기존 할당 |
| Usage Dashboard | 3141 | 새 기본값. 설정에서 변경 가능하게 설계 |

초안의 `18900`은 사용하지 않는다.

## 검증된 데이터 소스

토큰 수치는 CLI transcript JSONL에서 읽는다. 앱은 Claude/Codex CLI를 PTY로 띄울 뿐 API 응답을 직접 보지 않으므로, API 직접 집계는 불가하다.

| 도구 | 원본 | 검증 결과 |
|---|---|---|
| Claude Code | `%USERPROFILE%\.claude\projects\<encoded-project>\<session>.jsonl` | assistant message의 `message.usage`에 `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` 존재 |
| Codex | `%USERPROFILE%\.codex\sessions\YYYY\MM\DD\rollout-...<session_id>.jsonl` | `event_msg` 중 `payload.type = "token_count"`에 `last_token_usage`와 `total_token_usage` 존재 |

### Claude record

집계 대상은 `message.usage`가 있는 assistant record다.

필드:

- `sessionId`
- `cwd`
- `timestamp`
- `message.model`
- `message.usage.input_tokens`
- `message.usage.output_tokens`
- `message.usage.cache_creation_input_tokens`
- `message.usage.cache_read_input_tokens`

주의: 하나의 응답이 여러 JSONL record로 반복 저장될 수 있으므로, 단순히 모든 `message.usage`를 더하면 중복 집계 위험이 있다. `requestId`가 있으면 `requestId` 기준으로 dedupe하고, 없으면 `message.id` 또는 record `uuid`를 fallback key로 쓴다.

### Codex record

집계 대상은 아래 조건을 만족하는 event record다.

```text
type == "event_msg"
payload.type == "token_count"
payload.info.last_token_usage exists
```

필드:

- session metadata: 첫 `session_meta.payload.id`, `payload.cwd`, `payload.model_provider`, `payload.cli_version`
- token event timestamp: top-level `timestamp`
- `payload.info.last_token_usage.input_tokens`
- `payload.info.last_token_usage.cached_input_tokens`
- `payload.info.last_token_usage.output_tokens`
- `payload.info.last_token_usage.reasoning_output_tokens`
- `payload.info.last_token_usage.total_tokens`
- `payload.info.total_token_usage.*`는 검증/복구용 누적값

Codex는 `last_token_usage`를 델타로 저장하고, 여러 `token_count`의 합이 `total_token_usage` 누적값과 맞는다. 따라서 저장 이벤트는 `last_token_usage` 기준으로 만든다.

## 수집 방식

기존 hook 흐름을 확장한다.

현재:

```text
UserPromptSubmit / Stop / SessionStart
  -> notify.ps1
  -> POST 127.0.0.1:<random>/event
  -> Rust tiny_http hook server
  -> Tauri event agent:hook-event
```

변경:

1. `notify.ps1`이 모든 hook 이벤트에서 stdin JSON을 읽는다.
2. 가능한 필드를 HTTP body에 같이 보낸다.
   - `session_id`
   - `transcript_path`
   - `cwd`
3. Rust hook server는 기존 `agent:hook-event` emit은 유지한다.
4. `event == "done"`이면 usage ingestion을 백그라운드로 요청한다.
5. ingestion은 agent metadata와 session id로 transcript path를 resolve하고, 마지막 처리 offset 이후 record만 파싱한다.

Hook 요청 처리 thread에서 큰 transcript를 직접 파싱하지 않는다. 요청은 빠르게 200 응답하고, 파싱은 별도 thread/task에서 수행한다.

## Agent metadata 동기화

Rust 백엔드는 프로젝트명·세션명·폴더를 알아야 프로젝트별 통계를 만들 수 있다. 현재 `remote.rs` 동기화에는 folder와 `lastSessionId`가 빠져 있으므로, usage 전용 catalog sync를 추가한다.

Tauri command:

```ts
invoke("sync_usage_catalog", {
  projects: projects.map(p => ({
    id: p.id,
    name: p.name,
    folder: p.folder,
  })),
  agents: agents.map(a => ({
    id: a.id,
    projectId: a.projectId,
    name: a.name,
    folder: a.folder,
    aiToolId: a.aiToolId,
    lastSessionId: a.lastSessionId ?? null,
  })),
});
```

Rust `UsageHub`는 이 catalog를 메모리에 보관하고, ingestion 시점의 이름/프로젝트 정보를 `usage_events`에도 같이 저장한다. 나중에 프로젝트명을 바꿔도 과거 이벤트의 당시 이름은 보존된다.

## Transcript path resolve

우선순위:

1. hook stdin의 `transcript_path`
2. agent catalog의 `lastSessionId`
3. session-start hook에서 받은 `agent_id -> session_id` map
4. 도구별 기본 위치 스캔

도구별 fallback:

- Claude: `%USERPROFILE%\.claude\projects\**\<session_id>.jsonl`
- Codex: `%USERPROFILE%\.codex\sessions\**\*<session_id>*.jsonl`

경로는 canonicalize 후 허용 root 안인지 검사한다.

허용 root:

- `%USERPROFILE%\.claude\projects`
- `%USERPROFILE%\.codex\sessions`

## SQLite 저장

앱 로컬 데이터 폴더:

```text
%LOCALAPPDATA%\com.jintae.multiagent\usage.db
```

Rust dependency:

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
```

### schema

```sql
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  ts INTEGER NOT NULL,
  project_id TEXT,
  project_name TEXT,
  agent_id TEXT,
  agent_name TEXT,
  session_id TEXT,
  tool TEXT NOT NULL,
  model TEXT,
  cwd TEXT,
  source_path TEXT,
  source_offset INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  raw_kind TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_sources (
  source_path TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  session_id TEXT,
  last_offset INTEGER NOT NULL DEFAULT 0,
  last_size INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(ts);
CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_usage_events_agent ON usage_events(agent_id, ts);
CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id, ts);
```

### source_key

중복 집계를 막기 위해 모든 이벤트는 deterministic key를 가진다.

Claude:

```text
claude:<session_id>:<requestId || message.id || uuid>
```

Codex:

```text
codex:<session_id>:<timestamp>:<total_token_usage.total_tokens || source_offset>
```

`INSERT OR IGNORE`를 사용해 같은 record를 다시 읽어도 합계가 늘지 않게 한다.

## Rust 모듈 설계

새 파일:

```text
app/src-tauri/src/usage.rs
app/src-tauri/src/usage_dashboard.html
```

`AppState` 추가:

```rust
usage: Arc<usage::UsageHub>,
```

주요 타입:

```rust
pub struct UsageHub {
    catalog: Mutex<UsageCatalog>,
    sessions: Mutex<HashMap<String, String>>, // agent_id -> session_id
    server: Mutex<Option<UsageServerInfo>>,
    handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    config: Mutex<UsageConfig>,
    config_path: Mutex<Option<PathBuf>>,
    db_path: Mutex<Option<PathBuf>>,
}
```

Tauri commands:

| 커맨드 | 역할 |
|---|---|
| `sync_usage_catalog` | 프론트의 project/agent metadata를 Rust usage hub에 반영 |
| `usage_server_status` | 대시보드 서버 상태 반환 |
| `start_usage_server` | 127.0.0.1:3141 또는 설정 포트에서 서버 시작 |
| `stop_usage_server` | 서버 중지 |
| `usage_config_get` | `{ enabled, server_port }` 반환 |
| `usage_config_set` | 포트/자동 시작 설정 저장 |
| `usage_ingest_now` | 현재 catalog의 알려진 세션을 즉시 스캔, 수동 복구용 |

Hook server 내부 호출:

| 함수 | 역할 |
|---|---|
| `usage.note_session(agent_id, session_id)` | SessionStart에서 agent-session map 갱신 |
| `usage.ingest_agent(agent_id, optional_transcript_path)` | Stop에서 해당 agent usage 파싱 요청 |

## 대시보드 서버

첫 버전은 로컬 전용이다.

- bind: `127.0.0.1:<port>`
- default port: `3141`
- 인증: 없음. localhost 전용이므로 외부 노출하지 않는다.
- 외부 공개가 필요해지면 `remote.rs`의 GitHub OAuth 승인 로직을 공통 auth 모듈로 분리해 재사용한다.

Routes:

| Route | 설명 |
|---|---|
| `GET /` | 정적 dashboard HTML |
| `GET /api/summary?range=today|week|month|all` | 총합 카드 |
| `GET /api/timeseries?range=today|week|month|all&bucket=hour|day` | 시간대별 추이 |
| `GET /api/projects?range=...` | 프로젝트별 집계 |
| `GET /api/sessions?range=...&projectId=...` | 세션별 집계 |
| `GET /api/recent?limit=100` | 최근 usage event |

API 응답은 transcript 본문을 절대 포함하지 않는다. 프로젝트명, 세션명, 경로, 토큰 숫자만 보낸다.

## 프론트 UX

### 앱 설정

`SettingsModal.tsx`에 `Usage` 탭을 추가한다.

Controls:

- Status: `off` / `running (port 3141)`
- URL 표시 + Copy
- Start / Stop
- Port input
- Auto start checkbox
- Reindex 버튼: `usage_ingest_now`

기존 `Remote` 탭은 원격 터미널 조작용으로 유지하고, Usage는 별도 탭으로 분리한다.

### 웹 대시보드

정적 HTML + Chart.js CDN으로 시작한다. Vite/React 번들을 따로 만들지 않는다.

화면 구성:

- 상단: range segmented control (`Today`, `7 days`, `30 days`, `All`)
- Summary: input / output / cache read / cache write / reasoning / total
- Line chart: 시간대별 total tokens
- Bar chart: 프로젝트별 total tokens
- Table: 세션별 사용량, 도구, 모델, 마지막 사용 시각
- Recent events: 최근 기록 100개

비용 추정은 1차 구현에서 제외한다. 모델별 단가가 자주 바뀌므로, 나중에 사용자가 설정하는 가격표 기반으로 추가한다.

## 집계 쿼리

Range 계산은 서버에서 epoch seconds로 한다.

Summary:

```sql
SELECT
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
  COALESCE(SUM(reasoning_output_tokens), 0) AS reasoning_output_tokens,
  COALESCE(SUM(total_tokens), 0) AS total_tokens
FROM usage_events
WHERE ts >= ?;
```

Projects:

```sql
SELECT project_id, project_name, SUM(total_tokens) AS total_tokens
FROM usage_events
WHERE ts >= ?
GROUP BY project_id, project_name
ORDER BY total_tokens DESC;
```

Sessions:

```sql
SELECT
  agent_id,
  agent_name,
  session_id,
  tool,
  model,
  SUM(total_tokens) AS total_tokens,
  MAX(ts) AS last_ts
FROM usage_events
WHERE ts >= ?
GROUP BY agent_id, agent_name, session_id, tool, model
ORDER BY total_tokens DESC;
```

## 구현 순서

1. **usage 모듈 골격**
   - `usage.rs`, `UsageHub`, config load/save, DB init
   - `rusqlite` 추가
   - Tauri command 등록

2. **대시보드 서버 MVP**
   - `start_usage_server` / `stop_usage_server`
   - `usage_dashboard.html`
   - `/api/summary`, `/api/projects`, `/api/sessions`

3. **프론트 설정 연결**
   - `SettingsModal`에 `Usage` 탭 추가
   - status, start/stop, copy URL, port 설정
   - `App.tsx`에서 `sync_usage_catalog` 호출

4. **hook ingestion**
   - `notify.ps1` stdin read를 모든 event로 확장
   - `HookEvent` payload에 `transcript_path`, `cwd` optional 추가
   - `SessionStart`에서 `usage.note_session`
   - `Stop`에서 `usage.ingest_agent`

5. **parser 구현**
   - Claude parser: `message.usage`, request dedupe
   - Codex parser: `token_count.last_token_usage`
   - `usage_sources.last_offset` 기반 incremental read
   - `INSERT OR IGNORE` 기반 중복 방지

6. **수동 reindex**
   - 현재 catalog의 `lastSessionId` 스캔
   - 기존 transcript를 한 번에 적재
   - 대시보드에서 Reindex 버튼 제공

7. **검증**
   - `npm run test`
   - `npm run tauri -- build --debug`
   - 로컬 대시보드 `http://127.0.0.1:3141`
   - Claude/Codex 각각 한 턴 실행 후 Stop hook에서 usage 증가 확인

## 리스크와 대응

| 리스크 | 대응 |
|---|---|
| Claude JSONL 중복 usage record | `requestId`/`message.id` 기반 source_key dedupe |
| Codex hook stdin에 transcript_path가 없을 수 있음 | session id 기반 `%USERPROFILE%\.codex\sessions` fallback 스캔 |
| 큰 transcript 파싱으로 hook 응답 지연 | hook thread는 ingestion task만 enqueue |
| transcript path가 외부 경로일 수 있음 | `.claude/projects`, `.codex/sessions` 아래 canonical path만 허용 |
| 앱 상태와 DB 이벤트의 프로젝트명이 달라짐 | ingestion 시점 metadata를 event row에 스냅샷 저장 |
| 비용 추정 단가 변경 | 1차 제외, 추후 사용자 설정 가격표로 추가 |
| 외부 공개 시 개인정보 노출 | 1차는 127.0.0.1 bind, 외부 공개는 remote auth 재사용 후 별도 phase |

## 1차 구현 범위

포함:

- Claude/Codex JSONL usage 집계
- SQLite 저장
- 로컬 usage dashboard 서버
- 설정창 Usage 탭
- 수동 Reindex
- Today / 7 days / 30 days / All 집계

제외:

- 비용 추정
- 외부 공개 터널
- GitHub OAuth 인증
- transcript 본문 검색/표시
- 도구별 모델 가격 자동 업데이트
