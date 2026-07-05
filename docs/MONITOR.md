# MultiAgent Dashboard

활성 MultiAgent 세션, split 그룹, hook 상태, 프로젝트 `docs`, Usage 사용량을 하나의 로컬 웹에서 보는 기능. 구현 파일: `app/src-tauri/src/monitor.rs`, `monitor_dashboard.html`.

## 목적

여러 Claude/Codex 세션을 동시에 켜면 현재 어떤 세션이 live인지, 어느 split이 선택됐는지, 각 프로젝트의 phase/TODO 문서가 어디 있는지 헷갈린다. 모니터는 앱 내부 상태와 파일 시스템 문서를 한 화면에 합쳐 보여준다.

## 서버

- bind `127.0.0.1:<port>`, 기본 **4421**. 충돌 시 4421~4499 fallback.
- 설정 → **Dashboard** 탭에서 단일 Dashboard 서버를 Start/Stop/Open/Copy, 자동 시작, 포트 변경 가능.
- 기본 설정은 자동 시작 ON이다. 설정 파일은 `%LOCALAPPDATA%\com.jintae.multiagent\monitor-config.json`.

## 데이터 소스

정확도를 위해 단일 소스에 의존하지 않는다.

| 목적 | 1차 소스 | 보조 소스 |
|---|---|---|
| live 여부 | Rust `AppState.ptys` + `session-locks` 파일 lock | 프론트 agent status |
| 작업 상태 | hook last event (`working`/`done`/`session-start`) | 프론트 agent status |
| 토큰 사용량 | UsageHub SQLite 집계 | transcript reindex |
| 앱 배치 | React에서 sync하는 `projects`/`agents`/`groups`/`view` | localStorage 원본 |
| 세션 ID | hook `session_id` | agent `lastSessionId` |
| 문서 | 프로젝트 folder 하위 `docs`/`Docs`/`DOCS` | 파일명 score |

중요: hook 이벤트가 없더라도 PTY나 lock이 살아 있으면 live 세션이다. 이 경우 화면에는 `hook missing`으로 표시한다.

## API

| 경로 | 반환 |
|---|---|
| `GET /` | Dashboard HTML (`Monitor`/`Usage` 화면 포함) |
| `GET /api/state` | 프로젝트, 그룹, 세션, 상태, docs 후보 목록 |
| `GET /api/docs/read?path=...` | 알려진 프로젝트 docs 폴더 내부의 `.md`/`.html` 내용 |
| `POST /api/hooks/reconnect?agentId=...` | 해당 local Claude/Codex 프로젝트의 hook 설정 재작성 |
| `GET /api/usage/*` | 같은 서버에서 Usage 요약/프로젝트/세션/최근 이벤트/타임라인 제공 |
| `POST /api/usage/reindex` | transcript 즉시 재색인 |

`/api/docs/read`는 sync된 프로젝트의 `docs` 폴더 내부 파일만 읽는다. 최대 3MB까지 미리보기한다.

## 상태 모델

| 상태 | 의미 |
|---|---|
| `working` | live이고 hook 또는 프론트 status가 작업중 |
| `live` | live이고 hook은 있으나 작업중/완료로 특정되지 않음 |
| `live-done` | live이고 마지막 hook이 `done` |
| `hook-missing` | live지만 hook 이벤트가 아직 없음 |
| `stale` | live는 아니지만 최근 hook이 남아 있음 |
| `idle`/`running`/`exited` | 프론트 status fallback |

## Hook 재연결

`hook missing` 세션에는 **Reconnect hooks** 버튼이 표시된다. 이 버튼은 해당 agent의 `folder`에 있는 Claude/Codex hook 설정을 현재 MultiAgent 인스턴스의 `notify.ps1`, hook port/token으로 다시 쓴다.

주의: 이미 실행 중인 CLI가 hook 설정을 언제 다시 읽는지는 도구 구현에 따라 다를 수 있다. 재연결은 미래 hook 이벤트 또는 다음 세션 시작에 확실히 반영되고, 실행 중 세션은 다음 prompt/stop 이벤트에서 반영될 수 있다.

## Usage 결합

Dashboard는 `UsageHub`의 `usage.db` 세션 집계를 함께 읽어서 세션 카드, 상세 영역, `Usage` 화면에 총 토큰, 최신 model, 프로젝트/세션별 사용량을 표시한다. Usage 데이터가 없거나 DB가 아직 초기화되지 않았으면 해당 배지는 생략된다.

## Docs 스캔 규칙

각 agent folder에서 `docs`, `Docs`, `DOCS`를 재귀 스캔하고 `.md`, `.markdown`, `.html`, `.htm`만 표시한다. 우선순위는 다음과 같다.

- agent 이름 포함: 예 `ToonShader`, `Weather`
- `CURRENT`, `PLAN`, `TODO`, `PHASE`, `Roadmap`
- `README.md`
- `overview`, `architecture`

이 규칙 덕분에 현재처럼 프로젝트마다 문서 구조가 달라도 우선은 잘 맞는 파일을 위로 올릴 수 있다.

## Claude/Codex 공통 운용 규칙

새 프로젝트나 장기 작업은 가능하면 다음 중 하나를 둔다.

- `docs/CURRENT.md`: 지금 하는 작업, 다음 액션, blocker
- `docs/PLAN.md`: phase별 계획
- `docs/TODO.md` 또는 `docs/TODO_<AgentName>.md`: agent별 할 일

Claude와 Codex 모두 작업 시작/완료/phase 변경 시 같은 파일을 갱신하면 모니터가 자동으로 우선 노출한다.
