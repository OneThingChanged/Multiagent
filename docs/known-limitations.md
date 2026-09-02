---
type: Constraint
title: Known limitations
description: "Current implementation constraints and review triggers, excluding resolved historical work."
tags:
  - limitations
  - operations
status: draft
stale_after: 2026-09-30
sources:
  - id: shared-types
    resource: ../app/src/types.ts
    title: "Supported runtime, work-state, and chat model"
  - id: layout
    resource: ../app/src/lib/layout.ts
    title: "Unique session placement"
  - id: spawn
    resource: ../app/src/lib/spawn.ts
    title: "Local and SSH spawn behavior"
  - id: terminal-stream
    resource: ../app/electron/services/terminal-stream.mjs
    title: "Codex normal-buffer scrollback filter"
  - id: session-service
    resource: ../app/electron/services/session-service.mjs
    title: "Local provider transcript discovery"
  - id: preview-service
    resource: ../app/electron/services/document-preview-service.mjs
    title: "Bounded project preview"
  - id: usage-service
    resource: ../app/electron/services/usage-service.mjs
    title: "Local usage derivation"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Variant restrictions"
  - id: desktop-manifest
    resource: ../app/package.json
    title: "Desktop updater and packaging configuration"
---

# Known limitations

This file lists current constraints only. Resolved phase notes and speculative
feature ideas were removed during OKF conversion because they are not active
limitations.

## Session and layout

* Full application exit terminates PTYs. Codex and Claude recover provider
  conversation identity; MultiAgent does not preserve the original OS process.
* One agent can occupy one layout location and one mounted terminal DOM host at
  a time. Mirroring the same live xterm in multiple panes is unsupported.
* Transcript-backed chat is supported only for Codex and Claude.[^shared-types][^layout]

## Hooks, terminal, and SSH

* Work-state precision depends on valid provider hooks. Runtime readiness can
  recover without hooks, but WORK/WAIT/DONE transitions become less specific.
* Codex normal-buffer scrollback uses a dedicated repaint filter. Claude and
  plain shells pass through unchanged. Full-screen TUI/alt-screen behavior is
  not equivalent to native normal-buffer history.[^terminal-stream]
* Remote SSH provider transcripts and project folders cannot be indexed locally
  unless they are present on this machine. POSIX SSH does not use the Windows
  reverse-hook/resume path.[^spawn][^session-service]

## Launch-only settings

Provider session pins, terminal compatibility options, dangerous mode, and
content-worker configuration are resolved when the PTY starts. Changing them
does not mutate a running CLI; reopen the session.

## Documents and browser

HTML preview is intentionally project-scoped, time-limited, type-limited, and
protected against traversal/symlink escape. Reports that depend on disallowed
absolute resources or external browser-profile state may not render identically
inside MultiAgent.[^preview-service]

Some third-party sites may impose their own embedded-browser login, bot, popup,
or device-verification flows. MultiAgent cannot guarantee that every site
accepts an Electron browser profile.

## Usage and variants

Usage history is a local transcript-derived estimate, not billing truth. Missing
or remote-only transcripts are not reconstructed from provider servers.[^usage-service]

Company runtime intentionally disables external Remote/tunnel operations and
does not package the Android APK.[^runtime-variant]

## Windows distribution

Windows installers currently have no trusted Authenticode signature. Update
manifests carry the installer SHA-512 and Electron Updater verifies it, but a
fresh manual installation can still show an unknown-publisher warning. Revisit
this limitation when a trusted Windows code-signing certificate is configured.[^desktop-manifest]

The Store MSIX pipeline is implemented but has not yet completed Partner Center
identity binding, WACK, or Store certification. A development MSIX does not
remove warnings for public users; only the Microsoft-signed Store result closes
that distribution limitation.

## Review policy

This concept remains `draft` because limitations are time-sensitive. Promote or
remove an item only after checking the cited implementation and a focused test;
do not keep completed fixes here as “implemented candidates.”

[^shared-types]: Supported runtime, work-state, and chat model
[^layout]: Unique session placement
[^spawn]: Local and SSH spawn behavior
[^terminal-stream]: Codex normal-buffer scrollback filter
[^session-service]: Local provider transcript discovery
[^preview-service]: Bounded project preview
[^usage-service]: Local usage derivation
[^runtime-variant]: Variant restrictions
[^desktop-manifest]: Desktop updater and packaging configuration
