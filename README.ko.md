# OneThingChanged MultiAgent

[English](README.md) | **한국어**

[![Version](https://img.shields.io/badge/version-0.6.21-blue)](https://github.com/OneThingChanged/Multiagent/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)](https://github.com/OneThingChanged/Multiagent)

**모든 AI 에이전트 터미널을 하나의 워크스페이스에서.** MultiAgent는 Claude Code, Codex, Qwen, Cline 같은 여러 AI 에이전트 CLI 세션을 프로젝트 단위의 탭과 분할 화면으로 묶어 한 Windows 데스크톱 앱에서 실행·관리하는 도구입니다. hook 기반 상태 감지, 세션 resume, 채팅 뷰, 폰 원격 접속, 토큰 사용량 추적까지 지원합니다.

터미널 창을 여러 개 띄우고 왔다 갔다 하는 대신, 프로젝트를 한 번만 등록하고 그 안에 별명 있는 세션을 만들어 한 창에서 전환·분할·모니터링하세요.

---

## 기능

### 세션 & 레이아웃
- **프로젝트 우선 워크플로** — 프로젝트 폴더를 등록하고, 접이식 사이드바 트리 아래에 별명 세션 생성
- **탭 & 중첩 분할** — 가로/세로 패널, 5존 드래그 앤 드롭(가운데=탭 합치기, 가장자리=분할), 크기 조절 스플리터
- **Screen** — 한 세션은 전역에서 정확히 한 그룹에만 소속. 사이드바의 `Screen 1 (A+B+C)` 요약으로 정확한 레이아웃으로 바로 전환
- **세션 관리** — 재시작, 비활성화(PTY만 종료하고 세션 유지), 별명 변경, 디스크 최신 세션으로 재등록, 그룹을 특정 세션 ID로 고정(PIN)

### 에이전트 상태 & 알림
- **Working/Done 감지** — Claude Code / Codex / Qwen hook이 로컬 HTTP로 보고. 모든 세션에 실시간 상태점 표시 (idle / starting / running / working / exited)
- **완료 알림** — 인앱 토스트 + Windows 알림 + 알림음(시스템음 / 커스텀 파일 / 끄기 선택 가능)
- **Desktop Pet** — 포커스를 뺏지 않는 항상-위 마스코트. idle/working/done 표정, 작업 중·완료 수 배지, 최신 질문 말풍선. 클릭하면 해당 세션으로 이동

### 채팅 뷰
- 원시 터미널 옆에서 쓰는 리치 대화 뷰(transcript 기반 도구 전용): 요약·diff가 있는 도구 호출 블록, 인라인 질문/권한 카드, "작업 중…" 인디케이터
- 세션별 SQLite 이력으로 재시작 후 이전 대화를 복원하고, 오래된 대화를 나눠 불러오며, 에이전트 간 혼합 없이 참조된 산출물 파일을 관리
- 컴포저에 `/` 명령·`@` 파일 자동완성, 클립보드 이미지 붙여넣기, 대용량 붙여넣기 칩 축소, 작업 중 메시지 큐잉, Esc로 취소

### 세션 Resume
- `SessionStart` hook이 각 도구의 세션 ID를 캡처. 세션을 다시 열면 `codex resume <id>` / `claude --resume <id>`가 자동 실행
- 앱 재시작 후에도 스크롤백 스냅샷으로 터미널 화면 복원
- **현재 세션으로 재등록** — 디스크의 최신 transcript를 스캔해 잃어버린 resume 대상을 복구

### 파일, 문서 & Git
- **파일 트리 사이드바** — lazy 로딩 프로젝트 탐색기, git 상태 뱃지, 파일명 검색, 파일 작업 전체(새 파일/복제/이름 변경/삭제/경로 복사)
- **Source Control 뷰** — 브랜치·ahead/behind, Staged/Changes 그룹, 파일별 +/− 수, 커밋 입력, 최근 커밋 목록
- **문서 탭** — Markdown(GFM + 구문 강조), 샌드박스 HTML, 이미지, 읽기전용 텍스트를 터미널 옆 탭으로 렌더. 터미널 출력의 경로를 클릭하면 인앱으로 열림

### 원격 접속
- **Remote PWA** — Cloudflare Tunnel 위에서 폰 브라우저로 세션을 보고 입력 전달. GitHub 로그인 + Owner 승인제로 보호 (standard 빌드 전용)
- **SSH 원격 세션** — 다른 컴퓨터에서 SSH로 에이전트 실행. Windows 원격은 역터널 hook으로 상태점·resume까지 완전 지원

### 모니터링 & 사용량
- **로컬 대시보드** (`127.0.0.1:4421`) — 라이브 세션, hook 상태, 프로젝트 문서, 토큰 사용량을 한 웹 페이지에서 확인
- **사용량 추적** — transcript JSONL을 SQLite로 적재. 프로젝트/세션별 토큰 통계와 차트
- **계정 한도** — Codex(transcript)·Claude(OAuth usage 엔드포인트) 한도를 상태 바에 표시. 70%/90%에서 경고색
- **Resource Manager & Ports 모니터** — 세션별 CPU/메모리 프로세스 트리, 열린 TCP 포트를 프로젝트별로 귀속

### 생산성
- **Quick Open** (`Ctrl+K`) — 프로젝트·세션·Screen·문서·명령 통합 검색
- **Attention Center** — 읽지 않은 대기/차단/완료 항목을 모아 보고 클릭 시 해당 세션으로 이동
- 커스터마이즈 가능한 단축키, 4종 테마(Soft / GitHub / Warm / Light), 멀티 윈도우, 항상 위
- SHA-512 manifest 무결성 검사를 사용하는 GitHub Releases 기반 **자동 업데이트**

## 지원 에이전트

| 에이전트 | 상태 hook | 세션 resume | 채팅 뷰 |
|---|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ (`--resume`) | ✅ |
| Codex | ✅ | ✅ (`resume`) | ✅ |
| Qwen | ✅ | — | — (터미널 전용) |
| Cline | — | — | — (터미널 전용) |
| Shell only | — | — | — |

어떤 CLI든 **Shell only** 모드로 실행 가능합니다 — hook·resume·채팅 없이 터미널만 사용합니다.

## 실행 환경

**런타임:** Windows 10/11, 사용할 에이전트 CLI (`claude`, `codex` 등이 PATH에 있어야 함)

**개발:**

| 도구 | 버전 |
|---|---|
| Node.js | 24+ |
| Visual Studio 2022 Build Tools | "Desktop development with C++" 워크로드 |
| PowerShell | 7+ 권장 (없으면 5.1로 폴백) |

## 시작하기

```bash
cd app
npm install

npm run electron:dev    # Electron 셸 (개발 모드, 4420 포트 HMR)
```

### 빌드 & 테스트

```bash
npm test                       # vitest 단위/통합 테스트

npm run electron:dist          # Electron 인스톨러 (standard)
npm run electron:dist:all      # Electron standard + company
```

Electron 인스톨러, blockmap, 업데이터 manifest는 `app/electron-dist/`에 생성됩니다.

## 빌드 Variant

| Variant | 식별자 | Remote PWA / 터널 |
|---|---|---|
| **standard** | `com.jintae.multiagent.electron` | ✅ 포함 |
| **company** | `com.jintae.multiagent.company.electron` | ❌ 제외 (UI와 백엔드 모두) |

두 variant는 같은 코드·같은 버전을 쓰고, 식별자·업데이트 채널·원격 기능만 다릅니다. 서명 릴리즈와 업데이트 manifest 절차는 [docs/release-playbook.md](docs/release-playbook.md)를 참고하세요.

## 프로젝트 구조

```text
├─ app/                    # 데스크톱 앱
│  ├─ src/                 # React 19 + TypeScript 렌더러
│  ├─ electron/            # 프로덕션 메인 프로세스 + 서비스 (node-pty)
│  ├─ assets/              # Electron 패키징 자산
│  └─ scripts/             # 빌드 / 릴리즈 스크립트
├─ docs/                   # OKF v0.2 프로젝트 지식
├─ SETUP.md                # 설치 안내
└─ LICENSE                 # MIT
```

## 문서

정식 OKF v0.2 지식 인덱스는 [`docs/index.md`](docs/index.md)입니다.

- [product-overview.md](docs/product-overview.md) — 제품 목표, 런타임 구성, 기능과 variant
- [system-architecture.md](docs/system-architecture.md) — Electron 경계, 워크스페이스 모델, 레이아웃과 IPC
- [workspace-interactions.md](docs/workspace-interactions.md) — 지속적인 워크스페이스 상호작용 규칙
- [remote-service.md](docs/remote-service.md) — 인증된 Remote PWA와 Android 접근
- [session-lifecycle-and-resume.md](docs/session-lifecycle-and-resume.md) — PTY 수명주기, 훅, 취소와 provider resume
- [local-dashboard.md](docs/local-dashboard.md) / [usage-accounting.md](docs/usage-accounting.md) — 로컬 Dashboard와 사용량 집계
- [development-and-build.md](docs/development-and-build.md) / [release-playbook.md](docs/release-playbook.md) — 개발, 패키징, 서명과 게시
- [known-limitations.md](docs/known-limitations.md) — 확인된 제약과 재검토 조건

## 라이선스

[MIT](LICENSE)
