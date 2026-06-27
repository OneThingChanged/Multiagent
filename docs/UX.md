# UX / 조작법

## 사이드바

- 사이드바 본문은 접이식 프로젝트 트리다. 각 프로젝트 행 아래에 그 프로젝트의 세션들이 표시된다. 프로젝트·세션 모두 **한 줄**로 압축 표시되고, 상세(경로·세션 ID·생성 시각 등)는 hover title과 우클릭 속성에서 확인
- **상단 검색창**: 프로젝트명·세션명으로 필터. 프로젝트명 매칭이면 그 프로젝트의 모든 세션, 세션명 매칭이면 해당 세션만 표시. 검색 중에는 자동 펼침
- **프로젝트 `>`/`v` 버튼**: 세션 목록 접기/펼치기
- **프로젝트 좌클릭**: 프로젝트 활성화 + 첫 세션 그룹 표시 (접혀 있으면 펼침)
- 세션이 아직 없는 새 프로젝트도 목록에 표시된다. 펼치면 `Select project, then click + to start a session` 안내가 보이고, 상단 `+`로 첫 세션을 만들 수 있다
- **프로젝트 드래그**: 사이드바에서 위/아래로 끌어 프로젝트 순서 변경
- **세션 좌클릭**: 그 세션의 그룹으로 전환. 클릭한 세션이 그 leaf의 활성 탭이 됨
- **세션 더블클릭**: 별명 변경 팝업
- **상단 버튼**: `MD`(Docs 패널), 🔍 항상 위(always-on-top), 새 창, `설정`, `+`(활성 프로젝트면 새 세션, 없으면 새 프로젝트)
- **Projects 제목 옆 + 버튼**: 새 프로젝트
- **세션 우클릭**: 컨텍스트 메뉴
  - 전환 (현재 그룹으로 이동) / 탭으로 추가 / 오른쪽 분할 / 아래로 분할
  - 세션 별명 변경
  - **세션 재시작** — exited 세션을 재spawn (resume 포함)
  - **세션 비활성화** — 실행 중이고 **화면에 안 보이는** 세션의 PTY만 종료해 리소스 해제. 다시 선택하면 resume으로 재시작 (보이는 세션은 비활성 처리되어 못 누름)
  - **현재 세션으로 재등록** — 그 도구·폴더의 디스크 최신 세션을 찾아 resume 대상(`lastSessionId`)을 갱신 (hook 오류 등으로 세션 ID를 잃었을 때 복구)
  - 현재 세션으로 그룹 고정 / 그룹 세션 고정 해제
  - **속성** — 이름·프로젝트·도구·상태·세션 ID·생성 시각·폴더·Agent ID
- **프로젝트 우클릭**: 이름 변경 / **속성**(폴더·세션 수·생성/열람 시각·Project ID) / **프로젝트 삭제**(확인 후 세션·PTY·스크롤백까지 정리)
- **× 버튼**: 세션 영구 삭제 (PTY kill + sidebar/layout/storage에서 제거)
- **드래그**: 펼쳐진 모든 프로젝트의 세션을 패널 위로 끌어 드롭 존 시스템 사용 (다른 프로젝트 세션도 같은 화면에 배치 가능)

### 사이드바 시각

- 활성 프로젝트: 왼쪽 파란 막대 + 강조 배경
- 활성 그룹 멤버: 옅은 파란 배경 + 왼쪽 막대
- 활성 leaf의 활성 탭 세션: 진한 파란 배경
- 고정 그룹 멤버: 이름 옆 `PIN` 배지
- 그룹 사이: 가는 회색 구분선
- 세션 항목: 상태점 / 도구 아이콘 / 별명 / dangerous `!` / 닫기 `x` (한 줄)

### 상태점

| 색 | 의미 |
|---|---|
| 회색 | idle — 아직 spawn 안 됨 (저장된 상태에서 복원) |
| 노랑 (블링크 없음) | starting — spawn 직후 첫 데이터 대기 |
| 초록 | running — 정상 |
| 노랑 + pulse 애니메이션 | working — Claude/Codex가 응답 처리 중 (hook 신호 기준) |
| 회색 | exited — PTY 종료 |

## 새 프로젝트 / 세션 모달

- **New Project**: 프로젝트 이름과 루트 폴더를 입력. 이 폴더가 세션 cwd와 Docs 스캔 root가 됨
  - **Run on remote host (SSH)** 토글: 켜면 폴더 대신 등록된 SSH 호스트(드롭다운)와 **원격 폴더**를 입력. 이 프로젝트의 세션은 그 머신에서 SSH로 실행됨 (호스트는 설정 → SSH Hosts에서 먼저 등록)
- **New Session**: 활성 프로젝트 안에 세션을 만든다
- **Session alias**: 사이드바/탭/Docs subtitle에 표시될 이름
- **AI tool**: Claude Code / Codex / Shell only
- **Dangerous mode**: 체크 시 `--dangerously-skip-permissions` (Claude) / `--dangerously-bypass-approvals-and-sandbox` (Codex) 플래그 자동 추가. 빨간색 ⚠ 강조
- 백드롭 클릭으로는 안 닫힘. Cancel/Esc로만 닫힘 (오타 입력 도중 사라짐 방지)

## 패널 탭 스트립

- 상단 가로 줄. 활성 탭에 위쪽 파란 인디케이터
- **탭 클릭**: 그 탭 활성화 + 그 leaf를 active path로
- **탭 ×**: 그 탭만 닫음. 그 세션은 새 solo 그룹으로 분리 (사이드바에선 살아있고 클릭으로 부활 가능). 마지막 탭이면 패널 사라짐
- **탭 우클릭**: 작은 메뉴 → "Close" 한 항목
- **탭 드래그**: 다른 패널 위로 → 5존 드롭 (아래)

## 드래그 앤 드롭 — 5존 드롭

드래그 중 마우스를 패널 위에 올리면 5개 영역이 표시됨:

| 영역 | 동작 |
|---|---|
| Center | 그 패널의 탭으로 추가 (이미 있으면 활성화) |
| Top edge | 그 패널을 위/아래로 vertical split, 위에 끼움 |
| Bottom edge | vertical split, 아래에 끼움 |
| Left edge | 좌/우 horizontal split, 왼쪽 끼움 |
| Right edge | horizontal split, 오른쪽 끼움 |

target의 부모 split이 이미 같은 방향이면 그 split의 형제로 추가 (sizes 자동 재분배), 아니면 target leaf를 새 split으로 wrap.

같은 leaf의 단독 탭을 자기 패널로 드롭하는 건 no-op (`isOnlyTabSource` 가드).

세션이 고정된 그룹은 외부 세션을 탭/분할/드래그로 추가할 수 없다. 고정 그룹 안의 기존 멤버끼리 재배치하는 것은 허용된다. 다른 고정 그룹에 속한 세션도 현재 그룹으로 이동할 수 없다.

프로젝트가 다른 세션도 같은 그룹 안에 탭/분할로 배치할 수 있다. 이 경우 사이드바에서는 각 세션이 자기 프로젝트 아래에 계속 보이고, 활성 그룹 배경/막대로 같은 작업 화면에 묶여 있음을 표시한다.

## 그룹 세션 고정

- 사이드바에서 그룹 멤버를 우클릭하고 **현재 세션으로 그룹 고정**을 누르면, 그 그룹 안의 세션들 중 `lastSessionId`가 있는 항목을 그룹에 저장한다
- 이후 해당 그룹에서 세션을 spawn할 때는 `agent.lastSessionId`보다 그룹의 고정 세션 ID를 우선 사용한다
- 고정된 그룹은 사이드바에 `PIN` 배지가 표시된다
- **그룹 세션 고정 해제**를 누르면 그룹 고정값을 제거하고, 다시 각 세션의 최신 `lastSessionId`를 사용한다
- 고정은 다음 spawn부터 적용된다. 이미 실행 중인 터미널 프로세스는 강제로 재시작하지 않는다

## 패널 분할 핸들

- 분할 사이의 가는 회색 띠. 마우스 올리면 파랑색
- 드래그로 분할 비율 조정. 최소 폭 ~120px 제한

## Docs 패널

- 사이드바의 **MD** 버튼으로 오른쪽 패널을 열고 닫음
- 터미널과 Docs 패널 사이의 세로 경계선을 드래그해서 Docs 폭을 조절. 마지막 폭은 다음 실행에도 유지됨
- Docs 폭은 고정 최대값 없이 조절 가능. 앱 왼쪽 작업 영역의 최소 폭만 남기고 오른쪽으로 넓힐 수 있음
- 패널 안에서 왼쪽은 Markdown 탐색 영역, 오른쪽은 선택한 문서 뷰어
- 현재 활성 프로젝트 폴더에서 `*.md`, `*.markdown`, `*.html`, `*.htm` 파일을 재귀적으로 찾음 (HTML은 sandbox iframe으로 렌더, 트리에서 `HTML` 배지)
- `README.md`를 우선 선택하고, 없으면 첫 번째 Markdown 파일을 선택
- `Refresh`는 파일 목록과 현재 문서를 다시 읽음
- `View: List` 버튼은 클릭할 때마다 `List → Tree → Hide → List` 순서로 탐색 모드를 바꿈
  - **List**: 전체 Markdown 파일을 평면 목록으로 표시
  - **Tree**: 폴더 구조로 표시. 폴더는 접기/펼치기가 가능하고, 폴더 아이콘과 `MD` 파일 배지로 구분
  - **Hide**: 왼쪽 탐색 영역 숨김
- fenced code block은 언어 태그(```ts`, ```rust`, ```json` 등)를 기준으로 문법 색상 하이라이트를 적용
- `Open`은 선택 문서를 기본 프로그램으로 열고, `Reveal`은 파일 위치를 탐색기에서 표시
- `node_modules`, `target`, `dist`, `.git`, `.claude`, `.codex` 같은 대형/내부 폴더는 스캔에서 제외
- 터미널 출력의 문서 경로(`docs/README.md`, `Docs/Foo.md:42`, `K:\...\page.html` 등)는 클릭 가능. `.md`/`.html` 모두 Docs 패널에서 열리며, **프로젝트 폴더 밖 절대경로 파일도** 열림

## 설정

사이드바 상단 **설정** 버튼으로 팝업을 연다 (`Esc`/바깥 클릭/닫기). 탭(General/Usage/Remote/SSH Hosts/About — company 빌드는 Remote 제외):

- **General**: 테마(Soft/GitHub/Warm/Light — 앱·터미널·Docs 공통) + 알림음(System/Custom/Off, Test)
- **Usage**: 사용량 대시보드 서버 on/off·포트, URL 복사, Reindex ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md))
- **Remote**: 원격 서버·Cloudflare 터널 Start/Stop, GitHub OAuth(client id/secret)·Owner, named tunnel(token/hostname/port), 계정 승인 관리 ([REMOTE.md](REMOTE.md))
- **SSH Hosts**: SSH 원격 세션용 호스트 레지스트리. 호스트 추가/편집/삭제(label·remote OS·user·host·port·**auth method**·identity 파일[Browse] 또는 비밀번호·extra options) + **Test connection**. **Auth method**: 키(identity 지정 시 자동 IdentitiesOnly로 "Too many authentication failures" 방지) / 비밀번호(저장 시 연결할 때 자동 입력, 로컬 `ssh-secrets.json`에만 저장)
- **About**: 제작자, 버전, **Check**(자동 업데이트 — 서명 검증 후 다운로드·설치·재시작), Releases

설정값은 localStorage 및 로컬 JSON에 저장되어 다음 실행에도 유지된다.

## 창 닫기 (X 버튼)

- 닫기 누르면 즉시 종료하지 않고 백엔드가 한번 막음
- 실행 중인 모든 Codex/Claude 에이전트에 자동으로 `/quit\r` 전송
- 2초 대기하며 Codex가 출력하는 resume token (`codex resume <uuid>`)을 캡처해 localStorage에 저장
- 그 다음 실제로 창 닫음
- 다음 앱 실행 → 사이드바에서 그 agent 클릭 → 자동으로 `codex resume <token>`으로 시작 → 직전 세션 이어짐
- 자세한 동작과 한계는 [RESUME.md](RESUME.md)

## 키보드 / 복사 / 붙여넣기 / 줌

- **Ctrl+C**: 선택 텍스트 복사 (선택 없으면 CLI interrupt로 보내지 않음)
- **Ctrl+V**: 텍스트는 xterm bracketed paste, 이미지 클립보드는 raw Ctrl+V 키스트로크 (Codex 이미지 paste 호환). Ctrl+Shift+V는 그대로 통과
- **Ctrl+Enter**: 줄바꿈 입력. 한글(IME) 합성 중에는 글자가 깨지지 않도록 처리됨
- **Ctrl+F**: 터미널 검색 바 (다음/이전/Esc 닫기)
- **마우스 휠**: 그 순간 터미널 버퍼에 따라 동작이 갈림. **일반 버퍼**(셸·일반 출력)에서는 xterm scrollback을 직접 움직이고, streaming 출력 중 위로 올려도 현재 viewport를 유지하도록 내부 buffer scroll 상태를 즉시 갱신함. **alternate-screen TUI**(Claude/Codex·vim·less 등)에서는 빈 scrollback으로 올라가지 않도록 휠을 viewport에 쓰지 않고 TUI 본인에게 넘김 — TUI가 마우스 리포팅을 켰으면 네이티브 휠 이벤트를 전달해 TUI가 자기 화면을 스크롤하고, 껐으면 `PageUp/PageDown`으로 바꿔 보냄. (그 PC의 claude 버전/모드에 따라 같은 화면도 일반 스크롤로 보일 수도, PageUp/Down으로 보일 수도 있음 — [KNOWN_ISSUES.md](KNOWN_ISSUES.md) 참고)
- **Ctrl+마우스 휠**: 터미널 폰트 줌 (저장됨)

### 전역 단축키

| 키 | 동작 |
|---|---|
| `Ctrl+T` | 새 세션 (활성 프로젝트 없으면 새 프로젝트) |
| `Ctrl+W` | 활성 탭 닫기 |
| `Ctrl+1`~`9` | 활성 leaf의 N번째 탭 전환 |
| `Ctrl+F` | 터미널 검색 |
| `Esc` | 검색/Docs 닫기 |

(입력창에 포커스가 있을 땐 단축키가 가로채지 않음)

## 이미지 뷰어

- 터미널 출력의 이미지 경로(`*.png/jpg/jpeg/gif/webp/bmp/svg/ico`)는 클릭하면 인앱 모달 뷰어로 열림 (절대경로·프로젝트 폴더 상대경로 모두)
- Esc 또는 바깥 클릭으로 닫음

## 작업 완료 알림

- Claude/Codex의 `Stop` hook이 fire되면:
  - 노란 pulse → 초록색 복귀
  - 우측 상단 인앱 토스트 5초 (클릭으로 그 그룹 활성화)
  - Windows 토스트 (권한 허용 시)
  - **알림음**: 설정에서 시스템음 / 커스텀 사운드 파일 / 끄기 선택 (Test 버튼으로 미리듣기)
- 알림은 한 번만. hook이 중복 fire되어도 상태가 working이 아니면 무시
- 원격 접속 승인 요청이 오면 별도 토스트 + 알림음 ([REMOTE.md](REMOTE.md))
