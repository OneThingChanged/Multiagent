import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserFormRuntimeExpression } from "../electron/services/browser-form-automation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-browser-form-smoke-"));
app.setPath("userData", path.join(temporaryRoot, "user-data"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function execute(webContents, method, body = {}) {
  return webContents.executeJavaScript(browserFormRuntimeExpression(method, body), true);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  await window.loadFile(path.join(appRoot, "electron", "services", "browser-form-fixture.html"));

  const snapshot = await execute(window.webContents, "snapshot");
  assert(snapshot.controls.some((entry) => entry.locator?.id === "enabled-feature" && entry.checked === false), "checkbox state missing");
  const displayTargetId = snapshot.controls.find((entry) => entry.locator?.id === "display-name")?.targetId;
  assert(displayTargetId, "semantic text target missing");
  const password = snapshot.controls.find((entry) => entry.locator?.id === "password");
  const upload = snapshot.controls.find((entry) => entry.locator?.id === "upload");
  assert(password?.valueState === "redacted" && password.value === "", "password value leaked");
  assert(upload?.valueState === "file" && upload.value === "", "file value leaked");

  const checked = await execute(window.webContents, "setChecked", { target: { id: "enabled-feature" }, checked: true });
  assert(checked.ok && checked.after?.checked === true && checked.changed === true, "checkbox was not checked");
  const checkedAgain = await execute(window.webContents, "setChecked", { target: { id: "enabled-feature" }, checked: true });
  assert(checkedAgain.ok && checkedAgain.skipped === true, "checkbox action was not idempotent");

  const radio = await execute(window.webContents, "setChecked", { target: { id: "mode-b" }, checked: true });
  assert(radio.ok && radio.after?.checked === true, "radio was not selected");

  const selected = await execute(window.webContents, "selectOption", { target: { id: "country" }, option: { label: "United States" } });
  assert(selected.ok && selected.after?.options?.some((entry) => entry.label === "United States" && entry.selected), "select option failed");
  const disabledOption = await execute(window.webContents, "selectOption", { target: { id: "country" }, option: { label: "Disabled" } });
  assert(disabledOption.ok === false && disabledOption.error === "disabled_option", "disabled option was not rejected");

  const typed = await execute(window.webContents, "type", { target: { targetId: displayTargetId }, text: "after" });
  assert(typed.ok && typed.after?.value === "after", "text input failed");
  await execute(window.webContents, "click", { target: { id: "rerender" } });
  const retained = await execute(window.webContents, "getControl", { target: { targetId: displayTargetId } });
  assert(retained.ok && retained.control?.value === "after", "semantic target did not survive re-render");
  const cleared = await execute(window.webContents, "clear", { target: { targetId: displayTargetId } });
  assert(cleared.ok && cleared.after?.valueState === "empty" && cleared.after?.validity?.valid === false, "clear/validation failed");

  const ambiguous = await execute(window.webContents, "getControl", { target: { label: "Duplicate action", role: "button" } });
  assert(ambiguous.ok === false && ambiguous.error === "ambiguous_target" && ambiguous.candidates?.length === 2, "ambiguous target was not rejected");

  const custom = await execute(window.webContents, "selectOption", { target: { id: "custom-combobox" }, option: { label: "Blue" } });
  assert(custom.ok && custom.after?.text === "Blue", "custom ARIA combobox failed");
  const waited = await execute(window.webContents, "waitFor", { target: { id: "custom-combobox" }, condition: "text", expected: "Blue", timeoutMs: 1_000 });
  assert(waited.ok && waited.satisfied, "wait condition failed");

  const passwordBlocked = await execute(window.webContents, "type", { target: { id: "password" }, text: "blocked" });
  assert(passwordBlocked.ok === false && passwordBlocked.error === "sensitive_control", "password typing was not blocked");

  window.destroy();
  console.log("MULTIAGENT_BROWSER_FORM_SMOKE_OK");
}

void app.whenReady().then(async () => {
  try {
    await run();
    app.exit(0);
  } catch (error) {
    console.error(error?.stack || error);
    app.exit(1);
  } finally {
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
  }
});
