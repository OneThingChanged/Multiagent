# Build & Run

## 사전 요구

- **Node.js** 24+
- **Rust** stable (1.95+, rustup 권장)
- **Visual Studio 2022 C++ Build Tools** (MSVC)
- **WebView2** (Windows 11 기본 포함)
- **PowerShell 7+** (없으면 5.1로 폴백)

## 처음 셋업

```bash
cd K:\AI\MultiAgent\app
npm install
```

## 개발 모드 (HMR)

```bash
cd K:\AI\MultiAgent\app
npm run tauri dev
```

- Vite 1420 포트 + Tauri가 Rust 빌드 후 `target/debug/app.exe` 실행
- `src/**` 변경 → Vite HMR 즉시 반영
- `src-tauri/**` 변경 → Tauri watcher가 자동 재컴파일 + 앱 재시작
- 윈도우 닫으면 dev 세션 종료. 다시 띄우려면 `npm run tauri dev`

## 디버그 빌드

```bash
cd K:\AI\MultiAgent\app
npm run tauri -- build --debug
```

산출물 경로:

| 종류 | 경로 |
|---|---|
| 디버그 EXE | `src-tauri/target/debug/app.exe` |
| 디버그 NSIS 인스톨러 | `src-tauri/target/debug/bundle/nsis/MultiAgent_0.2.0_x64-setup.exe` |
| 디버그 MSI 인스톨러 | `src-tauri/target/debug/bundle/msi/MultiAgent_0.2.0_x64_en-US.msi` |

디버그 빌드는 dev profile이라 최적화가 약하지만, 릴리즈보다 빌드가 빠르고 로컬 확인용으로 적합.

## 릴리즈 빌드

```bash
cd K:\AI\MultiAgent\app
npm run tauri build
```

산출물 경로:

| 종류 | 크기 | 경로 |
|---|---|---|
| 단독 실행 EXE | ~9-10MB | `src-tauri/target/release/app.exe` |
| NSIS 인스톨러 | ~2MB | `src-tauri/target/release/bundle/nsis/MultiAgent_0.2.0_x64-setup.exe` |
| MSI 인스톨러 | ~3MB | `src-tauri/target/release/bundle/msi/MultiAgent_0.2.0_x64_en-US.msi` |

> Cargo 패키지 이름이 `app`이라 단독 EXE는 `app.exe`로 빌드됨. `MultiAgent.exe`로 바꾸려면 `Cargo.toml`의 `[package].name`을 변경 (`[lib].name`은 유지).

코드 서명을 안 했으므로 첫 실행 시 Windows SmartScreen 경고. "추가 정보 → 실행" 으로 진행.

## dev 트러블슈팅

- **포트 1420 점유**: `Get-NetTCPConnection -LocalPort 1420 | Stop-Process` 또는 vite 띄운 node를 죽임
- **`target\debug\app.exe` 락**: 이전 app.exe가 살아있어 덮어쓰기 실패. `taskkill /F /IM app.exe`
- **rebuild 너무 오래**: cargo가 changed crate 만 컴파일. 첫 dev 빌드만 2-3분. 이후 Rust 소스만 바꿔도 ~20s 내
- **Hook이 안 fire**: `%LOCALAPPDATA%\com.jintae.multiagent\hook.log`에서 진단 (notify.ps1이 매 호출마다 timestamp + event + agent + 결과 기록)
