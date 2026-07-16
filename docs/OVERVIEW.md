# MultiAgent — Overview

여러 AI 에이전트(Claude Code, Codex) 터미널 세션을 프로젝트 단위로 한 창에서 그룹·탭·분할로 관리하고, 외부 브라우저에서 원격 조작하며, 토큰 사용량을 집계하는 데스크톱 앱.

## 목적

- 여러 프로젝트에서 동시에 Claude/Codex를 돌릴 때, OS 터미널 창을 여러 개 띄우지 않고 한 윈도우에서 전환·정리
- 어떤 에이전트가 "작업 중"인지 "끝났는지"를 상태점 + 알림(소리 포함)으로 표시
- IDE 같은 다중 분할 + 다중 탭 레이아웃
- 집 밖/다른 PC에서도 브라우저로 접속해 세션을 보고 명령
- 도구·세션·프로젝트별 토큰 소비를 대시보드로 파악

## 기술 스택

- **셸**: Tauri 2 (Rust 백엔드 + WebView2 프론트), standard / company 두 빌드 variant
- **프론트**: React 19 + TypeScript + Vite (dev 포트 4420)
- **터미널**: `@xterm/xterm` v6 + addon-fit / -search / -serialize / -web-links
- **PTY**: Rust `portable-pty` (Windows ConPTY)
- **로컬 HTTP(hook 수신)**: `tiny_http` (127.0.0.1:랜덤)
- **원격 서버**: `axum` + `tokio` (WebSocket), Cloudflare Tunnel(`cloudflared`)
- **사용량 DB**: `rusqlite`(SQLite)
- **인증**: GitHub Device Flow / OAuth 웹 flow
- **업데이트**: `tauri-plugin-updater` (서명된 GitHub 릴리즈 자동 설치)
- **기타 플러그인**: notification / dialog / opener / process

## 기능 카탈로그

### 세션·레이아웃
| 기능 | 설명 |
|---|---|
| 프로젝트/세션 모델 | 프로젝트 등록 → 접이식 트리 안에 별명 세션 생성 |
| 멀티 탭 / 분할 | 한 패널에 여러 탭, 한 Screen에 2개 이상의 h/v 패널과 중첩 분할, 핸들로 크기 조절 |
| 그룹 | 분할로 묶인 세션들이 한 그룹 — 누굴 클릭하든 그룹 전체 표시. 한 세션은 전역에서 정확히 한 그룹에만 소속 |
| 분할 Screen 요약 | 사이드바의 `This PC`/프로젝트 트리 위에 `Screen N (A+B+C)`를 표시하고, 교차 프로젝트 멤버에도 같은 색 `SN` 배지를 표시. 행은 세션 검색이 아닌 Screen ID로 직접 전환 |
| 드래그 앤 드롭 | 탭/사이드바 세션을 5존 드롭(center=탭, 4-edge=다중 패널 분할)으로 재배치. 다른 Screen으로 옮기면 기존 소속에서 제거 |
| 그룹 세션 고정 | 그룹을 특정 세션 ID로 고정(PIN), 외부 세션 추가 차단 |
| 1줄 사이드바 | 프로젝트·세션을 한 줄로 압축 표시 |
| 프로젝트 재정렬 | 사이드바에서 프로젝트 드래그로 순서 변경 |
| 검색 | 사이드바 상단에서 프로젝트명·세션명 필터 |
| SSH 원격 세션 | 프로젝트를 등록된 SSH 호스트에 연결 → 세션이 원격 머신에서 실행 (Windows 원격은 상태점+resume까지, 아래 별도 항목) |

### 세션 관리 (우클릭 메뉴)
전환 / 탭 추가 / 좌우·상하 분할 / 별명 변경 / **세션 재시작** / **세션 비활성화**(화면에 안 보일 때만, PTY만 종료해 리소스 해제) / **현재 세션으로 재등록**(디스크 최신 세션 찾아 resume 대상 갱신) / 그룹 세션 고정·해제 / **속성**(세션 ID·생성 시각·도구·폴더 등). 프로젝트 우클릭: 이름 변경 / 삭제 / 속성.

### 상태·알림
| 기능 | 설명 |
|---|---|
| Working/Done 감지 | Claude/Codex hook(UserPromptSubmit/Stop) → 로컬 HTTP → 상태점(노란 펄스/초록) |
| 알림 | 완료 시 인앱 토스트 + OS 알림 + **알림음**(시스템음/커스텀 파일/끄기, 설정에서 선택) |
| Desktop Pet | 포커스를 받지 않는 항상-위 펫 창으로 idle/working/done과 작업·완료 수를 표시. 작업 배지를 누르면 세션·도구·최신 질문을 보고, 항목/완료 말풍선을 클릭하면 해당 세션으로 이동 |
| 세션 Resume | SessionStart hook으로 session_id 캡처 → 다음 실행 시 `codex resume`/`claude --resume` ([RESUME.md](RESUME.md)) |
| 스크롤백 복원 | 종료 직전 스크롤백 저장 → 재시작 시 복원 |

### 뷰어·터미널
| 기능 | 설명 |
|---|---|
| Docs 패널 | 프로젝트 폴더의 `.md`/`.html` 파일 렌더 (List/Tree/Hide, GFM·코드 하이라이트, HTML은 sandbox iframe) |
| 이미지 뷰어 | 터미널 출력의 이미지 경로(png/jpg/…) 클릭 → 인앱 뷰어 |
| 문서 링크 | 터미널의 `.md`/`.html` 경로 클릭 → Docs 패널 (프로젝트 폴더 밖도 열림) |
| Ctrl+Enter | 줄바꿈 입력 (IME 합성 안전 처리) |
| Ctrl+F | 터미널 검색 |
| Ctrl+C/V | 텍스트 복사/붙여넣기, 이미지 클립보드는 raw 키스트로크 |
| Ctrl+휠 | 터미널 폰트 줌 (저장됨) |
| 휠 스크롤 | 일반 버퍼는 항상 scrollback(mouse tracking 무시), 전체화면 TUI는 휠을 TUI에 전달(마우스 휠 이벤트 또는 PageUp/Down) |

### 단축키
`Ctrl+T` 새 세션 · `Ctrl+Shift+P` 새 프로젝트 · `Ctrl+W` 활성 탭 닫기 ·
`Ctrl+Shift+T` 최근 닫은 탭 복원 · `Ctrl+1~9` 탭 전환 · `Ctrl+F` 검색 ·
`Esc` 검색/Docs 닫기.

### 원격 접속 ([REMOTE.md](REMOTE.md))
내장 axum 웹 서버 + Cloudflare Tunnel(quick/named, 고정 도메인 가능) + GitHub 로그인 + **계정 승인제**. 외부 브라우저에서 세션 목록·터미널·입력. 독립 뷰어(데스크탑과 다른 세션을 따로 봄).

### SSH 원격 세션
같은 망(또는 사내망/VPN)으로 닿는 다른 컴퓨터에 SSH로 접속해 그 머신에서 셸/claude/codex 실행. 설정 → **SSH Hosts** 탭에서 호스트(host/user/port/identity/extraOptions/Remote OS) 등록 후(**사용 방법** 버튼에 단계별 가이드 + 공개키 복사/생성), New Project에서 **"Run on remote host"**로 호스트+원격 폴더 지정. 백엔드는 로컬 PowerShell 대신 `ssh -tt`로 PTY를 띄운다(Windows 내장 OpenSSH). Windows 원격은 npm `.ps1` 실행 정책 오류를 피하려고 기본적으로 `codex.cmd`/`claude.cmd` shim을 사용한다.
- **Windows 원격(Phase 2)**: `ssh -R` 역터널 + 원격 hook 푸시로 **working/done 상태점 + 세션 resume**까지 동작(로컬과 동일).
- **POSIX(Linux/macOS) 원격**: 셸·도구 실행은 정상, 상태점은 running까지(상태/resume은 후속 Phase). 사용량 집계는 원격 전체 미지원.
- 상세·제약은 [KNOWN_ISSUES.md](KNOWN_ISSUES.md), resume 흐름은 [RESUME.md](RESUME.md).

### 사용량 대시보드 ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md))
transcript JSONL을 파싱해 토큰 사용량을 SQLite에 적재, 별도 로컬 웹 대시보드(차트·요약·세션별)로 시각화.

### 기타
| 기능 | 설명 |
|---|---|
| 자동 업데이트 | 설정 → About → Check, 서명 검증 후 다운로드·설치·재시작 ([RELEASE.md](RELEASE.md)) |
| 멀티 윈도우 | 새 창 열기 |
| 항상 위 | always-on-top 토글 |
| 테마 | Soft / GitHub / Warm / Light (앱·터미널·Docs 공통) |
| 영구화 | localStorage(projects/agents/groups/view/theme/…) + 로컬 JSON/SQLite(원격·사용량). groups는 현재 목록을 authoritative하게 저장하고 구버전 중복은 Screen 우선으로 자동 정규화 |
