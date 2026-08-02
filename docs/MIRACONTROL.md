# MiraControl Integration

MultiAgent exposes a small local API for MiraControl and StreamDeck integrations.
It reuses the existing Claude/Codex hook server, so MiraControl never edits CLI
hook configuration and never installs a duplicate hook.

## Discovery and lifetime

The hook server always runs while MultiAgent is running and binds only to a random
loopback port. Do not scan ports. Read the runtime file instead:

```text
%LOCALAPPDATA%\com.jintae.multiagent\hook-info.json
```

Company builds use `com.jintae.multiagent.company`. The file contains:

```json
{
  "port": 57060,
  "token": "runtime UUID",
  "pid": 1234,
  "integrationApiVersion": 1
}
```

The port and token rotate whenever MultiAgent restarts. MiraControl should watch or
poll the file, reconnect when either value changes, and treat a failed connection
as `OFFLINE`. A stale file can remain after an abnormal shutdown; successful Bearer
authentication, not file existence alone, proves that MultiAgent is online.

## Authentication

Every `/integration/v1/**` request requires the hook token in a header:

```http
Authorization: Bearer <token>
```

Never put the token in a URL, log, StreamDeck profile, or settings export. Browser
`Origin` requests are rejected; this API is for a local native client. The server
does not emit CORS headers and continues to listen on `127.0.0.1` only.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /integration/v1/health` | authenticated liveness/API-version check |
| `GET /integration/v1/sessions` | compact Codex/Claude session list |
| `POST /integration/v1/sessions/:agentId/activate` | show MultiAgent and select that session |
| `POST /integration/v1/sessions/:agentId/input` | send one guarded instruction to the active PTY |

### Session list

The response deliberately excludes terminal output, prompts, tool input, project
paths, and credentials.

```json
{
  "schemaVersion": 1,
  "generatedAt": 1800000000000,
  "app": {
    "status": "ONLINE",
    "version": "0.5.83",
    "variant": "standard",
    "pid": 1234
  },
  "sessions": [
    {
      "agentId": "6b3ccde9-f35a-40db-925c-1166b6acd7bd",
      "providerSessionId": "019f9d69-f6ba-78b2-b345-f5b670f903d7",
      "sessionName": "Multiagent",
      "projectId": "project-id",
      "projectName": "MultiAgent",
      "tool": "codex",
      "state": "DONE",
      "reason": "completed",
      "active": true,
      "updatedAt": 1800000000000
    }
  ]
}
```

StreamDeck state mapping:

| MultiAgent condition | `state` | typical `reason` |
|---|---|---|
| PTY is inactive | `OFFLINE` | `inactive` |
| prompt/tool work is running | `WORK` | `working`, `tool-start` |
| permission, question, or block | `WAIT` | `input`, `blocked` |
| live and ready for its first instruction | `WAIT` | `ready` |
| Stop/done hook received | `DONE` | `completed` |

If MultiAgent itself is not responding, MiraControl supplies the global `OFFLINE`
state locally because no HTTP response can be produced.

### Activate

No request body is needed. A successful request returns HTTP `202`. MultiAgent
opens the workspace window that owns the session and selects it. An inactive session
may then be resumed by the normal MultiAgent selection flow.

### Input

MiraControl must first read the session list and echo the current provider session
ID back with the instruction:

```json
{
  "text": "다음 작업을 진행해 주세요",
  "expectedSessionId": "019f9d69-f6ba-78b2-b345-f5b670f903d7",
  "submit": true
}
```

`submit` defaults to `true` and appends Enter server-side. Input is limited to 8KB.
The API rejects unsafe or ambiguous delivery:

| HTTP | Meaning |
|---|---|
| `400` | empty, invalid, or oversized input |
| `401` | missing/stale token |
| `403` | browser-origin request |
| `404` | unknown or unsupported agent |
| `409` | inactive, already working, or provider session changed |
| `428` | `expectedSessionId` omitted |

The session-ID precondition prevents a StreamDeck button cached for an old Codex or
Claude conversation from sending a command into a newly resumed conversation.

## Recommended MiraControl loop

1. Watch `hook-info.json` and read it again after every change.
2. Call authenticated `/integration/v1/health`.
3. Poll `/integration/v1/sessions` or refresh it after a button action.
4. Bind StreamDeck buttons to stable `agentId` values.
5. Use the latest `providerSessionId` as `expectedSessionId` for input.
6. After repeated connection failures, render every assigned button as `OFFLINE`.
