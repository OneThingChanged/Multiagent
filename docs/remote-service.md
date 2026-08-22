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
  - id: device-monitor
    resource: ../app/electron/services/remote-device-monitor-service.mjs
    title: "Android foreground-monitor token service"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Runtime variant restrictions"
  - id: mobile-manifest
    resource: ../mobile/package.json
    title: "Android client manifest"
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
preview token depending on the client and content type.[^web-services]

## Android client

The Android package stores multiple Remote server profiles and returns from web
authentication through an app link/ticket flow. A foreground monitor can keep
an authenticated connection while the app is backgrounded and display local
completion notifications without Firebase.[^mobile-manifest][^device-monitor]

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
[^device-monitor]: Android foreground-monitor token service
[^runtime-variant]: Runtime variant restrictions
[^mobile-manifest]: Android client manifest
