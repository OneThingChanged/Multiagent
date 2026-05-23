# MultiAgent 문서

여러 AI 에이전트 터미널을 프로젝트별 세션, 그룹, 탭, 분할로 관리하는 Tauri 데스크톱 앱.

## 문서 구성

- **[OVERVIEW.md](OVERVIEW.md)** — 목적, 기술 스택, 기능 요약
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — 프로세스 구조, Rust 백엔드 / React 프론트 데이터 모델, hook / 창 닫기 인터셉트
- **[UX.md](UX.md)** — 조작법 (사이드바·탭·드롭존·상태점·창 닫기·paste)
- **[RESUME.md](RESUME.md)** — Codex 세션 resume 동작 흐름, 토큰 캡처/사용, 한계
- **[BUILD.md](BUILD.md)** — 개발·릴리즈 빌드 방법, 트러블슈팅
- **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — 알려진 제약 + 향후 개선 후보

## 빠른 시작

```bash
cd K:\AI\MultiAgent\app
npm install
npm run tauri dev
```

자세한 건 [BUILD.md](BUILD.md).
