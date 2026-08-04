# UX / Interactions

## Top Bar (Custom Titlebar)

The Windows default titlebar and `File/Edit/View/Window` menu were removed and replaced with a 36px custom top bar (Electron only). Minimize/maximize/close are a native overlay drawn by the OS, so Win11 Snap Layouts and the close-confirmation flow still work.

```
[✻ MultiAgent] [⫞ left sidebar] ·· [⌕ Quick Open] [! notifications] ·· [pin] [new window] [🤖 pet] [⚙ settings] │ [⫟ file tree] [─ ▢ ✕]
```

- **⫞**: collapse/expand the left sidebar — state persists across restarts (`multiagent.sidebarOpen.v1`)
- Empty center area: **window drag** (double-click = toggle maximize)
- **⌕ Quick Open**: unified search (same as Ctrl+K) / **!**: Attention Center (unread count badge)
- **Pin** (always on top) · **New window** · **🤖 Desktop Pet** · **⚙ Settings** — moved from the sidebar header
- **⫟**: collapse/expand the right file tree
- Removing the menu also fixed the issue where the default menu's Ctrl+R accelerator stole terminal input. DevTools is `F12`/`Ctrl+Shift+I`, dev-mode reload is `Ctrl+Shift+R`
- Changing the theme also changes the native window buttons' background/symbol colors

## Sidebar

- The sidebar body is a collapsible `machine → project folder → project → session` tree. Project folders are UI-only collections and never change a project's physical cwd or SSH routing. Each project row lists its sessions below it. Projects and sessions are all shown **compressed to one line**; details (path, session ID, creation time, etc.) are in the hover title and the right-click properties
- **Top search box**: filter by project-folder/project/session name. A folder-name match shows all projects below it, a project-name match shows all sessions of that project, and a session-name match shows only that session. Matching ancestors auto-expand while searching
- **Folder button (`▣`) next to Projects**: create a local project folder. When SSH machine groups are visible, the `+` on each machine row creates a folder scoped to that machine
- **Project folder drag**: reorder folders within the same local/SSH machine. Drag a project onto a folder header to move it; dropping on `미분류` removes its folder assignment. Cross-machine drops are rejected and never alter SSH routing
- **Project folder right-click**: rename or delete. Deleting a folder never deletes projects; its projects move to `미분류`
- **Project `>`/`v` button**: collapse/expand the session list
- **Project left-click**: activate the project + show the first session group (expands if collapsed)
- Creating a project also creates and starts `Session 1`, so the project remains visible when `Active only` is enabled
- **Project drag**: drag up/down to reorder within a folder, or onto another folder to move it
- **Session left-click**: switch to that session's group. The clicked session becomes the active tab of that leaf and clears its unread completion highlight
- **Session double-click**: rename alias popup
- **Hovering a project row shows a `+` button on the right** — clicking activates that project and immediately opens the new session modal
- **Dot button next to the Projects title**: toggle between all sessions and active sessions only. Every workspace window has the same control. Filtering never forces machines, project folders, or projects open; their saved collapse state remains usable. Search matches still auto-expand their ancestors
- **`+` button next to the Projects title**: new project in the current workspace window. The modal can place it in any project folder belonging to the selected local/SSH machine
- **Session right-click**: context menu
  - Switch (jump to current group) / add as tab / split right / split down
  - **Open in new window** — transfers the session into a new, equal workspace window. It is removed from the current Screen and shown as **"사용 중"** in every other window. All windows expose the same project/session creation, filtering, rename, drag, and context-menu features. Closing the owning window releases its sessions so any remaining/new workspace can claim them
  - Rename session alias
  - **Deactivate session** — removes the session from the current screen and kills only the PTY to free resources while keeping it in the sidebar. Selecting it again restarts it with resume
  - **Relink to current session** (현재 세션으로 재등록) — finds the newest on-disk session for that tool+folder and updates the resume target (`lastSessionId`) (recovery when the session ID was lost, e.g. hook errors)
  - **Delete session** — after a confirmation/cancel dialog, stops the PTY and permanently removes the session from the MultiAgent sidebar/layout/storage
  - Pin group to current sessions / unpin group sessions
  - **Properties** — name, project, tool, status, session ID, creation time, folder, agent ID + edit toggles: **Dangerous mode** (skip-permissions flag), **Alt-screen mode** (Codex only — explicit opt-out that uses Codex's alternate screen/internal history, so the conversation does not remain in terminal scrollback). Leave it off for `--no-alt-screen`, native scrollback, Ctrl+F, and drag copy. Toggle changes apply after deactivating and reopening the session
- **Project right-click**: rename / **Properties** (folder, session count, created/opened times, project ID) / **Delete project** (after confirmation, cleans up sessions, PTYs, and scrollback)
- **× button**: deactivate the session without deleting it. The session remains in the sidebar and can be resumed by selecting it again
- **Drag**: drag sessions from any expanded project onto panes to use the drop-zone system (sessions from other projects can also be placed on the same screen)

### Sidebar Visuals

- Active project: left blue bar + highlighted background
- Active group members: light blue background + left bar
- Active tab session of the active leaf: deep blue background
- Pinned group members: `PIN` badge next to the name
- Unread completed work on a running/starting/recovering session: animated cyan-tinted background sweep + cyan dot. Inactive/exited sessions keep their Attention Center history without lighting up the sidebar. Opening the active session from the sidebar/tab, or starting new work in that session, marks the previous completion as read and removes both effects
- Between groups: thin gray divider
- Session item: status dot / tool icon / alias / dangerous `!` / close `x` (one line)

### Status Dots

| color | meaning |
|---|---|
| gray | idle — not spawned yet (restored from saved state) |
| yellow (no blink) | starting — right after spawn, waiting for first data |
| cyan + pulse animation | recovering — the PTY has restarted after app relaunch but the AI CLI has not emitted a ready hook yet |
| green | running — normal |
| yellow + pulse animation | working — Claude/Codex processing a response (based on hook signals) |
| gray | exited — PTY terminated |

## New Project / Session Modals

- **New Project**: enter a project name and root folder, then explicitly choose the first session tool. No tool is preselected, so the project cannot be created until Claude/Codex/Qwen/Cline/Shell is chosen. Tools with a permission-bypass flag also expose a **Dangerous mode** checkbox for `Session 1`. The folder becomes the session cwd and Docs scan root; `Session 1` starts immediately with the selected options
  - **Sidebar folder**: optional one-level project collection. Only folders for the selected local machine or SSH host are offered; the default is `미분류`
  - **Run on remote host (SSH)** toggle: when on, instead of a folder, pick a registered SSH host (dropdown) and enter a **remote folder**. This project's sessions run over SSH on that machine (register hosts first in Settings → SSH Hosts)
- **New Session**: creates a session inside the active project
- **Session alias**: the name shown in the sidebar/tabs/Docs subtitle
- **AI tool**: Claude Code / Codex / Shell only
- **Dangerous mode**: when checked, auto-adds `--dangerously-skip-permissions` (Claude) / `--dangerously-bypass-approvals-and-sandbox` (Codex) / `--yolo` (Qwen). It is available in both New Project and New Session, and highlighted in red ⚠ after creation
- Does not close on backdrop click. Only Cancel/Esc closes (prevents losing input mid-typing)

## Panel Tab Strip

- Horizontal strip at the top. Active tab has a blue indicator on top
- **Tab click**: activate that tab + make that leaf the active path
- **Tab ×**: closes just that tab. The session splits off into a new solo group (still alive in the sidebar, revivable by clicking). If it was the last tab, the pane disappears
- **Tab right-click menu**: split right/down · **Pin tab** (📌, excluded from mass closes) · close (Ctrl+W) · **Close other tabs** · **Close tabs to the right** · reopen recently closed tab · rename · **Tab color** (9 colors + none, stripe on top of the tab). Pinned tabs are skipped by "close others/close to the right". Pin and color persist across restarts
- **Tab drag**: onto another pane → 5-zone drop (below)

## Drag & Drop — 5-Zone Drop

Hovering the mouse over a pane while dragging shows 5 zones:

| zone | action |
|---|---|
| Center | add as a tab of that pane (activates if already there) |
| Top edge | vertical split above/below that pane, inserted above |
| Bottom edge | vertical split, inserted below |
| Left edge | left/right horizontal split, inserted left |
| Right edge | horizontal split, inserted right |

If the target's parent split already has the same direction, it is added as a sibling of that split (sizes auto-redistributed); otherwise the target leaf is wrapped in a new split.

Dropping a leaf's only tab onto its own pane is a no-op (`isOnlyTabSource` guard).

A session-pinned group cannot accept outside sessions via tabs/splits/drag. Rearranging existing members inside a pinned group is allowed. Sessions belonging to a different pinned group also cannot move into the current group.

Sessions from different projects can be placed as tabs/splits within the same group. In that case, each session still appears under its own project in the sidebar, with the active group background/bar showing they are joined on the same work screen.

## Pinning Group Sessions

- Right-click a group member in the sidebar and choose **Pin group to current sessions** (현재 세션으로 그룹 고정) to store the sessions in that group that have a `lastSessionId` into the group
- Afterwards, sessions spawned in that group prefer the group's pinned session IDs over `agent.lastSessionId`
- Pinned groups show a `PIN` badge in the sidebar
- Choosing **Unpin group sessions** (그룹 세션 고정 해제) removes the group's pins and each session's latest `lastSessionId` is used again
- Pins apply from the next spawn. Already-running terminal processes are not force-restarted

## Split Handles

- Thin gray band between splits. Turns blue on hover
- Drag to adjust split ratios. Minimum width ~120px

## File Tree Sidebar & Document Tabs

Orca style: the right sidebar shows **only the file tree**, and clicking a file opens it as a **document tab in the active pane of the main workspace** (coexisting in the same tab strip as terminal tabs).

### File Tree Sidebar

- Open/close via the **⫟ button on the right of the top bar** or `Ctrl+Shift+D` (also closes via the panel header ×). Open state and width persist to the next run
- The topmost panel tabs switch between **🗀 Files / ⎇ Source Control** views. The ⎇ tab shows a changed-file count badge
- A layout sibling, not an overlay — opening shrinks the terminal area. Drag the boundary to adjust width
- **Project dropdown**: directly choose which project to show at the top of the panel (name + folder path list). Follows the active project by default
- **Repository dropdown**: when the selected project has `.gitmodules`, choose the main repository or any initialized submodule. Nested submodules are discovered recursively; uninitialized entries stay visible but disabled. The selected repository is remembered per project
- **Pin (📌) button**: when on, the tree stays fixed to the current project even when switching sessions/projects. Pin state persists across restarts and auto-releases if the pinned project is deleted
- Shows **all files/folders** of the displayed project folder (excluding `node_modules`, `.git`, `target`, `dist`, `build`, `.next`, `.cache`, `.venv`, `__pycache__`, `out`)
- Folders lazy-load on expand (max 2,000 entries per directory)
- **Expansion state remembered per project and repository** — restored when returning from another project/submodule or restarting the app
- Toolbar: expand all (⊞, 400-folder cap) / collapse all (⊟) / refresh (⟳)
- **Git status display**: if the project is a git repo, changed files get a color + one-letter badge — `M` modified (yellow) · `U` untracked (green) · `A` staged (green) · `D` deleted (red, strikethrough) · `R` renamed. Folders get the representative status of descendants propagated (D > M > A > U). Refreshes when an agent answer completes, the app regains focus, the repository changes, a Git/file operation finishes, or the user requests it; repeated requests are coalesced while a scan is active
- **Find files** input: filename substring search (recursive into subfolders, max 200 results). `Esc` clears
- **Type filters**: MD / image / code / HTML chips can be combined. Filtering scans collapsed descendants too and keeps only matching files plus their ancestor folders; a folder with no matching file anywhere below it is hidden
- SSH projects do not support the file tree (guide text shown)

### Source Control View (⎇ tab)

- All status, branch, stage/unstage, commit, diff, and history actions run against the repository selected in the Repository dropdown
- Branch bar: current branch + `↑ahead ↓behind` + upstream (`vs origin/main`)
- Commit message input + **Stage All** / **Commit** buttons (commit also via `Ctrl+Enter`)
- **Commit behavior** (VS Code style): if there are staged items, `Commit (N)` = commit only those (selected commit). If nothing is staged, `Commit All (N)` = stage all then commit. Enabled whenever there is a message + changes, so there is no dead end
- **Row selection**: single click = toggle checkbox, **Shift+click = range select**, double-click = open as document tab (no text highlight)
- **Multi-select batch bar**: with items selected, a top bar shows `N selected · Stage · Unstage · Discard · ×` — handle many files at once
- **Staged / Changes** groups: row hover shows `+`/`−` (stage/unstage) and `↺` (Discard) buttons. Partial staging (`MM`) shows on both sides
- **Discard**: after a confirmation dialog — modified/deleted (M/D) are restored to the last commit state via `git restore`, untracked (U) goes to the trash, staged-new (A) is unstaged then trashed. May fail if the file is locked by another program (e.g., Unreal Editor)
- Per-file `+added/−deleted` line counts and status colors, with the 8 most recent commits at the bottom
- **Right-click context menu**: open / file history / external diff / **reveal in Explorer** / stage-unstage / commit (this file only) / discard / file history popup
- Refreshes on entry, agent completion, app focus, manual refresh, and immediately after Git actions. Repository detection is separate from the 30-second safety timeout, so slow/error states are not mislabeled as non-repositories. Push is unsupported (use the terminal)

### File Tree Context Menu

- **File**: open (document tab) / open with OS default app / copy path / copy relative path / duplicate / reveal in Explorer / rename / delete (trash)
- **Folder**: new file / new folder / copy path / copy relative path / reveal in Explorer / rename / delete (trash)
- **Empty area right-click**: new file / new folder at the project root
- New file, new folder, and rename use **inline input** in the tree (Enter to confirm / Esc to cancel; on rename, the part before the extension is auto-selected)
- Deletion is not permanent — it goes to the **OS trash** and is recoverable
- All file operations are sandboxed inside the project folder, and the folder and git status auto-refresh afterwards

### Document Tabs (DocViewer)

- In the tree, **double-click = open** (single click selects/deselects). Opens as a tab in the active pane; **reopening the same file focuses its existing tab** (if open on another Screen, it moves to the current pane)
- Docs can be opened even with no session screen — a new single-document screen is auto-created
- Rendering by file kind:
  - `.md`/`.markdown` — GFM + code highlight render
  - `.html`/`.htm` — **sandbox iframe** render (the document's own scripts are blocked). http(s) links inside the document open in the OS default browser on **Ctrl+click (or wheel click)** (plain click ignored, `#anchor` navigates within the document)
  - images (png/jpg/gif/webp/svg/…) — image viewer
  - other text files — read-only syntax-highlighted source (2MB limit)
  - binary/oversized — "Open with OS" / "Reveal in Explorer" buttons
- Tab header: relative path + `Refresh` (re-read) / `Open` (default program) / `Reveal` (Explorer location)
- Document tabs support **drag split/move**, `Ctrl+1~9` switching, and `Ctrl+W` close, same as terminal tabs. Unlike sessions, closing leaves no trace (not a Ctrl+Shift+T restore target)
- Document tabs are also restored after a restart. If the file was deleted, an error panel (Retry/Reveal) shows
- Document tabs are not exposed on Remote (Remote PWA) or the Dashboard (only terminal sessions sync)
- Document paths in terminal output (`docs/README.md`, `Docs/Foo.md:42`, etc.) are clickable. `.md`/`.html` inside the project open as document tabs; **absolute paths outside the project folder** open the OS default app as before. **Ctrl+click** opens even in-project files with the OS default app (browser for html) instead of in-app
- Document search results in QuickOpen (`Ctrl+K`) also open as document tabs

## Settings

The sidebar top **Settings** (설정) button opens the popup (`Esc`/outside click/close).
The navigation is General / Agents / Shortcuts / Agent Hooks / Dashboard / Remote /
Version Control / SSH Hosts / About (company builds exclude Remote):

- **General**: theme (Soft/GitHub/Warm/Light — shared across app/terminal/Docs) + notification sound (System/Custom/TTS/Off, Test), TTS message, Windows notification toggle, and duplicate-audio prevention + **Desktop Pet** show/reset position
- **Agents**: available tool detection, bottom usage-limit display, and Qwen region. Windows PTY selection is intentionally absent: all sessions use ConPTY
- **Shortcuts**: command keyboard shortcut editing
- **Agent Hooks**: Codex/Claude hook status, check, and repair
- **Dashboard**: monitoring/usage dashboard server on/off·port, copy URL, Reindex ([USAGE_DASHBOARD.md](USAGE_DASHBOARD.md))
- **Remote PWA** (standard only): mobile remote server·Cloudflare tunnel Start/Stop, GitHub OAuth/Device Flow·Owner, named tunnel (token/hostname/port), account approval management. Monitor distinguishes working/question/done/waiting/inactive, and you can pick the desktop's Screen/pane/tab layout or an individual Session to view the latest request/output/question and send short commands. **Documents** browses and previews local-project Markdown/HTML files; HTML is sandboxed and scripts are blocked. Supports mobile home screen install, foreground question notifications, and Web Push completion notifications even after the PWA window closes ([REMOTE.md](REMOTE.md))
- Remote Screen panes independently switch between parsed chat and the live terminal, so a multi-pane Screen can mix both views while retaining its selected session tabs
- Remote Screen/Session/Documents/Usage workspaces fill the viewport and do not scroll the whole browser page. Navigation and the active content surface own scrolling, preventing nested right-edge and content scrollbars. Individual Session detail hides the global header/status dashboard at every viewport width and uses the recovered height for the conversation
- Remote omits the desktop-oriented Monitor overview and global status cards. Its root route resolves directly to the first available Screen, with Session, Documents, and Usage as ordered fallbacks
- The Session header's navigation control collapses/restores the persistent left list on desktop and opens/closes the navigation drawer on mobile
- **Version Control**: external diff program command
- **SSH Hosts**: host registry for SSH remote sessions. Add/edit/delete hosts (label·remote OS·user·host·port·**auth method**·identity file [Browse] or password·extra options) + **Test connection**. For Windows hosts, **Use .cmd shims for npm CLIs** is ON by default, so even if PowerShell execution policy blocks `codex.ps1`/`claude.ps1`, it runs `codex.cmd`/`claude.cmd`. **Auth method**: key (auto IdentitiesOnly when an identity is specified, preventing "Too many authentication failures") / password (auto-typed on connect when stored; stored only in local `ssh-secrets.json`)
- **About**: author, version, **Check** (auto-update — downloads, installs, and restarts after signature verification), Releases, support diagnostics

Setting values are stored in localStorage and local JSON, persisting to the next run.
## Bottom Usage Status Bar

- The bottom of the Electron app always shows Codex·Claude account limits as **per-tool segments**. Each segment shows a tool icon + per-limit gauge bar (6px) + usage rate + time until reset (compact notation). Claude's per-model limits (e.g., Fable) attach inside the Claude segment with short names
- **Clicking a segment opens a popover just for that tool** above that spot: tool name, plan, refresh time + large gauge bars per limit window (8px), `N% used`, reset time. New providers like Gemini automatically get a segment once limit data arrives
- Codex reads from local session records containing `token_count.rate_limits`; Claude queries the usage endpoint with the OAuth token from `~/.claude/.credentials.json`, and snapshots per limit are kept in `usage.db`. Auto-refreshes when a session completes; **refresh** re-checks the latest session/endpoint
- Codex shows only the one representative account limit (`limit_id="codex"`); per-model weekly limits of the form `codex_<model>` (e.g., GPT-5.3-Codex-Spark) are hidden as noise. Claude shows the default limits (5-hour, weekly) and per-model weekly limits (e.g., Claude Fable, Opus) as independent items. Warning color from 70%, danger color from 90%
- Tools that do not provide account limit metadata (Shell, etc.) and SSH remote sessions are currently excluded from the bottom limit display. The existing Usage dashboard's local token accounting is unchanged

## Resource Manager (right of status bar)

- The **▦ memory segment** on the right of the status bar shows the total memory of the whole app process tree (UI + all local sessions) (20s cycle)
- Clicking opens a popover: top summary (`CPU % · total memory · % of system RAM`) + a **project group → session** hierarchy list. Session rows show status dot, name, process count, CPU%, memory, sorted by memory desc. Bottom `App processes (UI etc.)` = total − session sum
- While the popover is open, refreshes every 5s + refresh button. CPU% is computed as the delta between two samples, so it may show 0% right after the first display
- SSH sessions are excluded (no local processes). Windows uses a `Win32_Process` CIM query (~100ms), POSIX uses `ps`

## Ports (right of status bar)

- The **🔌 segment** on the right of the status bar shows the count of open TCP ports attributed to projects (workspace) (30s cycle + immediate scan when the popover opens)
- Popover: `N workspace · M external` summary + **port list per project group** (port · process name · `host:port`). The 🗀 in the group header jumps to the project
- Port attribution has 2 stages: ① if the listener process is a child of a session PTY → that session's project (dev server launched from the terminal) ② if the process command line contains the project folder path → that project (UnrealEditor etc. launched outside the terminal)
- **EXTERNAL PORTS**: remaining unattributed listeners shown in a collapsed section
- `0.0.0.0`/`::` wildcard binds are shown as `localhost`. Both IPv4+IPv6 collected, max 200

## Window Close / Full Exit

- In Electron, clicking **X closes only that workspace window**. The Electron main process, tray, and PTYs stay alive; closing the final workspace therefore does not quit the app
- Tray click reopens the most recently focused workspace layout and reattaches its live PTYs. Tray → **새 작업창** opens a separate blank peer window
- **Tray → Exit**, an ordinary relaunch, and an updater install all run the same graceful-save handshake
- Every open workspace records its running agents, saves its own layout/scrollback, and sends `/quit\r` to its Codex/Claude sessions. Electron waits for every workspace confirmation before exiting
- An updater install starts only after that save handshake completes. If the renderer does not answer, the main process uses a 5-second fallback; if launching the installer fails, the app returns to its usable state
- Next app run shows **Reopen previous sessions**. Confirming it starts the saved agents with `codex resume <id>` / `claude --resume <id>`
- See [RESUME.md](RESUME.md) for full behavior and limits
## Keyboard / Copy / Paste / Zoom

- **Ctrl+C**: copy selected text (with no selection, it does NOT send a CLI interrupt)
- **Shift+drag**: forces text selection even in mouse-tracking TUIs (Claude etc.) (normal drag goes to the TUI). xterm default behavior
- **Terminal right-click menu**: copy (when selected) / paste / select all — select then right-click to copy. Right-click on a link goes to link handling
- **Terminal link Ctrl+click**: opens `.html`/`.md` path links with the OS default app (browser for html) instead of in-app. http(s) URLs open the browser immediately on click
- **Ctrl+V**: text goes as xterm bracketed paste; image clipboard goes as a raw Ctrl+V keystroke (Codex image paste compatible). Ctrl+Shift+V passes through as-is
- **Ctrl+Enter**: newline input. Handled so characters do not break during Korean (IME) composition
- **Ctrl+F**: terminal search bar (next/previous/Esc to close)
- **Mouse wheel/arrow keys**: behavior splits by the current terminal buffer. On the **normal buffer** (shell, normal output), xterm scrollback moves directly, and the internal buffer scroll state updates immediately so scrolling up during streaming output keeps the current viewport. On **alternate-screen TUIs** (Claude/Codex, vim, less, etc.), the wheel is not applied to the viewport but handed to the TUI itself — if the TUI has mouse reporting on, native wheel events are forwarded so the TUI scrolls its own screen; if off, they are converted to `PageUp/PageDown`. SSH sessions normalize arrow keys to plain CSI sequences for remote TUI compatibility. (The same screen may look like normal scroll on one PC and PageUp/Down on another depending on that PC's claude version/mode — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md))
- Remote mobile session views use the browser's live visual viewport height. Opening the software keyboard hides the fixed bottom navigation and preserves the compact composer while the terminal/chat area contracts
- **Ctrl+wheel**: terminal font zoom (persisted)

### Global Shortcuts

| key | action |
|---|---|
| `Ctrl+T` | new session (new project if no active project) |
| `Ctrl+Shift+P` | new project |
| `Ctrl+W` | close active tab |
| `Ctrl+Shift+T` | restore the recently closed tab to its original Screen/pane/tab position |
| `Ctrl+1`~`9` | switch to the Nth tab of the active leaf |
| `Ctrl+F` | terminal search |
| `Esc` | close search/Docs |

(Shortcuts are not intercepted while an input field has focus)

Recently closed tab history keeps up to 20 explicitly closed tabs for the current app run.
Restore reuses the existing PTY and session, so work output is not interrupted. If the
layout changed after closing, the same leaf is preferred; if it is gone, the tab is safely
restored to a living pane of that Screen. Deleting the session itself or restarting the
app removes it from the restore targets.

## Image Viewer

- Image paths in terminal output (`*.png/jpg/jpeg/gif/webp/bmp/svg/ico`) open in an in-app modal viewer on click (both absolute and project-folder-relative paths)
- Close with Esc or outside click

## Completion Notifications

- When Claude/Codex's `Stop` hook fires:
  - yellow pulse → back to green
  - in-app toast top-right for 5s (click to activate that group)
  - Windows toast (when permission granted)
  - **Notification sound**: choose system sound / custom sound file / off in Settings (Test button previews)
  - **Desktop Pet**: completion animation + balloon with project/session and the latest user question in one line + unseen completion badge. Clicking the pet brings the app forward and jumps to the most recent completed session
- Notified only once. Even if the hook fires redundantly, it is ignored unless the state was working
- A separate toast + notification sound for remote access approval requests ([REMOTE.md](REMOTE.md))

## Desktop Pet

- At app start, the pet native window is first created hidden; after the elected workspace coordinator is ready, the saved **pet visibility** toggle is applied and a workspace is focused
- The pet is bound to the tray process. Tray Exit or an update install terminates the whole process including the pet; peer workspace windows never create duplicate pets
- The pet window is `focusable(false)` and does not create a new window at completion; it only changes the CSS state of the existing window. So it never steals keyboard focus from the active terminal
- idle is a sleeping face, running is an awake face, working is a typing animation, done is a jump + completion balloon
- Per session, a `…N` badge shows while working and a `✓N` badge for unseen completions; both can show at once. The same `lastSessionId` is counted only once, and a completed session that starts working again moves from completed to working
- If any session is working, the pet keeps the working expression/motion even with completion badges present. The completion jump motion only runs when no session is working
- Clicking the `…N` badge shows a small list of currently working projects/sessions, tools, and the latest user question captured from the `UserPromptSubmit` hook. Clicking a list item jumps to that session
- Drag the `•••` handle below the pet to move it during the current run. On the next app launch it starts at the default bottom-right position of the primary monitor
- Right-clicking the pet opens a dedicated menu with **Close pet** to hide it. The sidebar robot toggle and the Settings option sync to OFF as well
- Can be turned off or reset to the default position in Settings → General
