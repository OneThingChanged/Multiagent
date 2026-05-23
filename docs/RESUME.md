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
3. `notify.ps1`이 stdin JSON에서 `session_id` 추출
4. HTTP `/event`에 `{ id, event: "session-start", session_id, token }` POST
5. Rust 서버가 토큰 검증 후 `agent:hook-event` 발생
6. 프론트가 `agent.lastSessionId`에 저장하고 `multiagent.agents.v1`에 영구화

resume·compact·clear 등으로 새 session이 시작되면 hook이 다시 fire되므로 가장 최근 세션 ID가 덮어써진다.

## Spawn 시 세션 ID 사용

PaneSlot의 apply에서:

```ts
let cmd = tool.command;  // "codex"
if (agent.lastSessionId) {
  if (agent.aiToolId === "codex") {
    cmd = `${cmd} resume ${agent.lastSessionId}`;
  } else if (agent.aiToolId === "claude") {
    cmd = `${cmd} --resume ${agent.lastSessionId}`;
  }
}
if (agent.dangerous && tool.dangerousFlag) {
  cmd = `${cmd} ${tool.dangerousFlag}`;
}
// invoke spawn_pty with initCommand = cmd
```

결과 예: `codex resume 019e3eda-7a41-77e2-9165-cb5e11e13021 --dangerously-bypass-approvals-and-sandbox`
Claude 결과 예: `claude --resume <session_id> --dangerously-skip-permissions`

## 한계 / 미지원

- **Shell only 모드**: `/quit` 명령이 PowerShell에 없어 에러 메시지가 잠깐 보일 수 있음 (해롭진 않음). 어차피 resume 대상 아님
- **세션 ID 무효화**: Codex/Claude가 세션 ID를 더 이상 resume할 수 없거나 session jsonl이 삭제되면 resume 실패. 사용자는 새 세션 시작 필요
- **첫 spawn**: 에이전트 최초 생성 직후엔 아직 SessionStart hook이 fire 안 됐을 수 있음. 한 번 spawn 되고 나면 다음 실행부터 정상 동작

## persistence

`StoredAgent.lastSessionId?: string`이 `multiagent.agents.v1` localStorage 키에 같이 저장됨. 기존 `lastResumeToken`, `lastClaudeSessionId`는 로드 시 `lastSessionId`로 마이그레이션되는 legacy 필드다.
