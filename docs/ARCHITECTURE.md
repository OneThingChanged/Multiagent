# Architecture

## 프로세스 구조

```
app.exe (Tauri Rust 메인 프로세스)
├─ WebView2 (UI 렌더링, React + xterm.js)
├─ Desktop Pet WebView2 (주 프로세스만, 투명·항상 위·non-focusable)
├─ tiny_http hook 서버 thread (127.0.0.1:RANDOM_PORT, Claude/Codex hook 수신)
├─ axum 원격 서버 (0.0.0.0:port, 켰을 때만 — REMOTE.md)
│   └─ cloudflared 자식 프로세스 (터널 켰을 때만)
├─ axum Dashboard 서버 (127.0.0.1:4421 기본, 세션 모니터 + Usage — MONITOR.md)
├─ PTY thread × N (각 에이전트마다 reader 스레드)
│  └─ PowerShell child process  (로컬 세션)
│  │   └─ claude / codex CLI (사용자가 선택한 AI 도구)
│  └─ ssh.exe child process    (SSH 원격 세션 — Windows 내장 OpenSSH)
│      └─ 원격 셸 → 원격 claude / codex
└─ 600ms 후 init 명령 입력용 1회성 스레드 × N
```

빌드 variant: **standard**(`com.jintae.multiagent`, `latest.json`) / **company**(`com.jintae.multiagent.company`, `latest-company.json`). 같은 버전·코드, identifier와 updater endpoint만 다름 ([RELEASE.md](RELEASE.md)).

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
   │  │  ├─ appInfo.ts      ← 앱 버전·variant, GitHub repo URL
   │  │  ├─ notificationSound.ts ← 알림음 설정/재생
   │  │  ├─ scrollback.ts   ← xterm 스크롤백 저장/복원 (localStorage)
   │  │  ├─ desktopPet.ts   ← 펫 설정·세션 상태 집계·완료 큐 payload
   │  │  └─ terminal.ts     ← createEntry / 테마 / md·html·이미지 링크 / search·serialize / zoom / Ctrl+Enter / notifyDone
   │  ├─ components/
   │  │  ├─ Sidebar.tsx        ← Screen 요약·프로젝트 트리·검색·1줄·드래그 재정렬
   │  │  ├─ TerminalArea.tsx / PaneSlot.tsx / Splitter.tsx
   │  │  ├─ FileTreePanel.tsx  ← 우측 파일 트리 사이드바 (lazy 로딩·Find files)
   │  │  ├─ DocViewer.tsx      ← 문서 탭 뷰어 (md/html/이미지/텍스트)
   │  │  ├─ ImageViewer.tsx    ← 터미널 이미지 경로 뷰어
   │  │  ├─ DesktopPetPage.tsx / DesktopPetPage.css ← 펫 마스코트·상태 애니메이션
   │  │  ├─ SettingsModal.tsx  ← General/Usage/Remote/About 탭
   │  │  ├─ SearchBar.tsx      ← 터미널 Ctrl+F 검색바
   │  │  ├─ NewProjectModal / NewAgentModal / RenameSessionModal / RenameProjectModal
   │  │  ├─ SessionPropertiesModal.tsx / ProjectPropertiesModal.tsx
   │  │  ├─ Toast.tsx
   │  │  └─ Menus.tsx         ← ContextMenu / ProjectContextMenu / TabContextMenu
   │  ├─ App.css
   │  └─ main.tsx
   ├─ src-tauri/        ← Rust 백엔드
   │  ├─ src/lib.rs     ← PTY + hook 서버 + 커맨드 + setup
   │  ├─ src/remote.rs  ← 원격 axum 서버·터널·인증·승인 (REMOTE.md)
   │  ├─ src/remote_page.html / remote_login.html ← 원격 웹 클라이언트
   │  ├─ src/usage.rs   ← 토큰 집계·SQLite·대시보드 서버 (USAGE_DASHBOARD.md)
   │  ├─ src/usage_dashboard.html ← 대시보드 UI
   │  ├─ Cargo.toml
   │  ├─ tauri.conf.json / tauri.company.conf.json ← variant별 설정
   │  └─ capabilities/default.json
   ├─ scripts/         ← build-all-variants / build-variant / write-latest-json
   └─ package.json
```

## Rust 백엔드 (`src-tauri/src/lib.rs`)

### Tauri 커맨드

| 커맨드 | 인자 | 동작 |
|---|---|---|
| `spawn_pty` | id, shell?, cwd?, init_command?, ai_tool_id?, ssh?, cols, rows | PTY 열고 PowerShell 실행, hook용 settings.local.json 생성/머지, env var 주입, init 명령 600ms 뒤 입력, reader thread 시작. `ssh`가 있으면 PowerShell 대신 `ssh -tt user@host "<remote command>"`로 원격 PTY를 띄우고 typed-init을 건너뜀(원격 명령에 baking). 원격 명령은 TUI 키 처리용 `TERM=xterm-256color`/`COLORTERM=truecolor`를 먼저 주입한다. **Windows 원격**: 원격 명령을 `powershell -EncodedCommand <base64>`로 보내 기본 셸이 cmd든 PowerShell이든 동작(env는 `$env:`, cd는 `Set-Location`). npm CLI의 `.ps1` 실행 정책 문제를 피하려고 Windows SSH 호스트는 기본적으로 `codex.cmd`/`claude.cmd` shim을 사용한다. Phase 2(키 모드)에선 `-R <port>:127.0.0.1:<hookPort>` 역터널 + 원격 helper(`multiagent-notify.ps1`) 푸시·hook 머지(`setup_remote_hooks`)로 working/done·session-start hook 동작. 비번 모드는 PTY 비번 자동입력(hook 없음) |
| `ssh_test` | ssh | `ssh -o BatchMode=yes -o ConnectTimeout=8 ... "echo"`로 연결 가능 여부 빠르게 확인 (설정 Test 버튼) |
| `write_pty` | id, data | 활성 PTY writer에 바이트 쓰기 |
| `resize_pty` | id, cols, rows | master.resize() (ConPTY → 자식에 SIGWINCH 상응) |
| `kill_pty` | id | child.kill() + state에서 제거 |
| `confirm_close` | (none) | 창 닫기 확인 플래그 true 세팅 + window.close() — 프론트의 graceful shutdown 완료 후 호출 |
| `list_markdown_files` | folder | 폴더 아래 `.md/.html` 재귀 스캔 `{name, relative_path}[]` (최대 500) |
| `read_markdown_file` | folder, relative_path | md/html 읽기. 절대경로면 폴더 밖도 허용, 2MB 초과 거부 |
| `resolve_markdown_path` | folder, path | 터미널 클릭 경로 검증·정규화 (폴더 밖 절대경로 지원) |
| `read_image_data_url` | path, folder? | 이미지 파일을 data URL로 (이미지 뷰어용, 25MB 한도) |
| `play_system_sound` / `read_audio_file` | — / path | 알림음 (시스템 비프 / 커스텀 파일 바이트) |
| `set_desktop_pet_enabled` | enabled | setup에서 미리 만든 주 프로세스 Desktop Pet 창 표시/숨김 |
| `update_desktop_pet` / `desktop_pet_snapshot` | update / — | 펫 상태 payload 캐시 + 창 이벤트 전달 / 초기 상태 조회 |
| `reset_desktop_pet_position` | — | 펫을 주 창 모니터 오른쪽 아래 기본 위치로 이동 |

추가 커맨드 그룹 (상세는 각 문서):
- **원격** ([REMOTE.md](REMOTE.md)): `start/stop_remote_server`, `remote_server_status`, `start/stop_tunnel`, `tunnel_status`, `remote_config_get/set`, `remote_access_list/approve/revoke`, `sync_remote_agents`, `sync_remote_view`
- **Dashboard** ([MONITOR.md](MONITOR.md)): `sync_monitor_state`, `start/stop_monitor_server`, `monitor_server_status`, `monitor_config_get/set` — 세션 모니터링과 Usage 화면을 단일 로컬 서버에서 제공
- **사용량 집계** ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md)): `sync_usage_catalog`, `usage_ingest_now`, `resolve_cli_session`, `relink_cli_session` (`start/stop_usage_server` 계열은 이전 별도 Usage 서버용 legacy command)
- **창**: `show_main_window`, 새 창/always-on-top 관련

### 상태 (`AppState`)

```rust
struct AppState {
    ptys: Mutex<HashMap<String, PtyHandle>>,
    hook_info: HookInfo,  // { port, token, helper_path }
    close_confirmed: Mutex<bool>,  // graceful close 진행 중 표시
    remote: Arc<remote::RemoteHub>,  // 원격 서버/터널/세션/승인
    usage: Arc<usage::UsageHub>,     // 토큰 집계/대시보드 서버
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
5. Claude/Codex가 hook 실행 → `powershell -File notify.ps1 working|done`; `UserPromptSubmit`의 `prompt`도 최대 500자로 캡처
6. 스크립트가 `hook-info.json` 읽고 UTF-8 JSON으로 `POST http://127.0.0.1:PORT/event { id, event, token, prompt? }`
7. Rust HTTP 서버가 토큰 검증 → Tauri 이벤트 `agent:hook-event { id, event }` 발생
8. 프론트가 listen 중 → 상태 갱신 + 알림

### 창 닫기 인터셉트

setup 시 `window.on_window_event`로 `CloseRequested` 가로챔.
- 플래그가 false면 `api.prevent_close()` + 프론트에 `app:close-requested` 이벤트
- 프론트가 graceful shutdown (`/quit` 전송 + 2초 대기) 후 `confirm_close` 커맨드 호출
- `confirm_close`는 플래그를 true로 세팅하고 Desktop Pet을 먼저, 메인 WebView를 마지막에 정상 close → localStorage의 재활성화 스냅샷 flush 후 프로세스 종료. 750ms 뒤에도 창이 남으면 `app.exit(0)` fallback

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
projects: Project[]                // 프로젝트 메타 (id, name, folder, createdAt, lastOpenedAt?, sshHostId?, remoteFolder?)
agents: Agent[]                    // 세션 메타 (id, projectId, name, folder, aiToolId, dangerous, status, createdAt, lastSessionId?)
groups: Group[]                    // 각 그룹 = layout 트리 + 선택적 기준 projectId + 세션 고정값
activeProjectId: string | null     // 현재 사이드바/Docs 기준 프로젝트
activeGroupId: string | null       // 현재 표시 중인 그룹
activePath: Path | null            // 그 그룹 내의 활성 leaf 경로 (number[])
filesOpen/filesWidth                // 파일 트리 사이드바 열림·폭 (둘 다 영구화)
appTheme: AppThemeId                // Soft/GitHub/Warm/Light 전역 테마
projects/agents/groups/view/theme/filesOpen/filesWidth/terminalFontSize 모두 localStorage 영구화
```

### 레이아웃 트리 (`LayoutNode`)

```ts
LeafNode  = { type: 'leaf';  id; tabs: string[]; activeIndex: number }
SplitNode = { type: 'split'; id; direction: 'h' | 'v'; children: LayoutNode[]; sizes: number[] }
```

- 각 leaf는 한 패널. tabs 배열 = 그 패널의 탭 순서, activeIndex = 현재 보이는 탭
- tabs 항목은 보통 agent ID지만, **문서 탭**은 `doc:<projectId>:<relativePath>` prefix 문자열로 표현한다 (`src/lib/docTabs.ts`). layout/groupOps 연산은 문자열을 불투명하게 다루므로 그대로 동작하고, `validateLayout`은 doc id를 유효한 탭으로 유지해 재시작 후에도 복원된다. 문서 탭 닫기는 `closeDocTab`(solo 그룹 재배치 없음), remote/monitor 동기화 전에는 `stripDocTabs`로 제거된다
- split 조작은 현재 Screen에 새 leaf를 추가한다. 같은 방향의 부모 split이면 형제로 추가하고, 다른 방향이면 대상 leaf를 새 split으로 감싸 중첩한다
- 따라서 한 Screen은 `A+B+C` 같은 3개 이상 패널과 좌우·상하 중첩 레이아웃을 모두 지원한다
- `sizes`는 자식 비율 합 = 1

### 그룹 모델 불변식

- agents 안의 모든 ID는 groups[*].layout 안에 정확히 한 번씩 등장 (어느 그룹 어느 leaf 어느 tab)
- 각 agent는 정확히 하나의 projectId를 가진다
- 그룹은 여러 프로젝트 세션을 함께 담을 수 있다. `group.projectId`는 새 solo 그룹 생성이나 legacy fallback에 쓰는 기준 프로젝트일 뿐, 멤버 프로젝트를 제한하지 않는다
- 기존 `multiagent.agents.v1`만 있던 설치는 agent.folder별로 Project를 자동 생성해 마이그레이션한다
- 어떤 이유로 누락되면 load 시 solo 그룹 생성으로 복구
- 그룹 layout이 비면 그 그룹 자동 삭제
- 분할 그룹은 2개 이상의 패널을 가질 수 있고, 각 패널 내부에는 여러 탭을 둘 수 있음
- 로드 시 `normalizeStoredGroups`가 전체 그룹을 한 번에 검증한다. 같은 agent가 여러 그룹에 있으면 split Screen이 stale solo보다 우선하며, 같은 형태끼리는 현재 활성 group이 우선한다
- 멀티 윈도우 저장은 현재 groups 배열을 authoritative하게 덮어쓴다. 삭제된 예전 group ID를 localStorage에서 다시 합치지 않는다
- `sessionPins?: Record<agentId, sessionId>`는 그룹에 고정된 resume 세션 ID
- `sessionLocked?: true`이면 외부 세션을 해당 그룹에 탭/분할/드래그로 추가하지 않음
- layout에서 제거된 세션의 session pin은 `updateGroup`에서 같이 정리됨

### 사이드바 Screen 요약

- root가 `split`인 그룹만 사이드바 프로젝트 트리 위 `SCREENS` 영역에 `Screen N (A+B)`로 표시한다. 탭만 여러 개인 단일 leaf 그룹은 Screen이 아니다
- Screen 번호와 색은 현재 split 그룹 순서로 배정하고, 프로젝트의 각 멤버 행에도 같은 색 `SN` 배지를 표시한다
- 서로 다른 프로젝트의 세션을 분할해도 Screen 요약 한 줄에서 함께 보이며, 행을 누르면 대표 세션을 `groupOf`로 다시 찾지 않고 해당 `groupId`를 직접 활성화한다
- `Screen 1 (A+B)`에서 A 패널에 C를 다시 분할하면 같은 group ID의 `Screen 1 (A+C+B)`가 된다. C가 다른 Screen에 있었다면 원래 Screen에서는 제거되어 두 Screen에 동시에 속하지 않는다

### 그룹 세션 고정

- 사이드바 우클릭 메뉴에서 `현재 세션으로 그룹 고정`을 실행하면, 해당 그룹 멤버 중 `lastSessionId`가 있는 세션들을 `group.sessionPins`에 저장
- spawn 시 `PaneSlot`은 `group.sessionPins[agentId]`를 먼저 보고, 없으면 `agent.lastSessionId`를 사용
- 고정된 그룹은 사이드바에 `PIN` 배지를 표시
- `groupOps.openAsTab`, `splitWith`, `performDrop`은 locked group 안으로 외부 세션이 들어오거나 locked source group에서 세션이 빠져나가는 이동을 막음
- 현재 구현은 과거 세션 목록을 따로 보관하지 않고 "현재 저장된 세션 ID"만 고정한다

### xterm 라이프사이클

- `termsRef: Map<agentId, TerminalEntry>` — 에이전트별 Terminal 인스턴스 영구 보존
- 각 entry는 `el: HTMLDivElement` 1개 보유. `term.open(el)`은 처음 한 번만
- 활성 탭이 바뀔 때 `bodyRef.replaceChildren(entry.el)`로 슬롯 교체 (이전 탭의 el은 detach)
- 비활성 탭의 xterm은 메모리에 살아있고 PTY 데이터도 계속 받아 scrollback에 쌓임. 사용자가 다시 클릭하면 reattach
- 휠 이벤트는 capture 단계 핸들러에서 가로채 **버퍼 종류로 분기**한다. **일반 버퍼**에선 xterm buffer scroll 상태를 즉시 갱신하는 `scrollTerminalLinesImmediately()`로 scrollback을 직접 굴린다(TUI mouse tracking 무시). xterm public `scrollLines()`는 viewport scrollTop을 먼저 갱신한 뒤 비동기 scroll 이벤트에서 `ydisp`/`isUserScrolling`을 맞추므로, streaming 출력 중에는 "사용자가 위를 보고 있음" 상태가 늦게 반영되어 최하단으로 튈 수 있어 직접 buffer scroll 경로를 사용한다. **alternate 버퍼**(전체화면 TUI)에선 scrollback이 없어 viewport를 굴리지 않고, TUI가 마우스 리포팅을 켰으면 네이티브 SGR 휠 이벤트(`\x1b[<64/65;col;rowM`), 아니면 `PageUp/PageDown`을 PTY로 보내 TUI 자체 스크롤을 움직인다 ([KNOWN_ISSUES.md](KNOWN_ISSUES.md))
- Ctrl+휠은 모든 터미널의 `fontSize`를 함께 변경하고 `multiagent.terminalFontSize.v1`에 저장
- 전역 테마가 바뀌면 모든 살아있는 xterm 인스턴스의 `term.options.theme`을 갱신
- `registerLinkProvider`가 `.md/.markdown` 경로를 링크로 노출. xterm의 1-based buffer 좌표에 맞춰 range를 만들고, 클릭 시 `resolve_markdown_path` 후 메인 워크스페이스에 문서 탭으로 엶 (프로젝트 폴더 밖 절대경로는 OS 기본 앱)

## 자동 업데이트

- `tauri-plugin-updater` + `tauri-plugin-process` 기반. 설정 → About → **Check**
- variant별 updater endpoint(`latest.json` / `latest-company.json`)를 조회 → 새 버전이면 **서명 검증** 후 다운로드·설치·재시작
- pubkey는 `tauri.conf.json`에 박혀 있고, 빌드 시 private key로 `.sig` 생성. 빌드·서명·게시 전 과정은 [RELEASE.md](RELEASE.md)

## 파일 트리 & 문서 탭

### 백엔드

- **`list_directory`** (Electron 전용): 프로젝트 root 기준 한 디렉토리의 `{name, relative_path, is_dir}[]`를 반환 (dirs-first 정렬, 디렉토리당 2,000개 상한). `node_modules`/`.git`/`target`/`dist`/`build`/`.next`/`.cache`/`.venv`/`__pycache__`/`out` 제외. `isInside` 샌드박스로 root 밖 접근 차단
- **`read_text_file`** (Electron 전용): root 안의 임의 파일을 `{kind:"text",content} | {kind:"binary"} | {kind:"too_large",size}`로 반환 (2MB 상한, 앞 8KB NUL 스니핑으로 바이너리 판정, `isInside` 강제)
- **`git_status`** (Electron 전용): `git status --porcelain -z` 실행(3s 타임아웃, 2,000 엔트리 상한) → `{is_repo, entries: {relative_path, status}[]}`. rename/copy 엔트리의 원본 경로 토큰을 건너뛰며 XY 코드를 단일 문자(`U`/`D`/`R`/`A`/`M`)로 축약. git 미설치·비저장소는 `is_repo:false`
- **파일 작업 IPC** (Electron 전용, 전부 `isInside` 샌드박스 + 이름 유효성 검사): `create_file`(`wx` 플래그로 기존 파일 보호) / `create_directory` / `rename_path`(새 상대경로 반환) / `duplicate_path`(`name copy[ n]` 자동 명명, 폴더는 재귀 복사) / `delete_path`(`shell.trashItem` → 휴지통, 영구삭제 아님)
- **Source Control IPC** (Electron 전용): `git_changes` — `status --porcelain -z`(staged=X열/unstaged=Y열 분리, `MM`은 양쪽) + `diff --numstat`/`--cached` 라인 수 + branch + `rev-list --left-right --count @{u}...HEAD` ahead/behind + `log -n 8`을 병렬 실행해 한 번에 반환. `git_stage`(`add --`) / `git_unstage`(`restore --staged --`) / `git_commit`(`-m`, execFile 인자 전달이라 셸 인젝션 없음). 경로 배열(1~500)·메시지는 contract 레이어에서 검증
- `list_markdown_files`/`read_markdown_file`/`resolve_markdown_path`는 문서 탭의 md/html 읽기와 QuickOpen 문서 검색에 계속 사용 (Tauri에서도 동작)
- `resolve_markdown_path`는 `Docs/TODO.md`·상대경로·절대경로·`file.md:12` line suffix를 모두 처리하고, canonicalize 후 root 안 여부를 검사
- Tauri 런타임에는 `list_directory`/`read_text_file`이 없어 파일 트리·텍스트 뷰는 빈 상태/에러로 강등된다 (Electron-first)

### 프론트

- **`FileTreePanel.tsx`** — 우측 사이드바. `dirCache: Map<relativePath, entry[]>`에 디렉토리별 lazy 캐시, 펼친 폴더만 flat visible-row로 투영. Find files는 디바운스된 클라이언트 BFS(400 dirs/200 results 상한)
  - **프로젝트 선택**: 헤더 드롭박스로 표시 프로젝트 선택. 핀 OFF면 활성 프로젝트를 따라가고, 핀 ON이면 고정(`multiagent.fileTreePin.v1` 영구화, 프로젝트 삭제 시 자동 해제)
  - **펼침 상태**: 프로젝트별로 `multiagent.fileTreeExpanded.v1`에 저장, 프로젝트 재진입 시 저장된 폴더들을 재로딩해 복원. 모두 펼치기는 BFS(400 dirs 상한)
  - **git 뱃지**: `git_status` 결과를 파일 맵 + 폴더 전파 맵(D>M>A>U 랭크)으로 가공, 10초 폴링. 이름과 뱃지에 같은 색 적용
  - **우클릭 메뉴 + 인라인 입력**: 파일/폴더/빈영역별 메뉴, 새 파일·새 폴더·이름 변경은 인라인 input 행으로 처리(Enter/Esc). 폴더 이름 변경 시 하위 펼침 경로도 새 prefix로 치환. 작업 후 해당 디렉토리 refresh + git 갱신
  - **뷰 탭**: 패널 최상단 🗀 Files / ⎇ Source Control 전환. ⎇ 뱃지 수는 Files 뷰의 `git_status` 폴링(gitFiles.size)을 재사용
  - **SourceControlView**: `git_changes`를 뷰 진입 시 + 10초 폴링으로 로드. stage/unstage/commit은 busy 가드로 직렬화하고 완료 후 즉시 재로드 + 트리 뱃지 갱신. 행 클릭 → 문서 탭
  - 파일 트리 열기 버튼은 좌측 사이드바가 아닌 **창 우측 상단 플로팅 버튼**(`.files-open-btn`, 패널 닫힘 시에만 렌더)
- **`DocViewer.tsx`** — 문서 탭 pane 콘텐츠. 확장자로 분기: md→`react-markdown`+`remark-gfm`+`rehype-highlight`, html→`<iframe sandbox srcdoc>`(스크립트/동일출처 권한 없음), 이미지→`read_image_data_url`, 기타→`read_text_file` 결과를 fenced code block으로 하이라이트. 읽기 실패 시 Retry/Reveal 에러 패널
- **`PaneSlot.tsx`** — leaf의 활성 탭이 doc id면 xterm 호스트(`.pane-body`)를 `display:none`으로 숨기고 DocViewer를 렌더. xterm DOM과 attach/detach 라이프사이클은 그대로 유지되어 터미널↔문서 전환 시 출력 무손상
- `Open`/`Reveal`은 기본 앱 열기/탐색기 위치 표시

### 드롭 존 계산

`computeDropZone(rect, x, y)`:
- 좌/우/상/하 각 25% 영역에서 마우스 위치로부터 가장 가까운 가장자리가 winner
- 모든 가장자리에서 25% 이상 떨어져 있으면 `center`
- `top/bottom` → 수직 split (`v`), `left/right` → 수평 split (`h`)
- edge drop은 대상 부모와 방향이 같으면 형제 패널을 추가하고, 방향이 다르면 대상 leaf를 새 split으로 감싼다
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

`groupOps.selectGroup`은 Screen 행의 `groupId`와 대표 agent를 받아 정확한 그룹·leaf를 활성화한다. 메뉴 분할과 edge drop은 `insertNextTo`를 공유하며, 이동 전 `pruneAgent`로 원래 그룹에서 세션을 제거해 전역 단일 소속을 유지한다.

### 상태 변경 패턴

대부분의 액션은 `setGroups((prev) => { ... })` 안에서 layout을 가공한 뒤 ref(`activeGroupIdRef`, `activePathRef`)로 최신 active 정보를 읽어 처리. 동기적으로 `setActivePath`/`setActiveGroupId`도 같이 호출.

## Tauri 설정 (`tauri.conf.json`)

- `app.windows[0].dragDropEnabled: false` ← HTML5 드래그앤드롭 사용을 위해 OS 파일 드롭 핸들러 끔
- 권한 (`capabilities/default.json`):
  - `core:default`, `opener:default`
  - `dialog:default`, `dialog:allow-open` (폴더 선택)
  - `notification:default` (OS 토스트)

## localStorage 키

- `multiagent.projects.v1` — `StoredProject[]` (프로젝트 이름, 폴더, 최근 사용 시각, 선택적 `sshHostId`/`remoteFolder`)
- `multiagent.sshHosts.v1` — `SshHost[]` (SSH 호스트 레지스트리: label/host/user/port?/identityFile?/extraOptions?/remoteOs?/authMethod?/preferCmdShim?)
- `multiagent.agents.v1` — `StoredAgent[]` (세션 메타 + projectId)
- `multiagent.groups.v1` — `Group[]` (트리 + 선택적 projectId + `sessionPins`/`sessionLocked`)
- `multiagent.view.v1` — `{ activeProjectId, activeGroupId, activePath }`
- `multiagent.appTheme.v1` — 전역 테마 (`soft`/`github`/`warm`/`light`)
- `multiagent.docsTheme.v1` — 옛 Docs 전용 테마 키. 새 키로 읽고 쓰는 동안 호환용으로 같이 저장
- `multiagent.filesWidth.v1` / `multiagent.filesOpen.v1` — 파일 트리 사이드바 폭·열림 상태 (옛 `multiagent.docsWidth.v1`은 미사용)
- `multiagent.fileTreePin.v1` — 파일 트리 프로젝트 고정 `{ pinned, projectId }`
- `multiagent.fileTreeExpanded.v1` — 파일 트리 펼침 상태 `{ [projectId]: relativePath[] }`
- `multiagent.terminalFontSize.v1` — xterm 폰트 크기
- `multiagent.notificationSound.v1` — 알림음 설정 (mode + customPath)
- `multiagent.desktopPetEnabled.v1` — Desktop Pet 표시 여부 (기본 true)
- `multiagent.scrollback.<agentId>.v1` — 세션별 스크롤백 스냅샷 (재시작 복원용)
- (마이그레이션) `multiagent.layout.v1` — 옛 단일 트리. 첫 로드 시 단일 그룹으로 변환 후 삭제

> 원격·사용량 설정은 localStorage가 아니라 `%LOCALAPPDATA%\com.jintae.multiagent\`의 JSON/SQLite에 저장: `remote-config.json`, `remote-access.json`, `usage-config.json`, `usage.db`, `cloudflared.exe`.
