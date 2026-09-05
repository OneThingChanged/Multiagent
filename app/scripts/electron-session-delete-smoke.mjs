import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the real React lifecycle and form controls in isolated Electron.
// PTY calls are stubbed: this test must never touch a user's sessions.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multiagent-delete-smoke-"));
try {
  await build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React, { useRef, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useSessionLifecycleActions } from './src/hooks/useSessionLifecycleActions';
      import { DeleteSessionModal } from './src/components/DeleteSessionModal';
      import { NewProjectModal } from './src/components/NewProjectModal';
      window.calls = [];
      window.confirm = () => { throw new Error('Native confirmation must not be used'); };
      function Harness() {
        const [agents, setAgents] = useState([{ id: 'test', name: 'Test session', status: 'idle' }]);
        const agentsRef = useRef(agents); agentsRef.current = agents;
        const detachedAgentIdsRef = useRef(new Set());
        const removedAgentIdsRef = useRef(new Set());
        const termsRef = useRef(new Map());
        const actions = useSessionLifecycleActions({ agentsRef, detachedAgentIdsRef,
          removedAgentIdsRef, termsRef, setAgents, applyGroupOp: () => {} });
        window.actions = actions;
        window.agentCount = agents.length;
        window.detach = () => detachedAgentIdsRef.current.add('test');
        return <>
          <button id="remove" onClick={() => actions.removeAgent('test')}>Remove</button>
          {actions.pendingDeletion
            ? <DeleteSessionModal name={actions.pendingDeletion.name}
                onConfirm={actions.confirmDeletion} onCancel={actions.cancelDeletion} />
            : <NewProjectModal defaultName="Project" onCancel={() => {}} onCreate={() => {}} />}
        </>;
      }
      createRoot(document.getElementById('root')).render(<Harness />);
    ` },
    bundle: true, outfile: path.join(temporary, "renderer.js"), jsx: "automatic",
    plugins: [{ name: "stub-session-host", setup(bundler) {
      bundler.onResolve({ filter: /platform\/(runtime|electronBridge)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `
        export const isElectronRuntime = () => true;
        export const invoke = async (...args) => { window.calls.push(args); };
        export const getElectronBridge = () => null;
      ` }));
    } }],
  });
  await fs.writeFile(path.join(temporary, "index.html"), '<div id="root"></div><script src="renderer.js"></script>');
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const { app, BrowserWindow } = require('electron');
    app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
      try {
        await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
        const result = await win.webContents.executeJavaScript(\`(async () => {
          const tick = () => new Promise(resolve => setTimeout(resolve, 40));
          const check = (ok, message) => { if (!ok) throw new Error(message); };
          const controls = () => {
            const input = document.querySelector('input');
            const select = document.querySelector('select');
            check(input && select, 'Project controls missing');
            input.click(); input.focus();
            check(document.activeElement === input, 'Input cannot receive focus');
            document.execCommand('insertText', false, ' typed');
            check(input.value.includes('typed'), 'Input cannot accept text');
            select.click(); select.focus();
            check(document.activeElement === select && !select.disabled, 'Select cannot receive focus');
            select.value = 'codex';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            check(select.value === 'codex', 'Select cannot change value');
          };
          await tick();
          document.querySelector('#remove').click(); await tick();
          check(!!document.querySelector('[role="alertdialog"]'), 'Confirmation missing');
          check(window.calls.length === 0, 'Deleted before confirmation');
          document.querySelector('[role="alertdialog"] .btn-secondary').click(); await tick();
          check(window.agentCount === 1 && window.calls.length === 0, 'Cancel deleted session');
          check(!document.querySelector('[role="alertdialog"]'), 'Cancelled overlay remains');
          controls();
          document.querySelector('#remove').click(); await tick();
          const confirm = document.querySelector('[role="alertdialog"] .btn-primary');
          confirm.click(); confirm.click(); await tick();
          check(window.agentCount === 0, 'Session was not removed');
          check(window.calls.length === 1, 'Repeated confirmation closed PTY twice');
          check(window.calls[0][0] === 'terminal_session_action' && window.calls[0][1].action === 'close', 'Wrong PTY action');
          check(!document.querySelector('[role="alertdialog"]'), 'Deleted overlay remains');
          controls();
          return 'SESSION_DELETE_SMOKE_OK';
        })()\`);
        console.log(result);
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
  if (code !== 0) throw new Error(`Session delete smoke failed: ${code}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
