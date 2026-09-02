---
type: Interface
title: Remote service
description: "Authenticated external access to desktop-owned sessions through the Remote PWA and Android client."
tags:
  - remote
  - pwa
  - android
  - security
status: stable
stale_after: 2026-10-31
sources:
  - id: web-services
    resource: ../app/electron/services/web-services.mjs
    title: "Dashboard and Remote server"
  - id: web-tests
    resource: ../app/electron/services/web-services.test.mjs
    title: "Remote authentication and endpoint tests"
  - id: session-create-broker
    resource: ../app/electron/services/remote-session-create-broker.mjs
    title: "Acknowledged Remote session creation broker"
  - id: remote-client
    resource: ../app/electron/remote-pwa/app.js
    title: "Remote PWA client"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Desktop browser ownership and Remote frame provider"
  - id: pty-submit
    resource: ../app/electron/services/pty-submit.mjs
    title: "Atomic single-line and bracketed multiline PTY submission"
  - id: device-monitor
    resource: ../app/electron/services/remote-device-monitor-service.mjs
    title: "Android foreground-monitor token service"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Runtime variant restrictions"
  - id: mobile-manifest
    resource: ../mobile/package.json
    title: "Android client manifest"
  - id: mobile-shell
    resource: ../mobile/App.tsx
    title: "Android profile and retained WebView shell"
  - id: mobile-remote-screen
    resource: ../mobile/src/screens/RemoteScreen.tsx
    title: "Android Remote WebView and back navigation"
  - id: remote-chat-ux-mockup
    resource: mockups/remote-chat-codex-style.html
    title: "Remote conversation and session-status UX prototype"
---

# Remote service

Remote is an authenticated external projection of the same sessions owned by
the Electron desktop process. It reuses the web-service core and static client
of the loopback Dashboard, then adds identity, approval, tunnel, mobile-return,
and device-monitoring controls.[^web-services][^remote-client]

## Authentication and approval

GitHub OAuth establishes identity; it does not by itself grant workspace access.
The desktop owner must approve the account in MultiAgent. OAuth state, signed
session cookies, and Android return tickets are short-lived and validated by the
server.[^web-services][^web-tests]

Remote configuration, approval state, tunnel metadata, and device tokens live
under local application data. Credentials, signing keys, and OAuth secrets must
not be committed to the repository.

## Session and content surface

Authenticated clients can read projected workspace/session state, stream
terminal output, submit input and attachments, cancel or activate work, create
or rename sessions, and view supported Codex/Claude chat transcripts. The
desktop resolves every mutation against its current PTY and lifecycle state.
Session creation is an acknowledged operation rather than a fire-and-forget
renderer event. The web request remains pending while the coordinator validates
the current project/tool catalog and claims ownership for the new agent ID. It
returns `201 Created` only after the session is inserted; missing coordinators,
stale projects, disabled tools, ownership failures, and timeouts remain visible
in the editor as errors.[^web-services][^session-create-broker]
Composer text and scheduled messages are isolated by agent ID for the lifetime
of the page, so changing the selected session does not move a draft or discard
an accepted queue. Normal chat submission uses one same-origin HTTP operation;
the desktop then writes the text and the discrete Enter key to the same verified
PTY. Multiline input, including image-tagged messages, is normalized and enclosed
as a terminal bracketed paste before the separate Enter so Codex and Claude cannot
consume the submit key while still parsing pasted lines. A failed immediate
submission leaves the draft and attachments available,
while an activation timeout keeps its queued message and exposes retry instead
of silently deleting it.[^web-services][^remote-client][^web-tests][^pty-submit]

Remote chat reads from the desktop conversation store with bounded sequence
cursors. The browser keeps a rendering cache, but that cache is not the source
of truth: reaching the top requests older stored pages, and an app/WebView
reload can reconstruct the transcript from SQLite.[^electron-main][^remote-client]

## Conversation UX prototype

The interactive Remote prototype keeps the conversation as the primary surface
and shows a completed result in transcript order without requiring the operator
to expand its work log first. Tool activity remains collapsible, while long
answers constrain tables and code blocks to their own horizontal scroll areas.
Single-session, side-by-side, and long-result states are selectable in one file
for layout review.[^remote-chat-ux-mockup]

Files, source control, and session status share one right sidebar. The status
tab follows the active conversation pane and summarizes alias, provider, model,
connection, lifecycle, project path, and synchronization state. Completion,
question, and error events update the tab badge without forcing the sidebar
open. Desktop users can collapse the sidebar to recover conversation width;
mobile users open it as an overlay drawer. This file is a design prototype, not
an assertion that the production Remote client already implements every shown
interaction.[^remote-chat-ux-mockup]

Document endpoints expose bounded project-local Markdown, images, linked assets,
and isolated HTML preview capabilities. They do not serve arbitrary absolute
filesystem paths. A chat or Markdown hyperlink to HTML opens its short-lived
preview capability directly instead of first navigating through Documents and
requiring a second launch action. Root-relative HTML asset
URLs are rebound to the same capability token so they cannot escape into the
Remote application root. Unreal Automation reports that only export
`index.html` and `index.json` are rendered by a dependency-free compatibility
view; missing Bower packages therefore do not leave the public preview blank.
The compatibility view escapes report text and keeps artifact resolution inside
the canonical project root.[^web-services][^web-tests]

## Shared browser relay

The session view includes a browser mode that controls the desktop-owned shared
browser profile. It lists the same stable tab IDs used by the embedded browser
and MCP integration, so switching sessions does not create an isolated browser
or lose authenticated browser state. Navigation runs on the desktop; therefore
an approved Remote client can view and operate a site such as
`http://localhost:3000` even though that address would refer to the phone if it
were opened locally.[^electron-main][^remote-client]

The relay captures the current browser viewport as a bounded, adaptive-quality
JPEG in memory. Frames carry source dimensions for coordinate scaling and are
served with `no-store` and `nosniff`; they are not written to the annotation or
attachment directories. The client maps taps, drag scrolling, wheel input,
allowlisted keys, and explicit text entry back to Electron input events. It can
open, activate, navigate, reload, and traverse shared tabs.[^electron-main]

Browser status and frame endpoints require the same approved Remote session as
workspace state. Browser mutations additionally require same-origin JSON
requests. This human-control surface never returns cookies, browser storage,
DOM snapshots, password values, or the browser profile. MCP selector automation
remains a separate authenticated loopback interface with stricter password
control blocking.[^web-services][^web-tests]

## Android client

The Android package stores multiple Remote server profiles and returns from web
authentication through an app link/ticket flow. A foreground monitor can keep
an authenticated connection while the app is backgrounded and display local
completion notifications without Firebase.[^mobile-manifest][^device-monitor]

Opening a profile lazily creates one WebView for that PC. The APK keeps an opened
profile view mounted but hidden when the operator returns to the combined Session
Hub or switches PCs, preserving page state and that WebView's navigation history
for the lifetime of the app process. Hidden profile pages receive a native
visibility signal and suspend workspace polling, terminal SSE, chat refresh, and
browser-frame capture until selected again; the native foreground notification
monitor remains independent. Only the visible profile handles Android Back. Its
managed Remote route history is traversed first, then control returns to the
Session Hub without revisiting OAuth redirects. Views remain origin-bound, and
deleting a profile destroys its retained view and revokes its native access
tokens.[^mobile-shell][^mobile-remote-screen]

The frequently polled workspace snapshot carries only a bounded terminal
fallback per agent; full terminal output continues over snapshot/SSE endpoints.
Session navigation retains a stable project/name order and updates existing rows
in place so hook status changes do not reorder the operator's tap targets.

Foreground-monitor bearer tokens are individually revocable. Revoking an
account or changing the configured owner removes its device-monitor access.

## Network boundary

Loopback HTTP is acceptable inside the desktop boundary. Public Remote access
is expected to terminate TLS at the configured Cloudflare tunnel; direct
plaintext LAN publication is not the preferred deployment.

Company runtime rejects external Remote and tunnel operations and does not
package the downloadable APK. It retains only the loopback Dashboard.[^runtime-variant]

Operational Dashboard behavior is documented separately in
[Local Dashboard](local-dashboard.md).

[^web-services]: Dashboard and Remote server
[^web-tests]: Remote authentication and endpoint tests
[^session-create-broker]: Acknowledged Remote session creation broker
[^remote-client]: Remote PWA client
[^electron-main]: Desktop browser ownership and Remote frame provider
[^pty-submit]: PTY message formatting and ordered submission
[^device-monitor]: Android foreground-monitor token service
[^runtime-variant]: Runtime variant restrictions
[^mobile-manifest]: Android client manifest
[^mobile-shell]: Android profile and retained WebView shell
[^mobile-remote-screen]: Android Remote WebView and back navigation
[^remote-chat-ux-mockup]: Remote conversation and session-status UX prototype
