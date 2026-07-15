# Electron 전환 실험

## 상태

- 브랜치: `experiment/electron-shell`
- 기준 버전: MultiAgent `0.5.28`
- 목적: 기존 React UI를 유지하면서 Tauri/Rust host를 Electron main + `node-pty`로
  교체할 수 있는지 검증한다.
- 현재 단계: 로컬 터미널 중심의 vertical slice. production 대체본은 아니다.

main 브랜치는 그대로 유지한다. renderer는 `app/src/platform/`의 얇은 bridge를 통해
Electron과 Tauri 양쪽에서 빌드되므로, 기능 이식 중에도 기존 Tauri 경로를 회귀 테스트할
수 있다.

## 현재 동작하는 범위

- 보안 설정을 적용한 Electron main window와 preload bridge
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - 외부 URL은 OS 브라우저로 전달
- `node-pty` 기반 로컬 PowerShell PTY spawn/write/resize/kill
- 기존 xterm.js renderer와 PTY event 연결
- 여러 앱 창 열기와 앱 종료 시 PTY 정리
- Desktop Pet 생성, 표시/숨김, 위치 초기화, 상태 event 전달
- 파일/폴더 선택과 drag & drop 경로 변환
- Markdown 목록/읽기, 이미지 data URL 읽기
- 로컬 파일 열기, 폴더 열기, 탐색기에서 표시, 외부 URL 열기
- 개발 실행, PTY 단독 smoke test, 전체 bridge smoke test, unpacked package 생성

## 아직 production parity가 아닌 범위

- Claude/Codex Hook 설치·상태 수집·자가 복구
- 기존 provider session 탐색과 정확한 resume/relink
- SSH PTY와 SSH 키 생성
- Remote server, Cloudflare Tunnel, 접근 승인
- Monitor/dashboard server와 사용량 SQLite ingest
- Electron auto-update와 서명된 installer release 파이프라인
- Tauri 저장 데이터와 Electron 저장 데이터 migration
- native notification 세부 정책과 clipboard 명령

미구현 backend command는 UI를 깨지 않도록 안전한 빈 상태를 반환하거나 명시적인
오류를 낸다. 따라서 현재 Electron 화면의 Hook 표시, 원격 기능, 사용량 정보는 실제
production 상태로 해석하면 안 된다.

## 실행과 검증

`app` 폴더에서 실행한다.

```powershell
npm run electron:dev
npm run electron:smoke
npm run electron:bridge-smoke
npm run electron:pack
npm run electron:packaged-smoke
```

- 개발 renderer는 기존 프로젝트 설정에 맞춰 `127.0.0.1:24420`을 사용한다.
- `electron:bridge-smoke`는 Renderer → preload → main IPC → `node-pty` → PowerShell →
  renderer event 왕복을 검증한다.
- `electron:pack` 결과는 `app/electron-dist/win-unpacked/`에 생성하며 Git에는 포함하지
  않는다.
- `electron:packaged-smoke`는 위 산출물 안의 `app.asar`와 unpack된 `node-pty`까지 같은
  왕복 테스트로 검증한다.
- Windows의 Electron 압축 해제 rename 잠금을 피하고 설치된 Electron과 정확히 같은
  runtime을 패키징하기 위해 `electronDist`는 `app/node_modules/electron/dist`를 사용한다.

## 저장 데이터 주의사항

Electron dev URL, Electron package의 `file://` origin, Tauri WebView origin은 서로 다른
localStorage 영역이다. 그래서 Electron을 처음 실행하면 Tauri에서 등록한 프로젝트와
세션이 비어 보일 수 있다. 데이터가 지워진 것이 아니다.

전환 전에 프로젝트, Screen, Agent, session ID, Pet 설정을 versioned JSON 또는 host
저장소로 옮기고 다음 migration을 제공해야 한다.

1. Tauri 저장 데이터 export
2. Electron 첫 실행 시 import와 schema validation
3. 원본 보존 및 실패 시 rollback
4. 동일 데이터로 Tauri/Electron 양쪽 resume fixture 검증

## 다음 구현 순서

1. Hook server와 provider adapter를 Electron main으로 옮기고 자가 복구 contract test를
   추가한다.
2. provider session ID와 PTY ID를 분리해 resume/relink를 구현한다.
3. SSH, Remote, Monitor, usage ingest를 각각 main service로 이식한다.
4. Tauri → Electron 데이터 migration을 만든다.
5. updater, code signing, NSIS/portable 설치본을 별도 테스트 PC에서 검증한다.
6. 두 runtime의 기능 parity 표와 장시간 PTY/스크롤백 soak test가 통과한 뒤 main 전환을
   결정한다.

## 전환 판단 기준

- 기존 프로젝트와 세션이 손실 없이 migration되고 resume된다.
- Hook 누락과 복구 결과가 현재 production보다 나빠지지 않는다.
- 다중 패널, 다중 Screen, Pet count가 동일 session을 중복 집계하지 않는다.
- 장시간 출력, 숨은 pane, 창 재생성 후에도 스크롤백과 PTY가 안정적이다.
- 설치·업데이트·앱 종료가 main window와 Pet을 하나의 앱 수명주기로 처리한다.
- Windows 다른 PC에서 서명된 설치본과 `node-pty` prebuild가 동작한다.
