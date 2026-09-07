import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multiagent-account-ui-"));
try {
  await build({ stdin: { resolveDir: appRoot, sourcefile: "account-smoke.tsx", loader: "tsx", contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { CodexAccountsPanel } from './src/components/CodexAccounts';
    import { NewAgentModal } from './src/components/NewAgentModal';
    import { SessionPropertiesModal } from './src/components/SessionPropertiesModal';
    window.multiAgentElectron = { invoke: (command, args) => window.require('electron').ipcRenderer.invoke(command, args),
      onEvent: () => () => {}, window: {} };
    const root = createRoot(document.getElementById('root'));
    const project = { id: 'p', name: 'Project', folder: 'project', createdAt: 0 };
    window.showAccounts = () => root.render(<CodexAccountsPanel />);
    window.showNew = () => root.render(<NewAgentModal project={project} defaultName="Session" onCancel={() => {}}
      onCreate={value => window.created = value} disabledTools={['claude']} />);
    window.showProperties = (running) => root.render(<SessionPropertiesModal
      agent={{ id:'a', projectId:'p', name:'Session', folder:'project', aiToolId:'codex', aiLabel:'Codex', dangerous:false,
        status: running ? 'running' : 'idle', createdAt:0 }} project={project} onUpdateAgent={() => {}}
      onClose={() => {}} onAccountChange={async id => { window.switched = id; }} />);
    window.showAccounts();
  ` }, bundle: true, outfile: path.join(temporary, "renderer.js"), jsx: "automatic" });
  await fs.writeFile(path.join(temporary, "index.html"), '<div id="root"></div><script src="renderer.js"></script>');
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const {app, BrowserWindow, ipcMain} = require('electron');
    const fs = require('node:fs');
    const path = require('node:path');
    app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
    app.whenReady().then(async () => {
      const {CodexAccounts} = await import(${JSON.stringify(new URL("../electron/services/codex-accounts.mjs", import.meta.url).href)});
      const accounts = new CodexAccounts(${JSON.stringify(temporary)}, { baseEnv: {}, startLogin: env => ({
        onData() {}, kill() {}, onExit(fn) {
          fs.writeFileSync(path.join(env.CODEX_HOME, 'auth.json'), '{"fixture":true}');
          setTimeout(() => fn({exitCode:0}), 50);
        }
      }) });
      ipcMain.handle('codex_accounts_list', () => accounts.list());
      ipcMain.handle('codex_accounts_create', (_event,args) => accounts.create(args.label));
      ipcMain.handle('codex_accounts_login', (_event,args) => accounts.beginLogin(args.accountId));
      ipcMain.handle('codex_accounts_cancel_login', () => accounts.cancelLogin());
      ipcMain.handle('session_storage_list', () => ({sessions:[]}));
      const win = new BrowserWindow({show:false, width:1100, height:900,
        webPreferences:{nodeIntegration:true, contextIsolation:false, backgroundThrottling:false}});
      try {
        await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
        console.log(await win.webContents.executeJavaScript(\`(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms || 250));
          const check = (value, message) => { if (!value) throw new Error(message); };
          const click = text => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text); check(b && !b.disabled, 'Missing/enabled button: '+text); b.click(); };
          await wait();
          const input = document.querySelector('input');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, 'Work');
          input.dispatchEvent(new Event('input', {bubbles:true})); await wait();
          click('계정 추가'); await wait();
          check(document.body.textContent.includes('Work'), 'Account was not listed');
          click('브라우저 로그인'); await wait(2300);
          check(document.body.textContent.includes('로그인 저장됨'), 'Login completion was not shown');
          const account = (await window.multiAgentElectron.invoke('codex_accounts_list'))[1];
          window.showNew(); await wait();
          const select = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === account.id));
          check(select && !select.disabled, 'Missing account selector');
          select.value = account.id; select.dispatchEvent(new Event('change', {bubbles:true})); await wait();
          click('Create'); await wait();
          check(window.created.codexAccountId === account.id, 'New session lost account binding');
          window.showProperties(true); await wait();
          click('실행 옵션'); await wait();
          check(document.querySelector('select').disabled, 'Running session allowed account switching');
          window.showProperties(false); await wait();
          const idle = document.querySelector('select'); check(!idle.disabled, 'Inactive session cannot switch');
          idle.value = account.id; idle.dispatchEvent(new Event('change', {bubbles:true})); await wait();
          check(window.switched === account.id, 'Inactive account switch not delivered');
          return 'CODEX_ACCOUNT_UI_SMOKE_OK';
        })()\`));
        accounts.cancelLogin(); app.exit(0);
      } catch(error) { console.error(error); accounts.cancelLogin(); app.exit(1); }
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], { env, stdio: "inherit", windowsHide: true });
  const timer = setTimeout(() => child.kill(), 30_000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
  if (code !== 0) throw new Error(`Codex account UI smoke failed: ${code}`);
} finally {
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("multiagent-account-ui-")) throw new Error("Unexpected cleanup path");
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
