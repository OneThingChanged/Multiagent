# Embedded Browser MCP

MultiAgent owns one application-local browser profile and exposes its pages to
the current Codex/Claude process through a local stdio MCP server.

## Model

```text
BrowserManager (Electron main process)
  ├─ tabId/browserId A
  ├─ tabId/browserId B
  └─ tabId/browserId C

agentId -> active tabId
```

Tabs share the `persist:multiagent-browser` profile, so a login can be reused
across tabs. This profile is separate from Chrome/Edge cookies and is stored in
Electron user data; it is never committed to Git.

## MCP tools

The managed `multiagent-browser` server is registered when a supported local
Codex or Claude session starts. It receives `MULTIAGENT_PORT`,
`MULTIAGENT_TOKEN`, `MULTIAGENT_AGENT_ID`, and the machine-local
`MULTIAGENT_MCP_SCRIPT` path from the PTY environment and calls the
authenticated loopback integration API. The generated project MCP entry uses a
small `node -e import(require('node:url').pathToFileURL(process.env.MULTIAGENT_MCP_SCRIPT))` launcher, so the
absolute installation path is not written to `.mcp.json` or Codex TOML.

- `browser_tabs`
- `browser_open`, `browser_navigate`
- `browser_snapshot`
- `browser_screenshot`
- `browser_click`, `browser_type`
- `browser_back`, `browser_forward`, `browser_reload`
- `browser_attach_annotation`

The server uses newline-delimited JSON-RPC over stdio and does not listen on an
external port. The Electron package unpacks the server script so a system Node
runtime can launch it from an installed build.

## Element selection and annotations

The isolated browser preload reports only a bounded element descriptor when the
pointer hovers or the user clicks:

- URL/title, tag/role/ARIA label, selector, text excerpt, attributes
- viewport rectangle
- sanitized element HTML
- an optional PNG capture saved below Electron user data

The trusted browser toolbar exposes two explicit selection actions:

- `영역 선택` enables a DevTools-style hover overlay. Clicking an element captures
  bounded JSON/HTML metadata and a PNG, then copies the complete
  `[Browser annotation]` prompt to the Windows clipboard. It does not type into
  the terminal automatically.
- `선택 후 전송` enables the same overlay, but clicking sends the captured prompt
  to the browser tab's associated session and submits it. The action is disabled
  when the document tab has no associated session.

`Esc` cancels selection mode. Hover alone never captures, copies, or writes to a
PTY. Password controls, values, cookies, tokens, active scripts, and authorization
attributes are removed before the context is returned.

If `선택 후 전송` is used while Codex is already working, Codex can keep the next
annotation in its composer/queue instead of executing it immediately. Avoid sending
the same selection repeatedly. To clear a multi-line Codex draft, press `Ctrl+U`
repeatedly; Codex currently has no default one-keystroke binding that clears an
entire multi-line draft. `Ctrl+K` deletes from the cursor to the end of the current
line, while `Esc` interrupts the active turn rather than clearing the composer.

## Boundaries

- Only HTTP(S) navigation is allowed.
- Browser actions are fixed tools; arbitrary JavaScript execution is not exposed.
- Password fields and password-autocomplete controls cannot be clicked or typed
  through the MCP bridge.
- MCP requests require the per-process bearer token and are rejected when a
  browser `Origin` header is present.
- Existing user MCP servers and hooks are preserved when MultiAgent updates the
  project configuration. A copied config without the MultiAgent environment
  fails closed instead of pointing at another machine's path.

Running sessions must be restarted once after the managed MCP entry is added;
MCP clients read their project configuration only during process startup.
