# UX / 조작법

## 사이드바

- **좌클릭**: 그 에이전트의 그룹으로 화면 전환. 그룹 안에 여러 leaf가 있으면 모두 보이고, 클릭한 에이전트가 그 leaf의 활성 탭이 됨
- **MD 버튼**: 오른쪽 Docs 패널 열기/닫기. 현재 활성 에이전트 폴더의 Markdown 파일을 목록/미리보기로 표시
- **설정 버튼**: 전역 설정 팝업 열기. 앱 테마를 바꾸면 사이드바, 탭, 모달, 컨텍스트 메뉴, 터미널, Docs 뷰어에 같이 적용됨
- **+ 버튼**: 새 에이전트 생성 모달 열기
- **우클릭**: 컨텍스트 메뉴
  - 전환 (현재 그룹으로 이동)
  - 탭으로 추가 — 활성 패널에 새 탭으로 합침
  - 오른쪽 분할 — 활성 패널 옆에 새 패널 (수평)
  - 아래로 분할 — 활성 패널 아래에 새 패널 (수직)
  - 현재 세션으로 그룹 고정 — 그룹 안에서 저장된 Codex/Claude 세션 ID를 고정
  - 그룹 세션 고정 해제 — 고정된 세션 ID를 제거하고 다시 최신 세션 resume 방식으로 복귀
- **× 버튼**: 에이전트 영구 삭제 (PTY kill + sidebar/layout/storage에서 모두 제거)
- **드래그**: 사이드바 아이템을 패널 위로 끌어 같은 드롭 존 시스템 사용

### 사이드바 시각

- 활성 그룹 멤버: 옅은 파란 배경 + 왼쪽 막대 (멤버 ≥ 2일 때 활성이면 파란 막대, 비활성이면 회색)
- 활성 leaf의 활성 탭에 해당하는 에이전트: 진한 파란 배경
- 세션이 고정된 그룹 멤버: 이름 옆에 `PIN` 배지 표시
- 그룹 사이: 가는 회색 구분선
- 에이전트 항목은 2줄: 위 = 상태점 / 도구 아이콘 / 이름 / dangerous ⚠ / 닫기 ×, 아래 = 폴더 경로 마지막 두 단계

### 상태점

| 색 | 의미 |
|---|---|
| 회색 | idle — 아직 spawn 안 됨 (저장된 상태에서 복원) |
| 노랑 (블링크 없음) | starting — spawn 직후 첫 데이터 대기 |
| 초록 | running — 정상 |
| 노랑 + pulse 애니메이션 | working — Claude/Codex가 응답 처리 중 (hook 신호 기준) |
| 회색 | exited — PTY 종료 |

## 새 에이전트 모달 (사이드바 + 클릭)

- **Name**: 사이드바/탭에 표시될 이름
- **Folder**: PowerShell이 시작될 디렉토리. Browse 버튼은 OS 폴더 선택 다이얼로그
- **AI tool**: Claude Code / Codex / Shell only
- **Dangerous mode**: 체크 시 `--dangerously-skip-permissions` (Claude) / `--dangerously-bypass-approvals-and-sandbox` (Codex) 플래그 자동 추가. 빨간색 ⚠ 강조
- 백드롭 클릭으로는 안 닫힘. Cancel/Esc로만 닫힘 (오타 입력 도중 사라짐 방지)

## 패널 탭 스트립

- 상단 가로 줄. 활성 탭에 위쪽 파란 인디케이터
- **탭 클릭**: 그 탭 활성화 + 그 leaf를 active path로
- **탭 ×**: 그 탭만 닫음. 그 에이전트는 새 solo 그룹으로 분리 (사이드바에선 살아있고 클릭으로 부활 가능). 마지막 탭이면 패널 사라짐
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

세션이 고정된 그룹은 외부 에이전트를 탭/분할/드래그로 추가할 수 없다. 고정 그룹 안의 기존 멤버끼리 재배치하는 것은 허용된다. 다른 고정 그룹에 속한 에이전트도 현재 그룹으로 이동할 수 없다.

## 그룹 세션 고정

- 사이드바에서 그룹 멤버를 우클릭하고 **현재 세션으로 그룹 고정**을 누르면, 그 그룹 안의 에이전트들 중 `lastSessionId`가 있는 항목을 그룹에 저장한다
- 이후 해당 그룹에서 에이전트를 spawn할 때는 `agent.lastSessionId`보다 그룹의 고정 세션 ID를 우선 사용한다
- 고정된 그룹은 사이드바에 `PIN` 배지가 표시된다
- **그룹 세션 고정 해제**를 누르면 그룹 고정값을 제거하고, 다시 각 에이전트의 최신 `lastSessionId`를 사용한다
- 고정은 다음 spawn부터 적용된다. 이미 실행 중인 터미널 프로세스는 강제로 재시작하지 않는다

## 패널 분할 핸들

- 분할 사이의 가는 회색 띠. 마우스 올리면 파랑색
- 드래그로 분할 비율 조정. 최소 폭 ~120px 제한

## Docs 패널

- 사이드바의 **MD** 버튼으로 오른쪽 패널을 열고 닫음
- 터미널과 Docs 패널 사이의 세로 경계선을 드래그해서 Docs 폭을 조절. 마지막 폭은 다음 실행에도 유지됨
- Docs 폭은 고정 최대값 없이 조절 가능. 앱 왼쪽 작업 영역의 최소 폭만 남기고 오른쪽으로 넓힐 수 있음
- 패널 안에서 왼쪽은 Markdown 탐색 영역, 오른쪽은 선택한 문서 뷰어
- 현재 활성 에이전트 폴더에서 `*.md`, `*.markdown` 파일을 재귀적으로 찾음
- `README.md`를 우선 선택하고, 없으면 첫 번째 Markdown 파일을 선택
- `Refresh`는 파일 목록과 현재 문서를 다시 읽음
- `View: List` 버튼은 클릭할 때마다 `List → Tree → Hide → List` 순서로 탐색 모드를 바꿈
  - **List**: 전체 Markdown 파일을 평면 목록으로 표시
  - **Tree**: 폴더 구조로 표시. 폴더는 접기/펼치기가 가능하고, 폴더 아이콘과 `MD` 파일 배지로 구분
  - **Hide**: 왼쪽 탐색 영역 숨김
- fenced code block은 언어 태그(```ts`, ```rust`, ```json` 등)를 기준으로 문법 색상 하이라이트를 적용
- `Open`은 선택 문서를 기본 프로그램으로 열고, `Reveal`은 파일 위치를 탐색기에서 표시
- `node_modules`, `target`, `dist`, `.git`, `.claude`, `.codex` 같은 대형/내부 폴더는 스캔에서 제외
- 터미널 출력의 Markdown 경로(`docs/README.md`, `Docs/Foo.md:42`, `K:\...\README.md` 등)는 링크처럼 클릭 가능. 클릭 시 현재 에이전트 폴더 안 파일인지 확인한 뒤 Docs 패널에서 열림

## 설정 / 테마

- 사이드바 상단의 **설정** 버튼으로 전역 설정 팝업을 열고 닫음
- `Esc`, 바깥 클릭, 닫기 버튼으로 팝업을 닫을 수 있음
- 테마 선택값은 localStorage에 저장되어 다음 실행에도 유지됨
- `Update` 섹션에서 현재 버전과 GitHub 최신 릴리즈를 확인할 수 있음
- `Check`는 `OneThingChanged/Multiagent`의 최신 릴리즈를 조회하고, `Releases`는 브라우저에서 릴리즈 페이지를 엶
- 제공 테마:
  - **Soft**: 기본 다크 테마
  - **GitHub**: GitHub dark 계열
  - **Warm**: 따뜻한 저채도 다크 테마
  - **Light**: 밝은 테마

## 창 닫기 (X 버튼)

- 닫기 누르면 즉시 종료하지 않고 백엔드가 한번 막음
- 실행 중인 모든 Codex/Claude 에이전트에 자동으로 `/quit\r` 전송
- 2초 대기하며 Codex가 출력하는 resume token (`codex resume <uuid>`)을 캡처해 localStorage에 저장
- 그 다음 실제로 창 닫음
- 다음 앱 실행 → 사이드바에서 그 agent 클릭 → 자동으로 `codex resume <token>`으로 시작 → 직전 세션 이어짐
- 자세한 동작과 한계는 [RESUME.md](RESUME.md)

## 복사 / 붙여넣기 / 줌

- **Ctrl+C**: 터미널 선택 텍스트를 클립보드에 복사. 선택 텍스트가 없어도 CLI interrupt로 전달하지 않음
- **Ctrl+V**: 일반 텍스트 클립보드는 xterm이 직접 bracketed paste로 입력 (Codex/Claude/PowerShell 모두 정상 동작)
- 이미지 클립보드 (텍스트 없음): raw Ctrl+V 키스트로크를 PTY로 전달 → Codex의 이미지 paste 기능 호환
- Ctrl+Shift+V는 가로채지 않고 그대로 통과
- **Ctrl+마우스 휠**: 터미널 폰트 크기 줌 인/아웃. 마지막 크기는 localStorage에 저장되어 다음 실행에도 유지됨

## 작업 완료 알림

- Claude/Codex의 `Stop` hook이 fire되면:
  - 노란 pulse → 초록색 복귀
  - 우측 상단 인앱 토스트 5초 (클릭으로 그 그룹 활성화 + 닫기)
  - Windows 토스트 (권한 허용 시)
- 알림은 한 번만. hook이 중복 fire되어도 상태가 working이 아니면 무시
