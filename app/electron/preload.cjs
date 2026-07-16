const { contextBridge, ipcRenderer, webUtils } = require("electron");

function contractValues(name) {
  const prefix = `--multiagent-${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return new Set(argument ? argument.slice(prefix.length).split(",").filter(Boolean) : []);
}

const invokeSet = contractValues("invoke-commands");
const deliveredSet = contractValues("delivered-events");
const emittedSet = contractValues("emitted-events");

function assertAllowed(set, value, kind) {
  if (typeof value !== "string" || !set.has(value)) {
    throw new Error(`Blocked Electron ${kind}: ${String(value)}`);
  }
}

contextBridge.exposeInMainWorld("multiAgentElectron", {
  invoke(command, args) {
    assertAllowed(invokeSet, command, "command");
    return ipcRenderer.invoke("multiagent:invoke", command, args ?? {});
  },
  onEvent(eventName, listener) {
    assertAllowed(deliveredSet, eventName, "event subscription");
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    const wrapped = (_event, deliveredName, payload) => {
      if (deliveredName === eventName) listener(payload);
    };
    ipcRenderer.on("multiagent:event", wrapped);
    return () => ipcRenderer.removeListener("multiagent:event", wrapped);
  },
  emit(eventName, payload) {
    assertAllowed(emittedSet, eventName, "event emission");
    ipcRenderer.send("multiagent:emit", eventName, payload);
    return Promise.resolve();
  },
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  showOpenDialog(options) {
    return ipcRenderer.invoke("multiagent:invoke", "show_open_dialog", options ?? {});
  },
  window: {
    setAlwaysOnTop(enabled) {
      return ipcRenderer.invoke(
        "multiagent:window",
        "setAlwaysOnTop",
        Boolean(enabled)
      );
    },
    isFocused() {
      return ipcRenderer.invoke("multiagent:window", "isFocused");
    },
    requestUserAttention(critical) {
      return ipcRenderer.invoke(
        "multiagent:window",
        "requestUserAttention",
        Boolean(critical)
      );
    },
  },
});
