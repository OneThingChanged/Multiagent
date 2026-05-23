# MultiAgent — Portable Setup

이 폴더를 통째로 새 PC에 복사한 뒤 아래 순서대로.

## 1. 사전 설치 (한 번만)

| 도구 | 버전 | 설치 |
|---|---|---|
| **Node.js** | 24+ | https://nodejs.org/ (LTS) — `node -v` 로 확인 |
| **Rust toolchain** | 1.95+ stable | https://rustup.rs/ — `rustup-init.exe` 실행 후 기본값 |
| **Visual Studio 2022 Build Tools** | latest | https://visualstudio.microsoft.com/visual-cpp-build-tools/ → **"Desktop development with C++"** 워크로드 체크 |
| **PowerShell 7+** | 7.4+ 권장 | Microsoft Store 또는 https://github.com/PowerShell/PowerShell/releases (없으면 Windows PowerShell 5.1로 자동 폴백) |
| **WebView2** | — | Windows 11엔 이미 포함. Windows 10이면 Microsoft Edge 설치돼 있으면 OK |

> Rust 설치 후 새 터미널 열어야 PATH 반영됨.

옵션:
- **Claude Code CLI** — `claude` 명령이 PATH에 있어야 에이전트가 동작. https://docs.anthropic.com/en/docs/claude-code
- **Codex CLI** — `codex` 명령. https://developers.openai.com/codex/cli

(둘 다 없어도 앱은 떠요. "Shell only" 모드만 됨)

## 2. 의존성 받기

```powershell
cd <이폴더>/app
npm install
```

- 약 ~30초, 90MB
- `node_modules/` 가 생김 (앱 폴더에서만 필요)

## 3. 실행

### 개발 모드 (HMR, 코드 수정하면 즉시 반영)
```powershell
npm run tauri dev
```
- 첫 cargo 빌드 2~3분 (Rust deps 컴파일 + tauri 본체)
- 이후엔 ~20초 내

### 릴리즈 빌드 (배포용 EXE/MSI/NSIS)
```powershell
npm run tauri build
```
- 1~3분 (incremental은 1분 내)
- 결과물:
  - `app/src-tauri/target/release/app.exe` — 단독 실행 ~11MB
  - `app/src-tauri/target/release/bundle/msi/MultiAgent_0.1.0_x64_en-US.msi`
  - `app/src-tauri/target/release/bundle/nsis/MultiAgent_0.1.0_x64-setup.exe`

### 테스트 실행
```powershell
npm test
```
Vitest 18개 케이스. 트리 연산 회귀 검증.

## 4. 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| `cargo: command not found` | Rust 설치 후 터미널 재시작 |
| `link.exe not found` 또는 `MSVC linker error` | VS Build Tools에서 C++ workload 안 깔림 |
| `webview2 not found` 런타임 | Edge/WebView2 Runtime 설치: https://developer.microsoft.com/microsoft-edge/webview2/ |
| Vite 1420 포트 점유 | `Get-NetTCPConnection -LocalPort 1420 \| Stop-Process` |
| `app.exe` 락 (rebuild 실패) | 이전 앱 안 죽었음: `taskkill /F /IM app.exe` |
| Claude/Codex 에이전트가 spawn은 되는데 코드 실행 안 됨 | `claude` / `codex` 명령이 PATH에 없는 거. PowerShell에서 `claude --version` 으로 확인 |

## 5. 폴더 구조 (포함된 파일 요약)

```
_export/
├─ SETUP.md            ← 이 파일
├─ docs/               ← 프로젝트 문서 (ARCHITECTURE, RESUME, UX, BUILD, KNOWN_ISSUES, README)
└─ app/
   ├─ package.json + package-lock.json  ← npm deps 고정
   ├─ tsconfig*.json, vite.config.ts, index.html
   ├─ .vscode/extensions.json
   ├─ public/          ← 정적 에셋 (svg)
   ├─ src/             ← React 프론트엔드
   │  ├─ App.tsx, main.tsx, App.css, types.ts
   │  ├─ lib/          ← layout / persistence / terminal / path / groupOps + groupOps.test
   │  └─ components/   ← Sidebar / TerminalArea / PaneSlot / Splitter / NewAgentModal / Toast / Menus
   └─ src-tauri/       ← Rust 백엔드
      ├─ Cargo.toml + Cargo.lock  ← cargo deps 고정
      ├─ tauri.conf.json, build.rs
      ├─ capabilities/default.json
      ├─ icons/        ← 앱 아이콘 세트
      └─ src/lib.rs + main.rs
```

**포함 안 된 것** (새 PC에서 자동 생성됨):
- `node_modules/` — `npm install` 로
- `src-tauri/target/` — `cargo build` (tauri dev/build이 알아서)
- `src-tauri/gen/schemas/` — Tauri 빌드 시 자동
- `dist/` — Vite 빌드 산출물

총 크기: ~737KB, 61개 파일. 압축하면 더 작아져요.
