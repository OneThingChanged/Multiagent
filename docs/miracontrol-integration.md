---
type: Interface
title: MiraControl integration
description: "Authenticated loopback session status, activation, browser control, and guarded input contract."
tags:
  - miracontrol
  - integration
  - hooks
status: stable
stale_after: 2026-10-31
sources:
  - id: integration-model
    resource: ../app/electron/services/miracontrol-integration.mjs
    title: "MiraControl state and input model"
  - id: hook-service
    resource: ../app/electron/services/hook-service.mjs
    title: "Authenticated integration HTTP service"
  - id: integration-tests
    resource: ../app/electron/services/miracontrol-integration.test.mjs
    title: "MiraControl contract tests"
---

# MiraControl integration

MultiAgent owns hook registration and provider state. MiraControl reads a small
loopback API and never edits Codex or Claude hook configuration directly.[^integration-model]

## Discovery and authentication

The hook service publishes process-local discovery information containing the
loopback integration port, API version, PID, and bearer-token location. All
`/integration/v1/*` requests require that bearer token and reject requests with
a browser `Origin` header.[^hook-service]

If MultiAgent stops, the endpoint disappears. MiraControl must show the app and
its sessions as offline rather than retaining the last online state.

## Stable state model

Only Codex and Claude sessions are exported. The external state vocabulary is:

* `WORK` - active work is in progress;
* `WAIT` - initializing, ready, blocked, or awaiting input; inspect `reason`;
* `DONE` - the most recent hook completed successfully;
* `OFFLINE` - no live PTY for the configured session.[^integration-model]

Each session includes `agentId`, provider session ID, session/project labels,
tool, state, reason, active flag, and last hook timestamp.

## Endpoints

* `GET /integration/v1/health` - API version and process health.
* `GET /integration/v1/sessions` - application metadata and session snapshot.
* `POST /integration/v1/agents/:agentId/activate` - activate the configured session.
* `POST /integration/v1/agents/:agentId/input` - guarded input and optional submit.
* `/integration/v1/browser/...` - the fixed embedded-browser actions used by the
  managed browser MCP.[^hook-service]

## Guarded input

Input requires a live, initialized PTY and an `expectedSessionId` equal to the
current provider session ID. It is rejected when the session is working, when
the provider identity changed, when text is blank or contains NUL, or when the
UTF-8 payload exceeds 8 KiB. Submission appends Enter unless `submit` is false.[^integration-model][^integration-tests]

The expected-ID check is mandatory: callers must refresh the session snapshot
after activation or any conflict before retrying.

[^integration-model]: MiraControl state and input model
[^hook-service]: Authenticated integration HTTP service
[^integration-tests]: MiraControl contract tests
