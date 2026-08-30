# MultiAgent — 개발 및 빌드 설정

MultiAgent 데스크톱 앱은 Electron 단일 런타임을 사용합니다.

## 1. 사전 설치

| 도구 | 버전 | 용도 |
|---|---|---|
| **Node.js** | 24+ | 프런트엔드, Electron, 빌드 스크립트 |
| **Visual Studio 2022 Build Tools** | latest | `node-pty` 네이티브 모듈. **Desktop development with C++** 워크로드 필요 |
| **PowerShell** | 7+ 권장 | 개발·검증 스크립트 |

실행할 AI CLI(`codex`, `claude` 등)는 각각 PATH에서 찾을 수 있어야 합니다.
CLI가 없어도 앱은 실행되지만 해당 에이전트 세션은 시작할 수 없습니다.

배포용 `MultiAgent-Setup-<version>-x64.exe`에는 Electron 런타임이 포함되므로,
일반 사용자는 Node.js나 개발 도구를 설치할 필요가 없습니다.

## 2. 의존성 설치

```powershell
cd "K:\AI\MultiAgent\app"
npm install
```

## 3. 개발 실행

```powershell
npm run electron:dev
```

Vite 개발 서버는 고정 포트 `4420`을 사용하고 Electron 호스트가 이 서버를
불러옵니다. PTY, preload, 내장 브라우저, 트레이와 로컬 서비스는 Electron
메인 프로세스가 소유합니다.

## 4. 테스트와 빌드

```powershell
npm test
npm run build
npm run electron:smoke
```

Company 인스톨러:

```powershell
npm run electron:dist:company
```

Standard 인스톨러는 Remote에서 내려받을 서명된 Android APK를 검증한 뒤
패키징합니다. 로컬 APK 경로와 허용 인증서 SHA-256을 설정한 다음 실행합니다.

```powershell
$env:MULTIAGENT_MOBILE_APK_PATH = "<서명된 APK 절대경로>"
$env:MULTIAGENT_ANDROID_CERT_SHA256 = "<인증서 SHA-256>"
npm run electron:dist
```

두 Windows variant를 차례로 빌드하려면 다음 명령을 사용합니다.

```powershell
npm run electron:dist:all
```

모든 Electron 산출물은 `app/electron-dist/` 아래에 생성됩니다. 실제 릴리스의
서명·APK 검증·게시 순서는 `docs/release-playbook.md`를 따릅니다.

## 5. 트러블슈팅

| 증상 | 확인 방법 |
|---|---|
| `node-pty` 설치/로딩 실패 | Visual Studio Build Tools의 C++ 워크로드와 현재 Node.js 아키텍처 확인 |
| Vite 4420 포트 점유 | `Get-NetTCPConnection -LocalPort 4420`으로 PID를 확인하고 해당 개발 프로세스만 종료 |
| 패키징 중 APK 검증 실패 | APK 경로, package name, 버전, 인증서 SHA-256 확인 |
| 에이전트가 시작되지 않음 | PowerShell에서 `codex --version` 또는 `claude --version` 확인 |
| 패키징 앱과 개발 앱 상태가 다름 | `npm run electron:packaged-smoke`와 lifecycle smoke 실행 |

## 6. 주요 폴더

```text
MultiAgent/
├─ app/
│  ├─ assets/           # Electron 패키징 자산
│  ├─ electron/         # 메인 프로세스, preload, 서비스, IPC
│  ├─ scripts/          # 개발·빌드·검증 스크립트
│  ├─ src/              # React + TypeScript 렌더러
│  └─ package.json      # Electron Builder와 npm 명령
├─ docs/                # OKF v0.2 프로젝트 문서
├─ mobile/              # Android 앱
├─ site/                # 공개 소개 페이지
└─ SETUP.md
```

`node_modules/`, `app/dist/`, `app/electron-dist/`, `mobile/artifacts/`는 생성
산출물이며 Git에 커밋하지 않습니다.
