# Electron 전환 실험

## 결론

`experiment/electron-shell` 브랜치에서 1~5단계 구현과 설치형 smoke test까지 완료했다.
Electron은 이제 로컬 실사용 후보로 실행할 수 있지만, 바로 main/Tauri 배포본을 대체하지는
않는다. 원격 웹 터미널의 표현력, 첫 Electron 업데이트 채널, 다른 Windows PC의 장시간
검증을 끝낸 뒤 전환을 결정한다.

- 기준 버전: `0.5.28`
- renderer: 기존 React/xterm.js를 Tauri와 Electron이 공유
- Electron host: `app/electron/main.mjs`
- preload API: `app/electron/preload.cjs`
- 개발 포트: `4420` (HMR 보조 포트 `4422`)
- 패키지 앱 ID: `com.jintae.multiagent.electron`

## 1단계 — 보안 경계

완료한 항목:

- `contextIsolation: true`, `nodeIntegration: false`, renderer sandbox 사용
- preload command/event allowlist와 main의 sender/frame/origin 재검증
- 외부 top-level navigation, popup, renderer permission 요청 차단
- HTTP(S) 링크는 OS 브라우저로만 전달
- CSP 적용. 패키지 `file://` renderer와 개발 origin만 허용
- 악성 `data:` navigation을 시도하고 원래 renderer에 남는 lifecycle smoke test 추가

renderer가 임의 명령 이름으로 Node/PTY에 접근하는 범용 IPC는 없다. 새 command를 추가할
때는 preload allowlist와 main switch를 모두 명시적으로 변경해야 한다.

## 2단계 — Hook, 상태, resume

`app/electron/services/hook-service.mjs`가 다음을 담당한다.

- loopback 임의 포트 + 세션 토큰 Hook HTTP 서버
- UTF-8 `notify.ps1`, `hook-info.json`, `hook.log`
- 사용자 Hook을 보존하는 Claude JSON/Codex TOML managed merge
- 실행 중 PTY와 설정을 비교하는 설정 > **Hook 점검 및 복구**
- 포트가 바뀐 경우 `hook-info.json` fallback으로 살아 있는 helper 자동 복구
- SSH 세션의 `ssh -R` 역방향 포워딩과 원격 Node bootstrap
- Windows/POSIX 원격의 Claude/Codex Hook 파일 생성

`app/electron/services/session-service.mjs`는 Codex/Claude transcript를 스캔해 선호 session ID를
검증하고, 없으면 같은 작업 폴더의 최신 세션으로 resume/relink한다. PowerShell helper를
실제로 실행해 한글 prompt가 HTTP event까지 보존되는 테스트가 포함돼 있다.

## 3단계 — 터미널 신뢰성

- `node-pty`의 spawn/write/resize/kill과 packaged native module 왕복 확인
- Codex가 내보내는 `CSI 3 J`만 chunk 경계까지 추적해 제거. 다른 ANSI sequence는 보존
- main에 PTY별 512K 문자 bounded buffer를 두어 renderer reload 시 살아 있는 PTY 재부착
- xterm scrollback은 5,000줄로 제한되어 숨은 pane도 무제한 메모리를 사용하지 않음
- Claude/Codex 공통 네이티브 clipboard
  - 선택 + `Ctrl+C`/`Ctrl+Shift+C`: 복사
  - 선택 없음 + `Ctrl+C`: ETX 인터럽트
  - `Ctrl+V`/`Ctrl+Shift+V`: 붙여넣기
- Windows native notification과 클릭 시 앱/세션 활성화
- 터미널 출력의 절대/상대 파일 경로, 줄 번호, sibling 프로젝트 탐색 지원

## 4단계 — 앱 수명주기와 데이터 이전

창 닫기 listener를 PTY event effect와 분리했다. 주 창 X를 누르면 다음 순서로 처리한다.

1. 실행 중 agent ID 저장
2. localStorage snapshot 저장
3. Codex/Claude에 `/quit` 전송
4. xterm scrollback 직렬화
5. Electron main에 `confirm_close`
6. 모든 PTY, Dashboard, Remote, Tunnel, Pet 창과 앱 프로세스 종료

자동 close smoke 결과는 약 40~60ms(활성 agent가 없는 fixture)이며 기존 5초 fallback 대기는
발생하지 않았다. renderer가 준비되기 전에 닫히면 main이 즉시 정리한다.

Tauri와 Electron은 `%LOCALAPPDATA%\com.jintae.multiagent\storage-export.json`의 공용
workspace를 사용한다. 프로젝트·세션·화면 그룹·SSH host registry는 stable id 기준으로 첫
진입 시 합쳐지고, 이후에는 runtime별 revision marker로 최신 공용 snapshot을 적용한다.
펫 위치·테마·현재 선택·reopen 목록·터미널 scrollback 같은 UI/runtime 상태와 SSH 비밀번호는
공용화하지 않는다. 실행 중 PTY는 공유하지 않으며 저장된 `lastSessionId`만 다른 runtime에서
resume한다.

주의: 구버전 Tauri는 snapshot command가 없으므로 공용 workspace 지원 Tauri build를 한 번
실행해야 기존 localStorage가 자동 병합된다.

## 5단계 — 남은 backend 기능

### SSH

- Windows OpenSSH 자동 탐색, key/password 인증, 포트/identity/추가 옵션
- password는 Electron `safeStorage`로 암호화해 userData에 저장
- Windows remote는 UTF-16LE `EncodedCommand`, POSIX는 안전한 single-quote command 사용
- 원격 폴더, Codex/Claude 시작 명령, Hook 역터널/bootstrap, 공개키 읽기/생성

### Remote, Tunnel, Monitor

- Remote HTTP server, GitHub OAuth web flow, owner/승인/대기/해제 저장
- 승인된 브라우저의 agent 목록/최근 출력/입력 전달
- 기존 `cloudflared.exe`의 named/quick tunnel 실행과 URL 감지
- Monitor와 legacy Usage loopback dashboard, 포트 충돌 fallback, 자동 시작 설정

현재 Electron Remote UI는 1.5초 polling + 최근 출력/입력 방식이다. Tauri Remote의 xterm.js
WebSocket 스트림과 브라우저 탭 UX보다 단순하므로 원격 사용 비중이 높다면 아직 Tauri가
우세하다.

### Usage

Node 24 내장 SQLite로 기존 `usage.db` schema를 그대로 사용한다. Claude `message.usage`와
Codex `last_token_usage`를 `usage_sources.last_offset` 이후만 증분 파싱하고 deterministic
source key로 중복을 막는다. Hook `done` 때 해당 transcript를 자동 적재하며 설정의 Reindex는
전체 known transcript를 재색인한다.

### updater와 installer

`electron-updater`를 GitHub `OneThingChanged/Multiagent` 채널에 연결했다. 다운로드 progress는
기존 Settings UI contract로 전달하고, 다운로드 후 relaunch가 `quitAndInstall`을 호출한다.
실제 자동 업데이트는 첫 Electron `latest.yml`/NSIS/blockmap release와 Windows 코드 서명이
게시된 뒤 다른 PC에서 최종 확인해야 한다.

`-electron.*` prerelease 빌드는 Tauri의 GitHub Latest 채널과 분리된 고정
`electron-test` 릴리스 asset URL을 사용한다. 최초 `0.5.28` Electron 시험본만 기존 Latest
릴리스에 같은 `latest.yml`과 NSIS 파일을 올려 test 채널로 진입시키고, 이후 시험 업데이트는
`electron-test` 릴리스의 asset을 교체한다. 이 릴리스는 prerelease로 유지해 Tauri의
`latest.json`/`latest-company.json` 탐색에 영향을 주지 않는다.

## 실행과 검증

`app` 폴더에서 실행한다.

```powershell
npm run electron:dev
npm test
npm run electron:smoke
npm run electron:bridge-smoke
npm run electron:lifecycle-smoke
npm run electron:pack
npm run electron:packaged-smoke
npm run electron:packaged-lifecycle-smoke
npm run electron:dist
npm run electron:portable-lifecycle-smoke
```

자동 검증 범위:

- 13개 test file, 67개 unit/integration test
- `node-pty` 단독 및 renderer → preload → main → PTY → renderer 왕복
- 한글 PowerShell Hook, Hook auth/merge/repair contract
- session resolve/fallback, terminal path, CSI 3 J split sequence, bounded buffer
- SSH 인수/Windows 인코딩/remote Hook bootstrap
- Usage SQLite 증분/멱등 적재, Dashboard HTTP state
- source와 packaged renderer의 close/security lifecycle

현재 unpacked 크기는 약 381MB다. Tauri release보다 훨씬 크므로 설치 크기는 Electron 전환의
명확한 비용이다.

## 전환 전 남은 실사용 체크

1. 별도 Windows PC 두 대에서 NSIS/portable 설치, Defender/SmartScreen, `node-pty` 확인
2. 실제 Codex/Claude를 8시간 이상 실행하고 scrollback·메모리·resume 확인
3. Windows와 POSIX SSH 호스트에서 Hook working/done/session-start 확인
4. Cloudflare 공개 URL에서 OAuth pending/approve/revoke와 장시간 입력 확인
5. 서명된 Electron 릴리즈 두 버전으로 업데이트/rollback 확인
6. Remote를 Tauri 수준 WebSocket/xterm UX로 올릴지 현재 간소화 UI를 유지할지 결정

이 체크가 끝날 때까지 Tauri 빌드/배포 경로는 유지한다.
