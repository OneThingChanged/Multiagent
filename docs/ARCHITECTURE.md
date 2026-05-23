# Architecture

## 프로세스 구조

```
app.exe (Tauri Rust 메인 프로세스)
├─ WebView2 (UI 렌더링, React + xterm.js)
├─ HTTP 서버 thread (127.0.0.1:RANDOM_PORT, Claude hook 수신)
├─ PTY thread × N (각 에이전트마다 reader 스레드)
│  └─ PowerShell child process
│      └─ claude / codex CLI (사용자가 선택한 AI 도구)
└─ 600ms 후 init 명령 입력용 1회성 스레드 × N
```

## 파일 레이아웃

```
K:\AI\MultiAgent\
├─ docs/                ← 본 문서들
└─ app/                 ← Tauri 프로젝트
   ├─ src/              ← 프론트엔드 (React + TS)
   │  ├─ App.tsx        ← 최상위 상태·listener·콜백
   │  ├─ types.ts       ← 공용 타입 + AI_TOOLS + LS 키
   │  ├─ lib/
   │  │  ├─ layout.ts       ← 트리 연산 (getAt/setAt/pruneAgent/…)
   │  │  ├─ persistence.ts  ← localStorage load + bootstrap
   │  │  ├─ appTheme.ts     ← 전역 테마 정의 + localStorage 저장
   │  │  ├─ appInfo.ts      ← 앱 버전, GitHub repo URL, 수동 업데이트 version helper
   │  │  └─ terminal.ts     ← createEntry / xterm 테마 / Markdown 링크 / zoom / notifyDone / computeDropZone
   │  ├─ components/
   │  │  ├─ Sidebar.tsx
   │  │  ├─ TerminalArea.tsx  ← + NodeRenderer
   │  │  ├─ PaneSlot.tsx      ← + RenderCtx 타입
   │  │  ├─ Splitter.tsx
   │  │  ├─ DocsPanel.tsx     ← Markdown 목록/트리/뷰어
   │  │  ├─ SettingsModal.tsx ← 전역 설정/테마 팝업
   │  │  ├─ NewProjectModal.tsx
   │  │  ├─ NewAgentModal.tsx   ← 새 세션 생성 모달
   │  │  ├─ RenameSessionModal.tsx
   │  │  ├─ Toast.tsx
   │  │  └─ Menus.tsx         ← ContextMenu + TabContextMenu
   │  ├─ App.css
   │  └─ main.tsx
   ├─ src-tauri/        ← Rust 백엔드
   │  ├─ src/lib.rs     ← PTY + HTTP 서버 + hook 설치
   │  ├─ Cargo.toml
   │  ├─ tauri.conf.json
   │  └─ capabilities/default.json
   └─ package.json
```

## Rust 백엔드 (`src-tauri/src/lib.rs`)

### Tauri 커맨드

| 커맨드 | 인자 | 동작 |
|---|---|---|
| `spawn_pty` | id, shell?, cwd?, init_command?, cols, rows | PTY 열고 PowerShell 실행, hook용 settings.local.json 생성/머지, env var 주입, init 명령 600ms 뒤 입력, reader thread 시작 |
| `write_pty` | id, data | 활성 PTY writer에 바이트 쓰기 |
| `resize_pty` | id, cols, rows | master.resize() (ConPTY → 자식에 SIGWINCH 상응) |
| `kill_pty` | id | child.kill() + state에서 제거 |
| `confirm_close` | (none) | 창 닫기 확인 플래그 true 세팅 + window.close() — 프론트의 graceful shutdown 완료 후 호출 |
| `list_markdown_files` | folder | 프로젝트 폴더 아래 Markdown 파일을 재귀 스캔해 `{ name, relative_path }[]` 반환. 최대 500개 |
| `read_markdown_file` | folder, relative_path | Markdown 파일을 읽어 문자열 반환. 폴더 밖 경로와 2MB 초과 파일은 거부 |
| `resolve_markdown_path` | folder, path | 터미널에서 클릭된 Markdown 경로를 검증하고 Docs 패널용 상대 경로로 정규화 |

### 상태 (`AppState`)

```rust
struct AppState {
    ptys: Mutex<HashMap<String, PtyHandle>>,
    hook_info: HookInfo,  // { port, token, helper_path }
    close_confirmed: Mutex<bool>,  // graceful close 진행 중 표시
}

struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,  // read thread / write_pty / init thread 공유
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}
```

### Hook 통신 흐름

1. 앱 시작 시 `start_hook_server` → `TcpListener::bind("127.0.0.1:0")` → 랜덤 포트 + UUID 토큰 생성
2. `write_helper_script` → `%LOCALAPPDATA%\com.jintae.multiagent\notify.ps1` 작성
3. `write_hook_info` → 같은 폴더에 `hook-info.json { port, token }` 작성 (앱 재실행 시 포트 바뀌어도 helper가 file에서 읽음)
4. `spawn_pty` 시:
   - 그 폴더의 `.claude/settings.local.json`에 `UserPromptSubmit`/`Stop`/`SessionStart` hook 머지 (JSON)
   - 그 폴더의 `.codex/config.toml`에 동일 3개 hook 머지 (TOML, `toml_edit` crate)
   - 둘 다 기존 사용자 hook 보존 + `__source: "multiagent"` 마커로 자기 hook만 교체
   - env var 주입: `MULTIAGENT_PORT` (호환용), `MULTIAGENT_TOKEN`, `MULTIAGENT_AGENT_ID`
5. Claude가 hook 실행 → `powershell -File notify.ps1 working|done`
6. 스크립트가 `hook-info.json` 읽고 `POST http://127.0.0.1:PORT/event { id, event, token }`
7. Rust HTTP 서버가 토큰 검증 → Tauri 이벤트 `agent:hook-event { id, event }` 발생
8. 프론트가 listen 중 → 상태 갱신 + 알림

### 창 닫기 인터셉트

setup 시 `window.on_window_event`로 `CloseRequested` 가로챔.
- 플래그가 false면 `api.prevent_close()` + 프론트에 `app:close-requested` 이벤트
- 프론트가 graceful shutdown (`/quit` 전송 + 2초 대기) 후 `confirm_close` 커맨드 호출
- `confirm_close`는 플래그를 true로 세팅 + `window.close()` 재호출 → 두 번째 close 이벤트는 통과

전체 흐름과 토큰 캡처는 [RESUME.md](RESUME.md) 참고.

### 기본 셸 선택 (`default_shell()`)

순서대로 존재 검사:
1. `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` ← MS Store PowerShell 7.6+
2. `%ProgramFiles%\PowerShell\7\pwsh.exe`
3. `C:\Program Files\PowerShell\7\pwsh.exe`
4. Windows PowerShell 5.1
5. `cmd.exe`

PowerShell 계열로 시작될 때는 `-NoLogo` 인자 추가.

## 프론트엔드 (`src/App.tsx`)

### 상태

```ts
projects: Project[]                // 프로젝트 메타 (id, name, folder, createdAt, lastOpenedAt?)
agents: Agent[]                    // 세션 메타 (id, projectId, name, folder, aiToolId, dangerous, status, createdAt, lastSessionId?)
groups: Group[]                    // 각 그룹 = projectId + layout 트리 + 선택적 세션 고정값
activeProjectId: string | null     // 현재 사이드바/Docs 기준 프로젝트
activeGroupId: string | null       // 현재 표시 중인 그룹
activePath: Path | null            // 그 그룹 내의 활성 leaf 경로 (number[])
docsOpen/docsWidth/docsRequest      // Docs 패널 열림, 폭, 터미널 링크 요청
appTheme: AppThemeId                // Soft/GitHub/Warm/Light 전역 테마
projects/agents/groups/view/theme/docsWidth/terminalFontSize 모두 localStorage 영구화
```

### 레이아웃 트리 (`LayoutNode`)

```ts
LeafNode  = { type: 'leaf';  id; tabs: string[]; activeIndex: number }
SplitNode = { type: 'split'; id; direction: 'h' | 'v'; children: LayoutNode[]; sizes: number[] }
```

- 각 leaf는 한 패널. tabs 배열 = 그 패널의 탭 순서, activeIndex = 현재 보이는 탭
- split은 임의 깊이로 중첩 가능 (예: 좌-(상/하)-우 같은 3분할)
- `sizes`는 자식 비율 합 = 1

### 그룹 모델 불변식

- agents 안의 모든 ID는 groups[*].layout 안에 정확히 한 번씩 등장 (어느 그룹 어느 leaf 어느 tab)
- 각 agent는 정확히 하나의 projectId를 가진다. 그룹도 projectId를 갖고, activeProjectId 기준으로 필터링된다
- 기존 `multiagent.agents.v1`만 있던 설치는 agent.folder별로 Project를 자동 생성해 마이그레이션한다
- 어떤 이유로 누락되면 load 시 solo 그룹 생성으로 복구
- 그룹 layout이 비면 그 그룹 자동 삭제
- `sessionPins?: Record<agentId, sessionId>`는 그룹에 고정된 resume 세션 ID
- `sessionLocked?: true`이면 외부 에이전트를 해당 그룹에 탭/분할/드래그로 추가하지 않음
- layout에서 제거된 에이전트의 session pin은 `updateGroup`에서 같이 정리됨

### 그룹 세션 고정

- 사이드바 우클릭 메뉴에서 `현재 세션으로 그룹 고정`을 실행하면, 해당 그룹 멤버 중 `lastSessionId`가 있는 에이전트들을 `group.sessionPins`에 저장
- spawn 시 `PaneSlot`은 `group.sessionPins[agentId]`를 먼저 보고, 없으면 `agent.lastSessionId`를 사용
- 고정된 그룹은 사이드바에 `PIN` 배지를 표시
- `groupOps.openAsTab`, `splitWith`, `performDrop`은 locked group 안으로 외부 agent가 들어오거나 locked source group에서 agent가 빠져나가는 이동을 막음
- 현재 구현은 과거 세션 목록을 따로 보관하지 않고 "현재 저장된 세션 ID"만 고정한다

### xterm 라이프사이클

- `termsRef: Map<agentId, TerminalEntry>` — 에이전트별 Terminal 인스턴스 영구 보존
- 각 entry는 `el: HTMLDivElement` 1개 보유. `term.open(el)`은 처음 한 번만
- 활성 탭이 바뀔 때 `bodyRef.replaceChildren(entry.el)`로 슬롯 교체 (이전 탭의 el은 detach)
- 비활성 탭의 xterm은 메모리에 살아있고 PTY 데이터도 계속 받아 scrollback에 쌓임. 사용자가 다시 클릭하면 reattach
- 휠 이벤트는 capture 단계 핸들러에서 가로채 `term.scrollLines()` 호출 → TUI mouse tracking 무시하고 항상 scrollback
- Ctrl+휠은 모든 터미널의 `fontSize`를 함께 변경하고 `multiagent.terminalFontSize.v1`에 저장
- 전역 테마가 바뀌면 모든 살아있는 xterm 인스턴스의 `term.options.theme`을 갱신
- `registerLinkProvider`가 `.md/.markdown` 경로를 링크로 노출. xterm의 1-based buffer 좌표에 맞춰 range를 만들고, 클릭 시 `resolve_markdown_path` 후 Docs 패널을 엶

## 수동 업데이트 확인

- `SettingsModal.tsx`의 Update 섹션에서 현재 `APP_VERSION`과 GitHub 최신 릴리즈를 표시
- `appInfo.ts`가 `APP_VERSION`, repo URL, releases URL, latest release API URL, semver 비교 helper를 제공
- `Check` 버튼은 `https://api.github.com/repos/OneThingChanged/Multiagent/releases/latest`를 조회
- 새 버전이 있으면 사용자가 `Releases` 버튼으로 브라우저에서 GitHub Release 페이지를 열어 설치 파일을 직접 내려받는 수동 업데이트 방식
- Tauri updater 플러그인 기반 자동 업데이트는 아직 적용하지 않음

## Docs / Markdown 뷰어

### 백엔드 스캔

- `list_markdown_files`는 활성 프로젝트의 folder를 root로 보고 `*.md`, `*.markdown` 파일을 재귀 수집
- `.git`, `.hg`, `.svn`, `.claude`, `.codex`, `node_modules`, `target`, `dist`, `build`, `.next`, `.venv`, `vendor`는 스캔 제외
- 최대 파일 수는 500개, 읽기 가능한 단일 Markdown 파일 최대 크기는 2MB
- `resolve_markdown_path`는 다음 형태를 모두 처리:
  - `Docs/TODO.md`, `Docs\TODO.md`
  - `TODO.md`처럼 Docs 폴더 내부 상대경로
  - 절대경로
  - `file.md:12` 같은 line suffix
- 모든 경로는 canonicalize 후 root 안에 있는 Markdown 파일인지 검사

### 프론트 렌더링

- `DocsPanel.tsx`가 Markdown 파일 목록, 트리 탐색, 렌더링을 담당
- 탐색 모드는 `list → tree → hidden` 순환
- Tree 모드는 경로 segment를 폴더 노드로 묶고, 선택 파일의 상위 폴더는 자동으로 펼침
- Markdown 렌더링은 `react-markdown` + `remark-gfm` + `rehype-highlight`
- `Open`/`Reveal`은 `tauri-plugin-opener`로 기본 앱 열기/탐색기 위치 표시

### 드롭 존 계산

`computeDropZone(rect, x, y)`:
- 좌/우/상/하 각 25% 영역에서 마우스 위치로부터 가장 가까운 가장자리가 winner
- 모든 가장자리에서 25% 이상 떨어져 있으면 `center`
- `top/bottom` → 수직 split (`v`), `left/right` → 수평 split (`h`)
- `center` → addTabToLeafAt (탭 합치기)

### 핵심 헬퍼 (수정 시 주의)

| 함수 | 역할 |
|---|---|
| `getAt(layout, path)` | path로 내려가서 노드 반환 |
| `setAt(layout, path, next)` | path 위치를 next로 교체. next=null이면 제거 + 부모 split이 자식 1개로 줄면 평탄화 |
| `findLeafPath(node, agentId)` | leaf.tabs.includes(agentId)인 leaf까지의 path |
| `findLeafPathById(node, leafId)` | leaf.id로 검색 (DnD 시 prune 후 안전한 anchor) |
| `pruneAgent(node, agentId)` | 트리에서 그 agent 완전 제거. 마지막 tab이면 leaf 삭제, leaf 단독이면 split 평탄화 |
| `splitLeafAt(layout, path, dir, newAgentId)` | leaf를 split으로 wrap. 새 leaf는 1탭짜리 |
| `addTabToLeafAt(layout, path, agentId)` | leaf.tabs에 추가 + activeIndex 그쪽으로 |
| `setLeafActiveTab(layout, path, agentId)` | activeIndex 변경 |
| `insertNextTo(layout, targetPath, newLeaf, dir, before)` | 부모 split이 같은 dir이면 형제 추가, 아니면 wrap |
| `validateLayout(node, validIds)` | 로드 시 검증. 옛 `{type:'leaf', agentId}` 포맷 자동 마이그레이션 |

### 상태 변경 패턴

대부분의 액션은 `setGroups((prev) => { ... })` 안에서 layout을 가공한 뒤 ref(`activeGroupIdRef`, `activePathRef`)로 최신 active 정보를 읽어 처리. 동기적으로 `setActivePath`/`setActiveGroupId`도 같이 호출.

## Tauri 설정 (`tauri.conf.json`)

- `app.windows[0].dragDropEnabled: false` ← HTML5 드래그앤드롭 사용을 위해 OS 파일 드롭 핸들러 끔
- 권한 (`capabilities/default.json`):
  - `core:default`, `opener:default`
  - `dialog:default`, `dialog:allow-open` (폴더 선택)
  - `notification:default` (OS 토스트)

## localStorage 키

- `multiagent.projects.v1` — `StoredProject[]` (프로젝트 이름, 폴더, 최근 사용 시각)
- `multiagent.agents.v1` — `StoredAgent[]` (세션 메타 + projectId)
- `multiagent.groups.v1` — `Group[]` (projectId + 트리 + `sessionPins`/`sessionLocked`)
- `multiagent.view.v1` — `{ activeProjectId, activeGroupId, activePath }`
- `multiagent.appTheme.v1` — 전역 테마 (`soft`/`github`/`warm`/`light`)
- `multiagent.docsTheme.v1` — 옛 Docs 전용 테마 키. 새 키로 읽고 쓰는 동안 호환용으로 같이 저장
- `multiagent.docsWidth.v1` — Docs 패널 폭
- `multiagent.terminalFontSize.v1` — xterm 폰트 크기
- (마이그레이션) `multiagent.layout.v1` — 옛 단일 트리. 첫 로드 시 단일 그룹으로 변환 후 삭제
