---
type: Architecture
title: System architecture
description: "Production process boundaries, workspace domain model, layout invariants, persistence, and IPC extension rules."
tags:
  - architecture
  - electron
  - ipc
  - layout
status: stable
stale_after: 2026-11-30
sources:
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Electron main process"
  - id: preload
    resource: ../app/electron/preload.cjs
    title: "Renderer preload bridge"
  - id: main-contract
    resource: ../app/electron/ipc-contract.cjs
    title: "Main-process IPC validation"
  - id: renderer-contract
    resource: ../app/src/platform/ipcContract.ts
    title: "Renderer IPC types"
  - id: shared-types
    resource: ../app/src/types.ts
    title: "Workspace domain types"
  - id: layout
    resource: ../app/src/lib/layout.ts
    title: "Layout tree algebra"
  - id: group-operations
    resource: ../app/src/lib/groupOps.ts
    title: "Screen and tab transitions"
  - id: persistence
    resource: ../app/src/lib/persistence.ts
    title: "Workspace persistence and migration"
---

# System architecture

## Process and trust boundaries

The Electron main process is the privileged owner of filesystem and process
access, PTYs, hooks, HTTP services, updates, notifications, tray lifetime, and
native `WebContentsView` browser instances.[^electron-main]

The normal renderer receives only the preload bridge. Command names and event
names are allowlisted; command arguments are validated again in the main
process. TypeScript IPC declarations improve caller safety but do not replace
runtime validation.[^preload][^main-contract][^renderer-contract]

External HTML does not execute in the trusted workspace renderer. Local preview
and web content use native views with a narrow annotation preload. Remote web
clients talk to desktop-owned services rather than spawning their own PTYs.

## Workspace domain model

A project identifies a working folder and optional SSH target. An agent is a
configured session with a tool, alias, launch settings, provider resume ID, and
optional content-worker configuration. Configured state and a live PTY are
separate concerns.[^shared-types]

A Screen is stored as a `Group`. Its `LayoutNode` tree contains:

* leaf nodes with an ordered tab list and one active tab;
* horizontal or vertical split nodes with child sizes;
* terminal, document, and Git-history tabs in the same layout algebra.

Validation removes invalid or duplicate agent references, normalizes sizes,
collapses empty splits, and flattens one-child splits. One agent can occupy only
one layout location and one mounted terminal DOM host at a time.[^layout]

Moving a session to a tab or split removes it from the previous location.
Closing a terminal tab detaches it into a solo Screen; deactivation is the
separate action that terminates its PTY. Session-locked Screens reject unrelated
session moves.[^group-operations]

## Persistence and lifetime

Workspace models are versioned and normalized when loaded. Runtime PTY objects,
native browser views, bearer tokens, and process-local service state are never
serialized as workspace data.[^persistence]

Workspace windows may close while the tray-owned process continues. A full exit
uses coordinated teardown and provider resume metadata; see [Session lifecycle
and resume](session-lifecycle-and-resume.md).

## Adding a privileged capability

1. Add a narrowly named command and validate all untrusted arguments in the
   main-process contract.
2. Add the matching renderer type and preload exposure.
3. Implement a capability-specific handler; do not expose generic shell,
   filesystem, or page-JavaScript execution.
4. Add success and rejection tests at the boundary.

Electron is the production host. Tauri files remain only for the updater
transition described in [Electron migration decision](electron-migration-decision.md).

[^electron-main]: Electron main process
[^preload]: Renderer preload bridge
[^main-contract]: Main-process IPC validation
[^renderer-contract]: Renderer IPC types
[^shared-types]: Workspace domain types
[^layout]: Layout tree algebra
[^group-operations]: Screen and tab transitions
[^persistence]: Workspace persistence and migration
