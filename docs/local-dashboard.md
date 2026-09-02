---
type: Operational Model
title: Local Dashboard
description: "Loopback monitoring and control surface backed by the current Electron runtime."
tags:
  - dashboard
  - monitoring
  - loopback
status: stable
stale_after: 2026-10-31
sources:
  - id: web-services
    resource: ../app/electron/services/web-services.mjs
    title: "Dashboard and Remote service"
  - id: web-tests
    resource: ../app/electron/services/web-services.test.mjs
    title: "Web-service contract tests"
  - id: remote-client
    resource: ../app/electron/remote-pwa/app.js
    title: "Shared Dashboard and Remote client"
  - id: session-create-broker
    resource: ../app/electron/services/remote-session-create-broker.mjs
    title: "Acknowledged session creation broker"
---

# Local Dashboard

The production Dashboard is `LocalDashboardService` in the Electron process.
It binds to loopback and projects desktop-owned state into the shared web
client.[^web-services]

## Data and control surface

The Dashboard exposes bounded endpoints for:

* workspace, project, Screen, session, runtime, and hook state;
* terminal snapshot plus live SSE deltas;
* terminal input, attachments, cancel, restart/activation, create, and rename;
* Codex/Claude transcript chat;
* project document listing, Markdown/image reading, and isolated HTML preview;
* local usage history and provider account-limit snapshots.[^web-services][^web-tests]

The browser does not own a second terminal. Mutations resolve an agent against
the Electron-owned PTY and return a conflict when the lifecycle state makes the
request unsafe.
The session picker is derived from the coordinator's enabled-tool catalog.
Creation keeps the HTTP request open until the coordinator has validated the
current catalog, claimed the new agent ID, and inserted the session; only then
does the Dashboard return `201 Created`.[^web-services][^session-create-broker]

## Update behavior

Initial terminal state is delivered as a snapshot; later output arrives as SSE
deltas. Hook and workspace changes refresh the projected state. Periodic client
refresh remains a recovery mechanism, not the authoritative activity source.[^remote-client]

## Boundary

Loopback Dashboard access is distinct from external Remote access. External
authentication, account approval, Cloudflare tunnel assumptions, Android return
tickets, and push/device monitoring belong to [Remote service](remote-service.md).

MiraControl does not scrape this general Dashboard payload. It uses the smaller
authenticated contract in [MiraControl integration](miracontrol-integration.md).

[^web-services]: Dashboard and Remote service
[^web-tests]: Web-service contract tests
[^remote-client]: Shared Dashboard and Remote client
[^session-create-broker]: Acknowledged session creation broker
