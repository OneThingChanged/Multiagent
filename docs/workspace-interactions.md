---
type: Product Behavior
title: Workspace interactions
description: "Durable navigation, session, pane, terminal, document, source-control, and notification behavior."
tags:
  - ux
  - workspace
  - sessions
status: stable
stale_after: 2026-11-30
sources:
  - id: app-shell
    resource: ../app/src/App.tsx
    title: "Workspace shell and actions"
  - id: sidebar
    resource: ../app/src/components/Sidebar.tsx
    title: "Project and session sidebar"
  - id: pane-slot
    resource: ../app/src/components/PaneSlot.tsx
    title: "Pane and tab host"
  - id: terminal-area
    resource: ../app/src/components/TerminalArea.tsx
    title: "Terminal and chat surface"
  - id: file-tree
    resource: ../app/src/components/FileTreePanel.tsx
    title: "File tree panel"
  - id: document-viewer
    resource: ../app/src/components/DocViewer.tsx
    title: "Document viewer"
  - id: settings
    resource: ../app/src/components/SettingsModal.tsx
    title: "Settings surface"
  - id: session-storage-ui
    resource: ../app/src/components/SessionStorageList.tsx
    title: "Session JSONL storage catalog UI"
  - id: session-storage-service
    resource: ../app/electron/services/session-service.mjs
    title: "Session JSONL metadata catalog"
---

# Workspace interactions

## Navigation and visibility

The left sidebar organizes project folders, projects, configured sessions, and
Screens. Search, active-only filtering, and folder/project collapse change what
is visible; they do not delete or activate sessions.[^sidebar]

Removing a session from the sidebar deactivates its live PTY. Permanent session
deletion is a separate confirmed action from the session context menu. Project
creation can create an initial session using the tool and dangerous-mode choice
made in the creation flow.[^app-shell]

## Screens, tabs, and splits

The center workspace uses one layout tree for terminal, document, and Git
history tabs. Dragging can reorder tabs, move a tab to another pane, or create a
split. Moving an agent removes its previous layout placement; the same terminal
cannot be rendered in two panes simultaneously.[^pane-slot]

Closing a terminal tab changes layout ownership but does not mean “delete this
session.” Process activation/deactivation and tab placement remain separate
operations.

## Terminal and chat

All agents have a terminal view. Codex and Claude additionally have a
transcript-backed chat view; other tools remain terminal-only. Sending to an
inactive chat-capable session first activates it and then waits for startup
readiness before delivery.[^terminal-area]

Runtime state and work state are distinct. Starting/recovering describes the
process lifecycle; working/waiting/blocked/done comes from hooks. A completion
highlight clears when the user opens the session or submits new work.

## Session transcript storage

MultiAgent keeps a metadata-only catalog of local Codex and Claude JSONL
transcripts under Electron user data. Project ownership is derived from each
transcript's `cwd` and session ID instead of the provider's date-based folder
layout. Multiple files with one session ID, including Claude child-agent
records, are grouped into one session total.[^session-storage-service]

Project properties list every catalogued transcript session for that project;
session properties show only the currently linked session ID. Each row exposes
its aggregate size, file count, last modification time, and primary path.
Remote session storage is not scanned.[^session-storage-ui]

Deletion requires confirmation and moves the matched JSONL files to the OS
Recycle Bin. MultiAgent refuses deletion while the associated session has a
live terminal, then removes the deleted paths from its catalog after a
successful move.[^session-storage-ui][^session-storage-service]

## Files, Git, and documents

The right sidebar selects the project root or a discovered Git submodule,
filters the file tree, opens the native Explorer location, and exposes Git
changes/history. Filtered folders with no matching descendants are omitted.[^file-tree]

Markdown renders in the React document viewer, images use the image viewer, and
HTML opens in the isolated embedded browser. Document and Git tabs participate
in the same Screen layout without becoming agents.[^document-viewer]

## Settings and notifications

Settings govern available tools, hooks, shortcuts, Remote, SSH, appearance, and
session defaults. Launch-only settings apply on the next PTY start rather than
mutating an existing process.[^settings]

Completion attention is visual and can also drive desktop/Remote notifications.
Notification state must never be treated as authoritative work completion; hook
state remains the source for activity.

The domain invariants behind these interactions are documented in
[System architecture](system-architecture.md).

[^app-shell]: Workspace shell and actions
[^sidebar]: Project and session sidebar
[^pane-slot]: Pane and tab host
[^terminal-area]: Terminal and chat surface
[^file-tree]: File tree panel
[^document-viewer]: Document viewer
[^settings]: Settings surface
[^session-storage-ui]: Session JSONL storage catalog UI
[^session-storage-service]: Session JSONL metadata catalog
