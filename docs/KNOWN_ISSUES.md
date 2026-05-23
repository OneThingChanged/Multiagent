# Known Issues & Future Work

## 알려진 제약

### 영구화의 한계
- 에이전트 **설정**(이름·폴더·AI 도구·dangerous·lastSessionId)·**레이아웃**(그룹/분할/탭 순서·활성)·**view**·**앱 테마**·**Docs 폭**·**터미널 폰트 크기**는 localStorage에 저장됨
- 그룹 세션 고정값(`sessionPins`, `sessionLocked`)도 localStorage의 그룹 데이터에 같이 저장됨
- 하지만 **터미널 세션의 OS 프로세스는 복원 불가**: 앱이 닫히면 PowerShell+Claude/Codex 프로세스가 죽음
- **Codex 대화는 resume 가능**: 창 닫을 때 자동 `/quit` → token 캡처 → 다음 실행 시 `codex resume <token>`으로 재개
- **Claude 대화도 resume 가능**: SessionStart hook으로 `session_id` 캡처 → 다음 실행 시 `claude --resume <id>`로 재개. 자세한 건 [RESUME.md](RESUME.md)
- xterm scrollback도 휘발성 (Codex/Claude 자체의 세션 컨텍스트는 resume 시 부활하지만 터미널에 출력된 텍스트는 다시 안 보임)

### Window 크기 변경 시 scrollback
- xterm cols가 바뀌면 자동 reflow되지만, Codex/Claude가 **이전 너비 기준으로 줄바꿈을 baked in** 한 출력은 새 너비로 다시 펴지지 않음. 새 출력만 새 너비로 나옴

### TUI mouse 입력 손실
- 휠 이벤트는 capture 단계에서 강제로 xterm scrollback으로 보내짐. Codex 같은 TUI가 자체 스크롤 가능한 리스트를 가지면 그 안에서 휠로 스크롤 안 됨. 키보드 대안 필요

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

### dev 모드에서 부모 죽으면 자식 stale 가능
- app.exe 강제종료 시 PowerShell 자식이 즉시 안 죽고 orphan이 될 수 있음
- 정상 종료 (창 X) 경로에선 portable-pty가 master drop → slave EIO → child 종료 cascade

## 잠재 개선 (phase 2)

### 필수에 가까운 것

- **탭 reorder**: 같은 leaf 안에서 탭을 드래그로 순서 바꾸기 (지금은 같은 leaf center 드롭이 no-op)
- **세션 재시작**: exited 상태 에이전트를 클릭하면 재spawn (지금은 영원히 exited)
- **에이전트 설정 편집**: 만든 뒤에 이름/폴더/도구 바꾸기 (지금은 삭제+재생성만)

### 있으면 좋은 것

- **Cross-group 드래그**: 다른 그룹의 에이전트를 현재 그룹의 패널로 끌어다 놓기 (지금도 동작은 하지만 시각 피드백 부족)
- **그룹 이름 / 색깔**: 사이드바에서 그룹 식별 강화
- **단축키**: Ctrl+T 새 탭, Ctrl+W 탭 닫기, Ctrl+1~9 탭 전환, Ctrl+\ 분할 등
- **모델/플래그 커스터마이즈**: AI 도구별로 추가 CLI 인자 (예: `claude -m sonnet`)를 모달에서 지정
- **에이전트 복제**: 같은 폴더에 동일 설정으로 새 에이전트 만들기
- **터미널 폰트/사이즈 설정 UI**: Ctrl+휠로 크기 조절은 가능하지만 설정 팝업에서는 아직 직접 지정 불가
- **알림 옵션**: Windows 토스트 / 인앱 토스트 / 사운드 켜고 끄기
- **세션 export/import**: 그룹/레이아웃을 JSON으로 내보내기
- **Cargo 바이너리명 → MultiAgent.exe**: 단독 EXE 파일명 정리

### 더 큰 작업

- **세션 영속화**: PowerShell 백그라운드로 detach + 다음 실행 시 재attach (Windows에선 어려움. WSL 기반이면 tmux 비슷한 접근 가능)
- **스크롤백 영속화**: `@xterm/addon-serialize`로 종료 직전 스크롤백 저장, 다음 실행 때 inject. Claude 자체 컨텍스트는 따로 못 살리지만 시각적으로 이전 출력은 보임
- **터미널 검색**: `@xterm/addon-search`로 Ctrl+F
- **로그 export**: 에이전트별 출력 로그 파일로 저장
- **다국어**: 지금 UI는 한글 일부 + 영문 일부 혼합 → 통일
