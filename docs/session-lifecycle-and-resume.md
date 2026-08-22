---
type: Workflow
title: Session lifecycle and resume
description: "How configured sessions start PTYs, report activity, cancel work, shut down, and recover provider conversations."
tags:
  - sessions
  - hooks
  - resume
status: stable
stale_after: 2026-11-30
sources:
  - id: terminal-service
    resource: ../app/electron/services/terminal-session-service.mjs
    title: "PTY lifecycle service"
  - id: session-index
    resource: ../app/electron/services/session-service.mjs
    title: "Provider transcript and session index"
  - id: spawn
    resource: ../app/src/lib/spawn.ts
    title: "Spawn and resume command construction"
  - id: activity
    resource: ../app/src/lib/agentActivity.ts
    title: "Runtime and hook activity state"
  - id: lifecycle
    resource: ../app/src/lib/sessionLifecycle.ts
    title: "Renderer session lifecycle transitions"
  - id: hook-service
    resource: ../app/electron/services/hook-service.mjs
    title: "Hook receiver and configuration"
  - id: reopen-journal
    resource: ../app/electron/services/reopen-journal.mjs
    title: "Full-exit recovery journal"
---

# Session lifecycle and resume

## Two independent state models

Configured agent state and a live PTY are separate. Runtime state describes
process availability (`idle`, `starting`, `recovering`, `running`, `exited`, or
`unreachable`); work state describes hook activity (`working`, `waiting`,
`blocked`, or `done`).[^activity]

After application recovery, a session remains `starting` or `recovering` until
PTY output/readiness or a hook confirms that the provider CLI initialized. The
UI must not mark every reopened session as working merely because a process was
spawned.[^lifecycle]

## Start and provider resume

Spawning resolves the local or SSH command, provider session ID, terminal
compatibility flags, dangerous mode, and optional content-worker settings.
Local Codex and Claude sessions resume through provider session identifiers;
Windows SSH can resume when its reverse-hook path is available.[^spawn][^session-index]

Changing a provider session pin or another launch-only option requires
deactivating and reopening the PTY. It does not rewrite a running CLI process.

## Attach, deactivate, and cancel

The PTY service owns sequence-buffer replay, renderer attachment, resize order,
and process-tree teardown. Detaching a pane is not termination. Deactivation
closes the PTY process tree while preserving configured session metadata.[^terminal-service]

Cancellation sends the provider interrupt and clears active work state without
claiming successful completion. Once readiness is restored, the session can
accept a new instruction. Active work hooks also expire defensively instead of
remaining permanently busy.[^activity][^hook-service]

## Window close and full exit

Closing a workspace window can leave sessions owned by the tray process. A full
application exit cannot preserve OS processes: live sessions are journaled,
their process trees are closed, and the next launch reconstructs them using
provider resume metadata.[^reopen-journal][^spawn]

The provider transcript is the canonical conversation record. Terminal
scrollback is a display buffer and must not be treated as durable resume data.

## Constraints

* transcript chat and provider-resume discovery are implemented for Codex and
  Claude, not every terminal tool;
* remote SSH provider files are unavailable to local transcript/usage scanners;
* POSIX SSH does not use the Windows reverse-hook resume path;
* an unavailable or replaced provider session ID must fail guarded external
  input instead of sending to an ambiguous process.

[^terminal-service]: PTY lifecycle service
[^session-index]: Provider transcript and session index
[^spawn]: Spawn and resume command construction
[^activity]: Runtime and hook activity state
[^lifecycle]: Renderer session lifecycle transitions
[^hook-service]: Hook receiver and configuration
[^reopen-journal]: Full-exit recovery journal
