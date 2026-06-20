# 세션 Resume

앱을 닫고 다시 켜도 Codex/Claude 세션을 이어서 사용하기 위한 메커니즘. 현재는 각 도구의 `SessionStart` hook에서 전달되는 `session_id`를 공통 필드 `lastSessionId`로 저장하고, 다음 spawn 때 도구별 resume 명령으로 사용한다.

## 동작 시나리오

1. 사용자가 Codex/Claude 에이전트로 대화/작업
2. 사용자가 창 **X** 클릭
3. 백엔드가 close를 가로채고 프론트에 `app:close-requested` 이벤트 발생
4. 프론트가 실행 중인 모든 Codex/Claude 에이전트에 `/quit\r` 전송
5. 세션 ID는 이미 `SessionStart` hook 시점에 저장되어 있으므로 close path는 도구를 정상 종료하는 역할만 함
6. 짧게 대기 후 `confirm_close` 커맨드로 실제 종료
7. 다음번 앱 실행 → 사이드바에서 그 agent 클릭 → spawn 시 `codex resume <id>` 또는 `claude --resume <id>` (+ dangerous 플래그) 자동 입력

## 창 닫기 인터셉트 (Rust)

```rust
window.on_window_event(move |event| {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let confirmed = *state.close_confirmed.lock().unwrap();
        if !confirmed {
            api.prevent_close();
            let _ = app_handle.emit("app:close-requested", ());
        }
    }
});
```

`confirm_close` 커맨드가 `close_confirmed` 플래그를 true로 세팅 후 `window.close()` → 두 번째 close 이벤트는 그대로 통과.

## 세션 ID 캡처

1. 앱이 각 에이전트 폴더의 `.claude/settings.local.json`과 `.codex/config.toml`에 `SessionStart` hook을 머지
2. 도구가 켜질 때 hook 실행 → `notify.ps1 session-start`
3. `notify.ps1`이 stdin JSON에서 `session_id`(+ `transcript_path`, `cwd`) 추출
4. HTTP `/event`에 `{ id, event: "session-start", session_id, token, ... }` POST
   - 포트·토큰은 **세션별 환경변수 `MULTIAGENT_PORT`/`MULTIAGENT_TOKEN` 우선**, 없을 때만 `hook-info.json` fallback. 세션은 자기를 spawn한(살아있는) 앱에 1:1로 묶이므로 앱 재시작·다중 인스턴스에서도 정확
5. Rust 서버가 토큰 검증 후 `agent:hook-event` 발생
6. 프론트가 `agent.lastSessionId`에 저장하고 `multiagent.agents.v1`에 영구화

resume·compact·clear 등으로 새 session이 시작되면 hook이 다시 fire되므로 가장 최근 세션 ID가 덮어써진다.

## Spawn 시 세션 ID 사용

PaneSlot의 apply에서:

```ts
let cmd = tool.command;  // "codex"
const sessionId = group.sessionPins?.[agent.id] ?? agent.lastSessionId;
if (sessionId) {
  if (agent.aiToolId === "codex") {
    cmd = `${cmd} resume ${sessionId}`;
  } else if (agent.aiToolId === "claude") {
    cmd = `${cmd} --resume ${sessionId}`;
  }
}
if (agent.dangerous && tool.dangerousFlag) {
  cmd = `${cmd} ${tool.dangerousFlag}`;
}
// invoke spawn_pty with initCommand = cmd
```

결과 예: `codex resume 019e3eda-7a41-77e2-9165-cb5e11e13021 --dangerously-bypass-approvals-and-sandbox`
Claude 결과 예: `claude --resume <session_id> --dangerously-skip-permissions`

## 그룹 세션 고정

사이드바 우클릭 메뉴의 **현재 세션으로 그룹 고정**은 그룹 멤버들의 현재 `lastSessionId`를 `Group.sessionPins`에 저장한다. 이후 해당 그룹에서 spawn되는 에이전트는 최신 `lastSessionId`보다 그룹의 고정 세션 ID를 우선 사용한다.

고정 그룹은 `sessionLocked` 상태가 되어 외부 에이전트를 탭/분할/드래그로 추가할 수 없다. 이미 실행 중인 터미널 프로세스는 자동 재시작하지 않으므로 고정값은 다음 spawn부터 적용된다.

## 현재 세션으로 재등록 (복구)

hook이 안 돌거나(예: 깨진 codex 플러그인 `hooks.json`이 파싱 실패해 SessionStart가 안 fire) `lastSessionId`가 옛 값으로 굳으면 resume이 엉뚱한 세션을 잡는다. 사이드바 세션 우클릭 → **현재 세션으로 재등록**:

- `relink_cli_session`(Rust) → `usage.rs`의 `find_latest_for_folder(tool, folder)`가 그 도구·폴더의 **디스크 최신 transcript**에서 session_id를 추출
  - claude: `~/.claude/projects/<encoded-folder>/<id>.jsonl` 중 최신
  - codex: `~/.codex/sessions/**/rollout-...<id>.jsonl` 중 cwd 일치 최신
- 찾은 id를 `lastSessionId`로 갱신 → **다음 spawn부터** 그 세션으로 resume
- transcript 탐색 로직은 사용량 대시보드와 공유 ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md))

## 한계 / 미지원

- **Shell only 모드**: `/quit`이 PowerShell에 없어 에러가 잠깐 보일 수 있음 (해롭진 않음, resume 대상 아님)
- **세션 ID 무효화**: 도구가 그 세션을 더 이상 resume 못 하거나 jsonl이 삭제되면 실패 → 새 세션 시작 (재등록으로 디스크 최신 세션을 다시 잡아볼 수 있음)
- **첫 spawn**: 최초 생성 직후엔 SessionStart hook 전이라 resume 대상 없음. 한 번 떠야 다음부터 정상
- **codex 플러그인 hooks.json 호환**: codex companion 플러그인의 `hooks.json` 최상위에 `description` 같은 미지원 필드가 있으면 codex가 hook 로딩에 실패해 SessionStart가 안 옴 → 해당 필드 제거 또는 플러그인 정리 필요

## persistence

`StoredAgent.lastSessionId?: string`이 `multiagent.agents.v1` localStorage 키에 같이 저장됨. 기존 `lastResumeToken`, `lastClaudeSessionId`는 로드 시 `lastSessionId`로 마이그레이션되는 legacy 필드다.

그룹 고정 세션은 `multiagent.groups.v1` 안의 `Group.sessionPins`와 `Group.sessionLocked`에 저장된다.
