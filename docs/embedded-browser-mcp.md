---
type: Interface
title: Embedded browser MCP
description: "Always-on shared browser tabs, managed MCP startup, fixed automation tools, element annotations, and security boundaries."
tags:
  - browser
  - mcp
  - security
status: stable
stale_after: 2026-10-31
sources:
  - id: browser-server
    resource: ../app/electron/services/browser-mcp-server.mjs
    title: "Managed browser MCP server"
  - id: browser-context
    resource: ../app/electron/services/browser-context.mjs
    title: "Snapshot and annotation sanitization"
  - id: browser-ui
    resource: ../app/src/components/EmbeddedDocumentBrowser.tsx
    title: "Embedded browser toolbar and selection UI"
  - id: browser-tabs-ui
    resource: ../app/src/components/PaneSlot.tsx
    title: "Pane browser tabs and reveal UI"
  - id: annotation-preload
    resource: ../app/electron/browser-annotation-preload.cjs
    title: "Isolated annotation preload"
  - id: preview-service
    resource: ../app/electron/services/document-preview-service.mjs
    title: "Project-scoped HTML preview service"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Native browser ownership and integration routes"
  - id: image-viewer
    resource: ../app/src/components/ImageViewer.tsx
    title: "Image viewer native-view occlusion"
  - id: native-view-occlusion
    resource: ../app/src/lib/nativeViewOcclusion.ts
    title: "Renderer overlay blockers for native views"
---

# Embedded browser MCP

MultiAgent owns one application-local browser profile with multiple native
browser tabs. A hidden host and blank tab are created before restored agent
sessions start, and the browser view disables background throttling. Closing
all visible workspaces therefore leaves the browser profile and its hidden tab
alive with the system-tray process. Each tab has a stable browser ID; agents
share the tab list and select tabs by ID. Cookies are shared between MultiAgent
tabs but remain separate from Chrome and Edge profiles.[^electron-main]

Every pane tab strip exposes a `+` action that creates a new embedded browser
tab at Google. Browser tabs participate in the same split, move, select, and
close operations as session and document tabs. Inactive browser views remain
alive but hidden, so switching tabs preserves navigation state without allowing
the native view to cover the selected pane.[^browser-tabs-ui][^electron-main]

Electron native browser views render above normal React layers. When the image
viewer opens, it acquires a shared native-view blocker; every embedded browser
temporarily hides its `WebContentsView` and restores only the active tab after
the viewer closes. Main-process visibility state also prevents a delayed bounds
update from exposing a blocked browser again.[^image-viewer][^native-view-occlusion][^electron-main]

## Managed MCP connection

The `multiagent-browser` MCP process uses newline-delimited JSON-RPC over stdio.
The PTY environment supplies its loopback integration port, bearer token,
associated agent ID, and script path. The MCP process opens no independent
network listener.[^browser-server]

Codex project configuration explicitly whitelists `MULTIAGENT_AGENT_ID`,
`MULTIAGENT_PORT`, `MULTIAGENT_TOKEN`, and `MULTIAGENT_MCP_SCRIPT` for the MCP
stdio child. MultiAgent waits for both the hidden browser and authenticated
loopback broker before it writes the managed configuration and launches a
Codex, Claude, or Qwen PTY. The stdio MCP child itself is still created by the
CLI at CLI startup; the browser and broker are the app-lifetime services that
must already be ready.[^electron-main]

The fixed tools are:

* `browser_tabs`, `browser_open`, and `browser_navigate`;
* `browser_snapshot` and `browser_screenshot`;
* `browser_click` and `browser_type`;
* `browser_back`, `browser_forward`, and `browser_reload`;
* `browser_attach_annotation`.[^browser-server]

Arbitrary page JavaScript is intentionally not exposed as a tool.

An agent MCP action that opens, navigates, clicks, types, reloads, or moves
through browser history also attaches the target browser ID to that agent's
current pane and selects it. The user can therefore watch the shared browser as
the agent searches or interacts with a page. `browser_open` accepts an omitted
URL and opens Google by default. A browser tab already moved to another split
keeps that split instead of being duplicated.[^browser-server][^electron-main]

## Remote human control

The authenticated Remote PWA can project these same tabs as memory-only JPEG
frames. A phone does not navigate its own WebView: navigation and input are
executed by the desktop browser, which also makes desktop-local HTTP services
reachable through the approved Remote session. Remote taps, drag scrolling,
wheel events, allowlisted keys, and explicit text are translated into native
Electron input events using the frame's source dimensions.[^electron-main]

Remote relay actions update the shared browser but do not select a desktop tab
or steal focus from the local operator. Only session-owned MCP actions request
automatic desktop reveal.[^electron-main]

This relay is deliberately narrower than MCP. It returns tab metadata and
pixels, not DOM snapshots, cookies, storage, or profile files. Frames are never
persisted, while annotation screenshots continue to use their separate local
workflow.

## Element selection and session delivery

Selection mode highlights the DOM element under the pointer. A click captures a
bounded descriptor containing tag/role/text, selector, attributes, rectangle,
viewport, sanitized HTML, and a PNG crop.[^annotation-preload][^browser-context]

`영역 선택` copies the resulting prompt to the clipboard. `선택 후 전송`
submits the same context to the associated active session. Hover alone only
previews the target; it does not capture or send data.[^browser-ui]

## Isolation and sanitization

Local HTML opens through a random project-scoped preview capability. Tokens
expire after 15 minutes and permit only approved GET/HEAD assets under the
canonical project root. Traversal, symlink escape, sensitive/build/cache paths,
unsupported types, and oversized HTML are rejected.[^preview-service]

The browser view does not receive the workspace preload. Snapshots and
annotations cap text, links, controls, attributes, selectors, and HTML; cookies,
authorization material, active scripts, event handlers, and password values are
excluded. MCP typing and clicking reject password controls.[^browser-context]

Integration calls require the per-process bearer token and associated agent ID
and reject browser-origin requests. A running CLI must restart after managed MCP
configuration changes because MCP clients load configuration at startup.

[^browser-server]: Managed browser MCP server
[^browser-context]: Snapshot and annotation sanitization
[^browser-ui]: Embedded browser toolbar and selection UI
[^browser-tabs-ui]: Pane browser tabs and reveal UI
[^annotation-preload]: Isolated annotation preload
[^preview-service]: Project-scoped HTML preview service
[^electron-main]: Native browser ownership and integration routes
[^image-viewer]: Image viewer native-view occlusion
[^native-view-occlusion]: Renderer overlay blockers for native views
