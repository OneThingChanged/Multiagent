---
type: Decision
title: Electron migration decision
description: "Decision record establishing Electron as the production desktop host and Tauri as a transition-only dependency."
tags:
  - decision
  - electron
  - tauri
status: stable
sources:
  - id: desktop-manifest
    resource: ../app/package.json
    title: "Production desktop entry and packaging"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Production Electron main process"
  - id: tauri-config
    resource: ../app/src-tauri/tauri.conf.json
    title: "Legacy Tauri transition configuration"
  - id: transition-manifest
    resource: ../app/scripts/write-electron-transition-manifest.mjs
    title: "Tauri-to-Electron updater transition"
  - id: electron-tests
    resource: ../app/electron/services/electron-services.test.mjs
    title: "Electron service coverage"
---

# Electron migration decision

## Decision

Electron is the production Windows desktop runtime. The package entry point,
NSIS installers, updater, PTY ownership, hooks, local services, workspace
windows, tray lifecycle, and embedded browser are implemented and shipped from
the Electron path.[^desktop-manifest][^electron-main]

## Rationale

The replacement path established explicit preload/IPC security, reliable
ConPTY ownership, hook state and provider resume, tray/full-exit lifecycle,
storage migration, SSH, Dashboard/Remote, usage accounting, updater behavior,
native browser integration, and packaged smoke coverage before becoming the
production host.[^electron-tests]

Keeping two current implementations in the human documentation caused repeated
contradictions about Rust commands, window ownership, monitoring, and usage.
Current behavior must therefore be documented from Electron sources first.

## Consequences

* new desktop features and fixes target Electron;
* Tauri source, plugins, signatures, and JSON manifests remain only where older
  installed clients still need an updater transition;
* the transition assets are not evidence that Tauri still owns production PTYs
  or services;
* removing the remaining Tauri assets requires an explicit compatibility
  decision after the supported installed base has transitioned.[^tauri-config][^transition-manifest]

Build and publication implications are captured in [Release playbook](release-playbook.md).

[^desktop-manifest]: Production desktop entry and packaging
[^electron-main]: Production Electron main process
[^tauri-config]: Legacy Tauri transition configuration
[^transition-manifest]: Tauri-to-Electron updater transition
[^electron-tests]: Electron service coverage
