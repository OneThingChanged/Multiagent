# Remote PWA

A Standard-only mobile remote for checking desktop MultiAgent sessions from a phone/tablet browser, giving short commands, and viewing local project Markdown/HTML documents. On Electron apps 0.5.31+, `app/electron/services/web-services.mjs` provides the server and `app/electron/remote-pwa/` provides the installable PWA screen.

Company builds hide the Remote tab in Settings, reject Remote·Tunnel commands in main IPC, and exclude `electron/remote-pwa/**` from packaging.

## Overall Flow

```text
[Phone PWA] ──HTTPS──> Cloudflare Tunnel ──> [My PC] 127.0.0.1:<port>
     │                                                   │
     ├─ GitHub login + account approval                  ├─ session/hook/recent output query
     ├─ Markdown/HTML document browser                   ├─ sandboxed local project document read
     ├─ status/question/completion alerts                └─ short input to the selected PTY
     └─ home screen install
```

The Remote server does not listen on an external NIC; it binds to loopback only. Phone access uses the HTTPS tunnel URL. The local URL is for preview/diagnostics on the desktop PC.

## Remote Screen Layout

- **Monitor**: separates working · needs-answer · done · waiting · inactive sessions into lanes, with status counts at a glance
- **Screens**: read-only sync of the desktop's split Screens and pane/tab layouts. Desktop can show every pane; mobile uses pane tabs and streams only the selected terminal
- **Sessions**: per-project session list with status filters and search; the selected session opens in a compact full-height chat/terminal view with a keyboard-safe composer
- **Documents**: choose a local project, search its `.md`/`.markdown`/`.html`/`.htm` files, then open a rendered preview. Markdown supports headings, lists, task items, tables, code fences, and relative links to another listed document. HTML runs in a script-disabled sandbox iframe
- Mobile Screens switch to pane tabs instead of small splits, navigation lists appear as a slide menu, and non-monitor views reclaim the status-summary space
- Session detail defaults to parsed Codex/Claude chat and can switch to the live xterm terminal. Windows extended transcript paths (`\\?\C:\...`) are normalized before transcript reads
- On phones/tablets, one-finger vertical drags scroll the live terminal. Normal buffers move through xterm scrollback; alternate-screen TUIs receive wheel/PageUp/PageDown input. Pinch zoom and link taps remain available
- Latest user request, interactive question, recent terminal output
- Send instructions/question answers to the active session from a Screen pane or Session detail
- `Ctrl/⌘ + Enter` to send, copy recent output
- Browser **Install app / Add to Home Screen** support
- While the PWA is running, completion/new questions appear as service worker notifications
- Offline, only the app shell opens; session API/input are network-only

Screen selection changes only inside the Remote browser and does not change the desktop MultiAgent's current Screen or active session. File editing, screen sharing, and a background Push server are not in the MVP.

## HTTP Endpoints

| path | description |
|---|---|
| `GET /` | PWA main screen for approved users |
| `GET /login` | GitHub web/Device Flow login screen |
| `GET /manifest.webmanifest` | PWA install manifest |
| `GET /sw.js` | offline shell / notification service worker |
| `GET /api/state` | projects, sessions, hooks, recent output state |
| `POST /api/input` | deliver input to the active PTY. JSON, same-origin, 8KB limit |
| `GET /api/stream?id=...` | SSE backfill and live PTY output for the xterm view |
| `GET /api/chat?id=...` | parsed Codex/Claude transcript blocks for the chat view |
| `POST /api/session/restart` | request activation of an inactive session |
| `GET /api/docs?projectId=...` | list up to 500 Markdown/HTML documents under one synchronized local project |
| `GET /api/docs/read?projectId=...&path=...` | read one Markdown/HTML document inside that project (2MB limit) |
| `GET /auth/mode` | returns web/device mode based on OAuth config |
| `POST /auth/start` | start GitHub Device Flow |
| `POST /auth/poll` | Device Flow token/user check |
| `GET /auth/github` | start GitHub OAuth redirect for fixed domains |
| `GET /auth/github/callback` | OAuth callback and session cookie issue |
| `POST /auth/logout` | expire the session cookie |

State syncs every 1.6 seconds, dropping to 5 seconds for a hidden PWA. Terminal output in Remote payloads is limited to the latest 24,000 chars per session.

## GitHub Auth & Approval

### Quick tunnel

Setting only the GitHub OAuth App's **Client ID** uses Device Flow. The phone shows a one-time code and you authenticate at `github.com/login/device`, so no callback URL edits are needed when the tunnel URL changes.

### Named tunnel

Setting Client ID + Client Secret + Public hostname uses the normal web redirect login. Register the OAuth App callback URL as:

```text
https://<public-hostname>/auth/github/callback
```

After login, you must still pass these approval rules.

- Owner: matches the GitHub username in Settings → allowed immediately
- Approved: accounts approved in desktop Settings → Remote PWA
- Pending: logged in but waiting for desktop approval
- Revoke: removing from the approval list rejects further requests even with a valid signed cookie

Session cookies are `HttpOnly`, `SameSite=Lax`, 7-day expiry. `Secure` is also applied for HTTPS tunnel requests. The signing key changes on server restart, requiring a new login.

## Cloudflare Tunnel

- Quick: with an empty token, `cloudflared tunnel --url <local-url> --no-autoupdate`
- Named: with a token, `cloudflared tunnel run --token <token>`
- On Windows, if the executable is missing, the official GitHub Latest `cloudflared-windows-amd64.exe` is auto-downloaded to the local data folder.
- Downloads stream to a temp file, reject responses under 1MB, then atomically rename.
- Startup waits up to 45 seconds for an actual public URL or named tunnel connection log before returning success.

Stored in the Standard local data folder as `remote-config.json`, `remote-access.json`, `cloudflared.exe`. The Client Secret and tunnel token are never sent to the browser.

## Security Boundaries

- The server listens on `127.0.0.1` only; external exposure goes through Cloudflare HTTPS.
- All APIs check login + approval. Only direct loopback requests are allowed without approval, for local diagnostics.
- Document paths are resolved against a synchronized local project root. Absolute paths, `..` traversal outside the project, symbolic-link escapes, unsupported extensions, files over 2MB, and SSH projects are rejected. Dependency/build/cache folders are skipped while listing.
- Markdown raw HTML is escaped before rendering. HTML previews use an iframe without `allow-scripts` or `allow-same-origin`, so document scripts and parent-window access are blocked.
- PTY input allows same-origin JSON POST only; cross-site requests, wrong Content-Type, empty values, over-8KB, and exited sessions are rejected.
- PWA responses use strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and a restricted Permissions Policy.
- The service worker caches only the static shell; `/api/**`, `/auth/**`, and all POSTs are never cached.
- Even if a Company renderer is compromised, main re-blocks Remote·Tunnel calls in the disabled command set.

## Setup Order

1. In Standard app Settings → **Remote PWA**, enter the GitHub Client ID and Owner, then save.
2. **Start** the local Remote server.
3. **Start tunnel** to issue an HTTPS address. First run may take a while due to the cloudflared download.
4. Open the HTTPS address on your phone and log in with GitHub.
5. If not the Owner, approve the approval request on the desktop.
6. Choose **Install app / Add to Home Screen** from the browser menu and enable notification permission.

The first screen after connecting is Monitor. Tapping a top status card filters to that status; **SCREENS** on the left opens split screens, **SESSIONS** opens individual sessions, and **Documents** opens the local project document browser. On mobile, the monitor/screens/sessions/documents/question buttons at the bottom provide the same navigation. Opening a Screen or Session hides the monitor summary so the selected content can use the phone's full dynamic viewport.

Document browsing is local-project only. SSH project files and relative HTML assets such as external CSS/images are not transferred in this version; self-contained HTML and inline styles render normally.

## Remaining Extensions

- Web Push/VAPID that works even when the browser is fully closed
- Server→PWA delta stream or WebSocket to remove polling
- Explicit control APIs like session pause/resume
- Sync interval adjustment based on network/battery state
