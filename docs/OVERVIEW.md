# MultiAgent — Overview

여러 AI 에이전트(Claude Code, Codex 등) 터미널 세션을 한 창에서 그룹·탭·분할로 관리하는 데스크톱 앱.

## 목적

- 여러 프로젝트에서 동시에 Claude/Codex를 돌릴 때, 별도의 OS 터미널 창 여러 개를 띄우지 않고 한 윈도우 안에서 빠르게 전환·정리
- 어떤 에이전트가 "작업 중"인지, "끝났는지"를 시각적으로 + 알림으로 표시
- 라이더 IDE 같은 다중 분할 + 다중 탭 레이아웃 UX

## 기술 스택

- **셸**: Tauri 2 (Rust 백엔드 + Edge WebView2 프론트)
- **프론트**: React 19 + TypeScript + Vite
- **터미널 에뮬레이터**: `@xterm/xterm` v6 + `addon-fit` + `addon-web-links`
- **PTY**: Rust `portable-pty` 0.8 (Windows에서는 ConPTY)
- **이벤트 IPC**: Tauri 이벤트(`pty:data`, `pty:exit`, `agent:hook-event`)
- **알림**: `tauri-plugin-notification`, 인앱 토스트 fallback
- **폴더 선택**: `tauri-plugin-dialog`
- **Claude/Codex Hook 수신**: Rust 내장 `tiny_http` HTTP 서버 (127.0.0.1:RANDOM_PORT)

## 주요 기능 한눈에

| 기능 | 설명 |
|---|---|
| 에이전트 생성 모달 | 이름·폴더(Browse 다이얼로그)·AI 도구·Dangerous 모드 |
| PowerShell 7 우선 | Store판 `pwsh.exe` → MSI판 → 5.1 → cmd.exe 순 |
| Init 명령 자동 실행 | spawn 후 600ms 뒤 `claude --dangerously-skip-permissions` 등을 자동 입력 |
| 멀티-탭 패널 | 한 패널이 여러 에이전트를 탭으로 묶음 |
| 분할 레이아웃 | 임의 깊이 h/v 분할. 핸들 드래그로 크기 조절 |
| 그룹 개념 | 분할로 묶인 에이전트들이 한 그룹. 사이드바에서 누구를 클릭하든 그 그룹 전체가 보임 |
| 그룹 세션 고정 | 사이드바 우클릭 메뉴에서 현재 저장된 세션 ID를 그룹에 고정. 고정 그룹은 해당 세션으로만 resume하고 외부 에이전트 추가를 막음 |
| 사이드바 그룹 정렬 | 같은 그룹 멤버가 사이드바에서 연속해서 표시 + 구분선 + 왼쪽 막대 |
| 드래그 앤 드롭 | 탭/사이드바 아이템을 패널 위로 끌어서 center=탭 합치기 / 4-edge=분할 재배치 |
| Working/Done 감지 | Claude Code hook(UserPromptSubmit/Stop) → 로컬 HTTP → 노란 펄스/완료 토스트+OS 알림 |
| 영구화 | localStorage에 agents·groups·view(activeGroupId/activePath) 저장 |
| Codex 세션 Resume | 창 닫을 때 자동으로 `/quit` → `codex resume <token>` 토큰 캡처 → 다음 실행 시 자동 재개 (자세한 건 [RESUME.md](RESUME.md)) |
| Ctrl+V 텍스트 paste | 클립보드 텍스트면 xterm 직접 paste, 이미지면 raw Ctrl+V 키스트로크로 PTY 전달 (Codex 이미지 paste 호환) |
| 휠 스크롤 보장 | TUI 앱이 mouse tracking을 켜도 항상 xterm scrollback으로 (capture 단계 가로채기) |
| Ctrl+휠 터미널 줌 | Ctrl을 누른 상태로 마우스 휠을 돌리면 모든 터미널 폰트 크기를 조절하고 저장 |
| Docs 패널 | 활성 에이전트 폴더의 Markdown 파일을 오른쪽 패널에서 렌더링. List/Tree/Hide 탐색 모드, GFM 표, 코드 하이라이트 지원 |
| 터미널 Markdown 링크 | 터미널 출력의 `.md/.markdown` 상대경로·절대경로를 클릭하면 Docs 패널에서 해당 문서 열기 |
| 전역 설정/테마 | 사이드바 상단 `설정` 버튼에서 Soft/GitHub/Warm/Light 테마 선택. 앱 UI, 터미널, Docs 뷰어에 적용 |
| 수동 업데이트 확인 | 설정창에서 현재 버전과 GitHub 최신 릴리즈를 비교하고 릴리즈 페이지를 열 수 있음 |
