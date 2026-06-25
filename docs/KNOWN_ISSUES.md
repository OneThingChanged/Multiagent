# Known Issues & Future Work

## 알려진 제약

### 영구화의 한계
- 프로젝트 **설정**(이름·폴더)과 세션 **설정**(별명·프로젝트·AI 도구·dangerous·lastSessionId)·**레이아웃**(그룹/분할/탭 순서·활성)·**view**·**앱 테마**·**Docs 폭**·**터미널 폰트 크기**는 localStorage에 저장됨
- 그룹 세션 고정값(`sessionPins`, `sessionLocked`)도 localStorage의 그룹 데이터에 같이 저장됨
- 하지만 **터미널 세션의 OS 프로세스는 복원 불가**: 앱이 닫히면 PowerShell+Claude/Codex 프로세스가 죽음
- **Codex 대화는 resume 가능**: 창 닫을 때 자동 `/quit` → token 캡처 → 다음 실행 시 `codex resume <token>`으로 재개
- **Claude 대화도 resume 가능**: SessionStart hook으로 `session_id` 캡처 → 다음 실행 시 `claude --resume <id>`로 재개. 자세한 건 [RESUME.md](RESUME.md)
- xterm scrollback도 휘발성 (Codex/Claude 자체의 세션 컨텍스트는 resume 시 부활하지만 터미널에 출력된 텍스트는 다시 안 보임)

### Window 크기 변경 시 scrollback
- xterm cols가 바뀌면 자동 reflow되지만, Codex/Claude가 **이전 너비 기준으로 줄바꿈을 baked in** 한 출력은 새 너비로 다시 펴지지 않음. 새 출력만 새 너비로 나옴

### 휠 스크롤 / TUI
- 휠 이벤트는 capture 단계에서 처리한다. **일반(메인) 버퍼**에선 xterm scrollback으로 강제 스크롤(TUI mouse tracking 무시) — 이때 public `scrollLines()` 대신 즉시 buffer scroll 경로를 써서 streaming 출력 중 위로 스크롤해도 최하단으로 안 튀게 한다.
- **alternate-screen 버퍼(claude/codex 같은 전체화면 TUI)** 에선 xterm scrollback으로 휠을 보내지 않고 `PageUp/PageDown` 입력으로 바꿔 TUI 자체 스크롤을 움직인다. (alt-screen에는 실제 scrollback이 없어서 xterm 휠 경로를 타면 빈 줄이 보였다가 다음 repaint에서 최하단으로 튕길 수 있음.)

### Markdown 문서 뷰어 스캔 제한
- Markdown 스캔은 성능 보호를 위해 최대 500개 파일까지만 수집
- 단일 Markdown 파일은 2MB 초과 시 읽지 않음
- `node_modules`, `target`, `dist`, `.git`, `.claude`, `.codex` 등 내부/대형 폴더는 스캔 제외

### Hook 의존
- "working/done" 상태는 Claude(`UserPromptSubmit`/`Stop`) + Codex(같은 이름 이벤트) hook이 fire되어야 동작
- Claude는 `.claude/settings.local.json`, Codex는 `.codex/config.toml`에 hook 머지
- hook 실행에 PowerShell 인터프리터가 한 번 더 떠야 함 — 작은 지연

### 같은 에이전트 동시 표시 불가
- xterm Terminal 인스턴스 1개당 DOM 1곳에만 mount 가능
- 같은 에이전트를 두 패널에 동시에 보여줄 수 없음 (드롭 시 항상 한 곳으로 이동)

### 그룹 세션 고정의 범위
- 현재 구현은 그룹에 "현재 저장된 세션 ID"를 고정하는 방식이다. 과거 세션 목록을 보여주고 선택하는 UI는 아직 없음
- 고정값은 다음 spawn부터 적용된다. 이미 실행 중인 Codex/Claude 프로세스는 자동 재시작하지 않음
- 고정된 세션 ID가 도구 쪽에서 더 이상 resume 불가하면 사용자가 고정을 해제하거나 새 세션을 시작해야 함

### 자동 업데이트 / 릴리즈 운영
- 자동 업데이트는 GitHub의 **Latest 릴리즈**에 첨부된 `latest.json`(+`.sig`)에 의존. 릴리즈를 draft로 두거나 latest 마킹·서명·매니페스트를 빠뜨리면 업데이트가 안 보임 ([RELEASE.md](RELEASE.md) 체크리스트)
- `/releases/latest/download/` 경로는 GitHub CDN 캐시로 publish 직후 몇 분간 옛 버전을 줄 수 있음
- 서명 private key를 잃으면 기존 사용자는 자동 업데이트 불가 (새 키 + 수동 재설치 필요)

### 원격 접속 제약
- 내부 localhost 구간은 평문 HTTP (외부는 Cloudflare가 TLS). LAN 직접 접속(레거시 토큰)은 같은 망에서 평문
- quick tunnel URL은 켤 때마다 바뀜. 고정 도메인은 Cloudflare 계정 + 도메인으로 named tunnel 필요
- 같은 세션을 데스크탑·웹에서 동시에 보면 PTY가 하나라 출력이 공유됨 (의도된 동작; 화면 크기는 데스크탑이 주인)

### SSH 원격 세션
- **Windows 원격 = working/done 상태 + 세션 resume 지원 (Phase 2)**: spawn 시 `ssh -R <port>:127.0.0.1:<hookPort>` 역터널로 원격 hook이 로컬 서버에 도달. 원격 `<folder>\.claude\multiagent-notify.ps1`를 푸시하고 `settings.local.json`/`config.toml`에 hook 머지(원격 read→로컬 Rust 머지→write, base64 전송). env(`MULTIAGENT_PORT/TOKEN/AGENT_ID`)는 원격 cmd에 주입. session-start hook이 `lastSessionId`를 채워 다음 spawn에서 `claude --resume <id>`(codex는 `resume <id>`)
- **POSIX(Linux/macOS) 원격 = 상태/resume 미지원**: 아직 Phase 2 미적용. 원격 셸은 뜨지만 상태점은 running까지, resume 분기는 건너뜀
- **사용량 집계 미지원(원격 전체)**: usage 대시보드는 로컬 transcript만 파싱 → 원격 세션 토큰은 안 잡힘
- **Docs/이미지 뷰어 미지원**: 로컬 폴더 스캔 기반이라 SSH 프로젝트(로컬 folder 없음)에선 비활성
- **클라이언트 OpenSSH 필요**: Windows 내장 `ssh.exe`(OpenSSH 클라이언트)가 PATH에 있어야 함. 없으면 spawn/Test 실패
- **원격 셸 종류 선택**: SSH Hosts 등록 시 **Remote OS**(Linux/macOS=POSIX, Windows=cmd)를 골라야 명령 형식이 맞음. POSIX는 `cd '<folder>' && exec ...`, Windows는 `cd /d "<folder>" && <tool>`. 기본값은 POSIX
- **역터널 차단 시 graceful degrade**: 원격 sshd가 `AllowTcpForwarding`를 끄면 `-R`가 조용히 실패 → 세션은 정상 동작하되 상태/resume만 비활성(`ExitOnForwardFailure` 미설정)
- **Windows 원격 셸 무관(cmd/PowerShell)**: 원격 명령은 `powershell -EncodedCommand <base64>`로 보내므로, 그 서버의 SSH 기본 셸이 cmd든 PowerShell(구버전 5.1 포함)이든 동작한다. 폴더 경로 공백/특수문자도 base64 + `-LiteralPath`로 안전. 동시 세션은 호스트별 고유 역터널 포트로 충돌 방지
- **인증 방식 토글(키/비밀번호)**: SSH Hosts 등록 시 호스트별 **Auth method** 선택.
  - **키(기본)**: identity 파일 지정 시 자동으로 `-o IdentitiesOnly=yes` → ssh-agent에 키가 많아 생기는 **"Too many authentication failures"**를 방지(그 키 하나만 시도). 키 인증이 미리 동작해야 함.
  - **비밀번호**: `-o PubkeyAuthentication=no`로 키를 안 던지고 바로 비번. 비번을 저장해두면 연결 시 앱이 **PTY에 자동 입력**(`password:` 프롬프트 감지). 비번은 localStorage가 아니라 로컬 `ssh-secrets.json`(`<app_local_data_dir>`)에 저장 — client_secret과 동일 수준의 로컬 평문(동기화·UI 반환 안 됨). 미저장 시 터미널에서 직접 입력.
- **비밀번호 호스트는 원격 hook(상태/resume) 미지원**: Phase 2 hook 설정은 비대화형(BatchMode) ssh라 비번 인증이 불가 → 비번 호스트는 **자동 연결·터미널만** 되고 working/done·resume은 안 됨(키 모드 Windows 원격만 Phase 2). (SSH_ASKPASS 기반 비번 hook은 실 서버 검증 후 후속)
- **서버측 `AllowGroups` 등은 앱이 못 고침**: 서버 `sshd_config`의 그룹/정책 제한으로 막히면 서버에서 계정을 허용 그룹에 추가해야 함(클라이언트 옵션으로 우회 불가)

### codex 플러그인 hook 호환
- codex companion 플러그인의 `hooks.json`이 codex 버전의 hook 스키마와 안 맞으면(예: 최상위 `description` 필드) hook 로딩 실패 → working 표시/세션 캡처가 안 될 수 있음 ([RESUME.md](RESUME.md))

### dev 모드에서 부모 죽으면 자식 stale 가능
- app.exe 강제종료 시 PowerShell 자식이 즉시 안 죽고 orphan이 될 수 있음
- 정상 종료 (창 X) 경로에선 portable-pty가 master drop → slave EIO → child 종료 cascade

## 구현 완료 (과거 phase 2 후보)

세션 재시작·비활성화·재등록, 전역 단축키(Ctrl+T/W/1-9/F), 스크롤백 영속화, 터미널 검색(Ctrl+F), 알림음 옵션, 자동 업데이터, 프로젝트 드래그 재정렬·삭제·속성, 세션 속성, 사이드바 검색, 이미지/HTML 뷰어, 원격 접속, 사용량 대시보드는 모두 구현됨.

## 잠재 개선 (남은 것)

- **탭 reorder**: 같은 leaf 안에서 탭 순서 드래그 변경 (현재 같은 leaf center 드롭은 no-op)
- **세션 설정 편집 확장**: 별명은 바꿀 수 있지만 프로젝트/AI 도구/dangerous 변경 UI는 없음
- **모델/플래그 커스터마이즈**: 도구별 추가 CLI 인자(예: `claude -m sonnet`)를 모달에서 지정
- **세션 복제**: 같은 프로젝트에 동일 설정으로 새 세션
- **그룹 이름/색**: 사이드바 그룹 식별 강화
- **세션 export/import**: 그룹/레이아웃을 JSON으로
- **로그 export**: 에이전트별 출력 로그 파일
- **세션 프로세스 영속화**: 앱을 닫아도 PowerShell+CLI를 백그라운드 유지 (Windows에선 어려움; 현재는 resume으로 대화만 복원)
- **모바일 전용 원격 UI**: 현재 원격 웹은 데스크탑 브라우저 기준. 좁은 화면용 레이아웃 별도 필요
- **다국어**: UI 한/영 혼용 → 통일
