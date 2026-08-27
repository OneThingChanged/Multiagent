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
  - id: remote-client
    resource: ../app/electron/remote-pwa/app.js
    title: "Remote PWA client"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Desktop browser ownership and Remote frame provider"
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

Document endpoints expose bounded project-local Markdown, images, linked assets,
and isolated HTML preview capabilities. They do not serve arbitrary absolute
filesystem paths. HTML links may open through the document area or a short-lived
preview token depending on the client and content type. Root-relative HTML asset
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
for the lifetime of the app process. Only the visible profile handles Android
Back: it traverses WebView history first, then returns to the Session Hub. Views
remain origin-bound, and deleting a profile destroys its retained view and
revokes its native access tokens.[^mobile-shell][^mobile-remote-screen]

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
[^remote-client]: Remote PWA client
[^electron-main]: Desktop browser ownership and Remote frame provider
[^device-monitor]: Android foreground-monitor token service
[^runtime-variant]: Runtime variant restrictions
[^mobile-manifest]: Android client manifest
[^mobile-shell]: Android profile and retained WebView shell
[^mobile-remote-screen]: Android Remote WebView and back navigation
