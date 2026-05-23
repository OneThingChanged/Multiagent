# OneThingChanged MultiAgent

**Current version:** `0.1.0`

OneThingChanged MultiAgent is a Tauri desktop app for running and organizing multiple AI-agent terminal sessions in one workspace.

---

## 한국어

### 소개

OneThingChanged MultiAgent는 Codex, Claude, Shell 같은 여러 터미널 기반 에이전트를 하나의 데스크톱 앱에서 관리하기 위한 도구입니다.

여러 프로젝트나 여러 에이전트를 동시에 켜 두고 작업할 때, 터미널 창을 계속 바꾸지 않아도 되도록 사이드바, 탭, 분할 화면, Markdown 문서 뷰어를 한 화면에 모아 둔 앱입니다.

### 주요 기능

- 여러 에이전트 세션을 사이드바에서 생성하고 전환
- 터미널을 탭으로 관리
- 터미널 화면을 분할해서 여러 세션을 동시에 확인
- 드래그 앤 드롭으로 탭과 패널 위치 조정
- `Ctrl+C`는 선택 영역 복사, `Ctrl+V`는 붙여넣기
- `Ctrl + 마우스 휠`로 터미널 글자 크기 확대/축소
- 오른쪽 Markdown 문서 패널 제공
- 문서 목록을 `List`, `Tree`, `Hide` 모드로 전환
- 터미널에 출력된 `.md` 경로를 클릭해서 문서 패널에서 열기
- 문서 패널과 터미널 영역 사이의 크기 조절
- 앱 전체 테마 설정: Soft, GitHub, Warm, Light

### 화면 구성

- **왼쪽 사이드바**: 에이전트 목록, Markdown 패널 토글, 설정, 새 에이전트 추가
- **가운데 작업 영역**: 탭/분할 터미널
- **오른쪽 Docs 패널**: 프로젝트 Markdown 문서 목록과 미리보기

### 실행 환경

이 프로젝트는 Tauri 2, React, TypeScript, Rust 기반입니다.

개발 실행에는 다음 도구가 필요합니다.

- Node.js / npm
- Rust / Cargo
- Windows 환경의 Tauri 빌드 도구
- 사용할 에이전트 CLI, 예: Codex CLI, Claude CLI 등

### 개발 실행

```bash
cd app
npm install
npm run tauri dev
```

### 릴리즈 빌드

```bash
cd app
npm run tauri build
```

Windows 릴리즈 빌드 후 산출물은 보통 아래 경로에 생성됩니다.

```text
app/src-tauri/target/release/bundle/nsis/
app/src-tauri/target/release/bundle/msi/
```

`nsis` 폴더의 `*-setup.exe` 파일은 일반 사용자에게 배포하기 좋은 설치 파일입니다.

### 프로젝트 구조

```text
.
├─ app/                 # Tauri + React 앱
│  ├─ src/              # React/TypeScript 프론트엔드
│  └─ src-tauri/        # Rust/Tauri 백엔드
├─ docs/                # 프로젝트 문서
├─ SETUP.md             # 초기 설정 메모
├─ README.md            # 프로젝트 소개 문서
└─ LICENSE              # MIT License
```

### 문서

자세한 내부 구조와 작업 기록은 `docs/` 폴더에 정리되어 있습니다.

- `docs/OVERVIEW.md`: 프로젝트 개요
- `docs/ARCHITECTURE.md`: 구조와 주요 모듈
- `docs/UX.md`: UI/UX 동작 방식
- `docs/BUILD.md`: 빌드 방법
- `docs/KNOWN_ISSUES.md`: 알려진 이슈
- `docs/RESUME.md`: 작업 재개용 메모

### 라이선스

이 프로젝트는 MIT License를 사용합니다.

---

## English

### Overview

OneThingChanged MultiAgent is a desktop app for managing multiple terminal-based AI agents such as Codex, Claude, and Shell sessions in a single workspace.

It is designed for workflows where several projects or agent sessions need to stay open at the same time. Instead of switching between many terminal windows, the app provides a sidebar, tabs, split panes, and a Markdown documentation viewer in one interface.

### Features

- Create and switch between multiple agent sessions from the sidebar
- Manage terminal sessions with tabs
- Split the terminal workspace to view multiple sessions at once
- Reorganize tabs and panes with drag and drop
- `Ctrl+C` copies the selected terminal text, `Ctrl+V` pastes
- `Ctrl + mouse wheel` zooms terminal text in and out
- Right-side Markdown documentation panel
- Documentation navigation modes: `List`, `Tree`, and `Hide`
- Click `.md` paths printed in the terminal to open them in the Docs panel
- Resizable boundary between the terminal workspace and the Docs panel
- Global app themes: Soft, GitHub, Warm, and Light

### Layout

- **Left sidebar**: agent list, Markdown panel toggle, settings, and new-agent button
- **Center workspace**: tabbed and split terminal panes
- **Right Docs panel**: Markdown file navigation and rendered preview

### Requirements

This project is built with Tauri 2, React, TypeScript, and Rust.

For local development, install:

- Node.js / npm
- Rust / Cargo
- Tauri build requirements for Windows
- The agent CLI tools you want to use, for example Codex CLI or Claude CLI

### Development

```bash
cd app
npm install
npm run tauri dev
```

### Release Build

```bash
cd app
npm run tauri build
```

On Windows, release artifacts are usually generated under:

```text
app/src-tauri/target/release/bundle/nsis/
app/src-tauri/target/release/bundle/msi/
```

The `*-setup.exe` file in the `nsis` folder is the recommended installer for general distribution.

### Project Structure

```text
.
├─ app/                 # Tauri + React app
│  ├─ src/              # React/TypeScript frontend
│  └─ src-tauri/        # Rust/Tauri backend
├─ docs/                # Project documentation
├─ SETUP.md             # Setup notes
├─ README.md            # Project overview
└─ LICENSE              # MIT License
```

### Documentation

More detailed notes are available in the `docs/` directory.

- `docs/OVERVIEW.md`: project overview
- `docs/ARCHITECTURE.md`: architecture and major modules
- `docs/UX.md`: UI/UX behavior
- `docs/BUILD.md`: build instructions
- `docs/KNOWN_ISSUES.md`: known issues
- `docs/RESUME.md`: resume notes for future work

### License

This project is licensed under the MIT License.
