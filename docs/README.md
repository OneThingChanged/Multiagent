# MultiAgent 문서

여러 AI 에이전트(Claude Code · Codex) 터미널을 프로젝트별 세션·그룹·탭·분할로 관리하고, 외부 브라우저에서 원격 조작하며, 토큰 사용량을 집계하는 Tauri 데스크톱 앱.

## 문서 구성

### 개요·설계
- **[OVERVIEW.md](OVERVIEW.md)** — 목적, 기술 스택, 전체 기능 카탈로그
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — 프로세스 구조, Rust 백엔드/React 프론트 모델, hook·창 닫기, 레이아웃 트리, 커맨드, 영구화

### 기능
- **[UX.md](UX.md)** — 조작법 전체 (사이드바·우클릭 메뉴·검색·드롭존·단축키·뷰어·알림·설정 탭)
- **[RESUME.md](RESUME.md)** — 세션 resume 흐름, session_id 캡처, 현재 세션 재등록, 한계
- **[MONITOR.md](MONITOR.md)** — 활성 세션/split/hook/docs/usage를 합쳐 보는 단일 로컬 Dashboard
- **[REMOTE.md](REMOTE.md)** — 원격 접속(axum 서버·Cloudflare 터널·GitHub 인증·계정 승인·웹 클라이언트)
- **[USAGE_DASHBOARD.md](USAGE_DASHBOARD.md)** — 토큰 사용량 수집·SQLite·대시보드와 Electron 계정 한도 상태 바

### 빌드·배포·이슈
- **[BUILD.md](BUILD.md)** — 개발·디버그·릴리즈 빌드, 트러블슈팅
- **[ELECTRON_MIGRATION.md](ELECTRON_MIGRATION.md)** — Electron 1~5단계 구현, 검증 결과, 전환 판단
- **[RELEASE.md](RELEASE.md)** — 코드 서명 + GitHub 릴리즈 게시 + 자동 업데이터 절차/체크리스트
- **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — 알려진 제약 + 남은 개선 후보

## 빠른 시작

```bash
cd K:\AI\MultiAgent\app
npm install
npm run tauri dev        # 개발 (dev 포트 4420)
```

릴리즈 빌드·서명·배포는 [RELEASE.md](RELEASE.md), 빌드 환경 요구사항은 [BUILD.md](BUILD.md).
