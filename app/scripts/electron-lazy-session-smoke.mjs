import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multiagent-lazy-smoke-"));
try {
  await build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React, { useRef, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { PaneSlot } from './src/components/PaneSlot';
      import { applyAgentRuntimeStatus } from './src/lib/agentActivity';
      window.calls = [];
      window.multiAgentElectron = {
        invoke: async (command, args) => {
          window.calls.push({ command, args });
          if (command === 'spawn_pty') return { reattached: false };
          if (command === 'attach_terminal') return { data: '', sequenceStart: 0, sequenceEnd: 0 };
          return null;
        },
        onEvent: () => () => {}, emit: async () => {},
      };
      const noop = () => {};
      function Harness() {
        const [agents, setAgents] = useState(['one', 'two'].map(id => ({
          id, name: id, projectId: 'project', folder: 'C:/test', aiToolId: 'none',
          aiLabel: 'Shell', dangerous: false, createdAt: 1, status: 'idle',
          runtimeStatus: 'idle', deferredStart: true, resumeEligible: id === 'one',
        })));
        const termsRef = useRef(new Map());
        window.termCount = () => termsRef.current.size;
        const select = (path, id) => setAgents(current => current.map(agent =>
            agent.id === id ? { ...agent, deferredStart: undefined, resumeEligible: true } : agent));
        const ctx = { agents, projects: [], theme: 'dark', sessionPins: null,
          activePath: [0], dragState: null, dropTarget: null, termsRef,
          setAgentStatus: (id, status) => setAgents(current => current.map(agent =>
            agent.id === id ? applyAgentRuntimeStatus(agent, status) : agent)),
          setAgentSessionId: noop, setActivePath: path => select(path, agents[path[0]].id),
          onCloseTab: noop, onSelectTab: select, onResizeAt: noop, onDragStart: noop,
          onDragEnd: noop, onDropTargetChange: noop, onDrop: noop, onTabContextMenu: noop,
          chatModeAgents: new Set(), onToggleChat: noop, getDocumentOwner: () => null,
          fallbackDocumentAgentId: null, onOpenBrowser: noop,
          onOpenMarkdownPath: noop, onOpenImagePath: noop, onOpenFolderPath: noop,
          onOpenTerminalPath: noop };
        return <>{agents.map((agent, index) => <PaneSlot key={agent.id}
          leaf={{ type: 'leaf', id: agent.id, tabs: [agent.id], activeIndex: 0 }}
          path={[index]} ctx={ctx} />)}</>;
      }
      createRoot(document.getElementById('root')).render(<Harness />);
    ` },
    bundle: true, outfile: path.join(temporary, "renderer.js"), jsx: "automatic",
  });
  await fs.writeFile(path.join(temporary, "index.html"), `
    <style>html,body,#root{height:100%;margin:0}#root{display:flex}
    .pane-slot{width:50%;display:flex;flex-direction:column}.pane-body,.session-standby{flex:1;min-height:0}
    .session-standby{display:grid;place-content:center}</style>
    <div id="root"></div><script src="renderer.js"></script>`);
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const { app, BrowserWindow } = require('electron');
    app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, width: 1000, height: 600,
        webPreferences: { backgroundThrottling: false } });
      try {
        await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
        console.log(await win.webContents.executeJavaScript(\`(async () => {
          const tick = () => new Promise(resolve => setTimeout(resolve, 500));
          const check = (ok, message) => { if (!ok) throw new Error(message); };
          const spawns = () => window.calls.filter(call => call.command === 'spawn_pty');
          await tick();
          check(document.querySelectorAll('.session-standby').length === 2, 'Restored panes must be placeholders');
          check(document.querySelectorAll('.session-standby .status-standby').length === 1, 'Only previously active session should be blue');
          check(document.querySelectorAll('.session-standby .status-idle').length === 1, 'Never-started session must stay gray');
          check(window.termCount() === 0 && spawns().length === 0, 'Startup allocated a terminal or PTY');
          document.querySelector('.session-standby button').click(); await tick();
          check(window.termCount() === 1 && spawns().length === 1 && spawns()[0].args.id === 'one', 'Click must start only one session');
          check(document.querySelectorAll('.session-standby').length === 1, 'Other pane must stay dormant');
          window.dispatchEvent(new Event('resize')); await tick();
          check(spawns().length === 1, 'Resize started dormant session');
          document.querySelector('.session-standby button').click(); await tick();
          check(window.termCount() === 2 && spawns().length === 2 && spawns()[1].args.id === 'two', 'Second click must start second session once');
          return 'LAZY_SESSION_SMOKE_OK';
        })()\`));
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    });
  `);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], {
    env, stdio: "inherit", windowsHide: true,
  });
  const timeout = setTimeout(() => child.kill(), 30000);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  }).finally(() => clearTimeout(timeout));
  if (code !== 0) throw new Error(`Lazy session smoke failed: ${code}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
