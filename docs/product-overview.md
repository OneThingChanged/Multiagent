---
type: Product Overview
title: MultiAgent product overview
description: "Product goals, production runtime, major capabilities, and supported variants."
tags:
  - overview
  - electron
  - product
status: stable
stale_after: 2026-11-30
sources:
  - id: desktop-manifest
    resource: ../app/package.json
    title: "Desktop package manifest"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Electron main process"
  - id: renderer-entry
    resource: ../app/src/main.tsx
    title: "React renderer entry"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Runtime variant policy"
  - id: mobile-manifest
    resource: ../mobile/package.json
    title: "Android client manifest"
---

# MultiAgent product overview

MultiAgent is an Electron desktop workspace for running several AI CLI sessions
as projects, Screens, tabs, and splits. The Electron main process owns PTYs and
privileged OS services; the React renderer owns workspace interaction and uses
an allowlisted preload bridge for privileged requests.[^electron-main][^renderer-entry]

## Product goals

* keep multiple Codex, Claude, and other terminal agents visible without
  conflating configured sessions with live processes;
* preserve provider conversation identity across full application restarts;
* expose the same desktop-owned sessions through a local Dashboard, an
  authenticated Remote service, and guarded integrations;
* make project documents, Git state, usage history, and an agent-controllable
  embedded browser available in the same workspace.

## Runtime shape

The production desktop entry point is Electron. `node-pty` provides terminal
processes, xterm renders them, and Electron Builder produces Windows NSIS
installers. Closing all workspace windows can leave the tray-owned application,
shared browser profile, and browser MCP broker running invisibly; a coordinated
full exit tears down PTYs and services.[^desktop-manifest][^electron-main]

The Android package is a separate client for the authenticated Remote service.
It stores multiple server profiles and displays the Remote UI through a
constrained WebView; it does not embed the desktop runtime.[^mobile-manifest]

## Major capabilities

* project folders, projects, sessions, Screens, tabs, and split layouts;
* local and SSH terminal sessions with hook-derived activity state;
* transcript-backed chat for Codex and Claude;
* project file tree, Git/submodule status, Markdown/image viewing, and isolated
  HTML preview;
* always-on shared browser tabs controlled through a fixed MCP tool surface;
* local token accounting plus provider account-limit snapshots;
* loopback Dashboard, authenticated Remote access, and MiraControl integration;
* Standard and Company installers with SHA-512 updater manifests plus a
  separately signed Android APK.

## Product variants

Standard enables the external Remote/tunnel path and packages a verified APK
for download. Company uses a distinct application identity, retains the
loopback Dashboard, rejects external Remote/tunnel operations, and excludes the
APK.[^runtime-variant]

Implementation boundaries are defined in [System architecture](system-architecture.md); exact
interaction behavior belongs in [Workspace interactions](workspace-interactions.md).

[^desktop-manifest]: Desktop package manifest
[^electron-main]: Electron main process
[^renderer-entry]: React renderer entry
[^runtime-variant]: Runtime variant policy
[^mobile-manifest]: Android client manifest
