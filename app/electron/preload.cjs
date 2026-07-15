const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("multiAgentElectron", {
  invoke(command, args) {
    return ipcRenderer.invoke("multiagent:invoke", command, args ?? {});
  },
  onEvent(eventName, listener) {
    const wrapped = (_event, deliveredName, payload) => {
      if (deliveredName === eventName) listener(payload);
    };
    ipcRenderer.on("multiagent:event", wrapped);
    return () => ipcRenderer.removeListener("multiagent:event", wrapped);
  },
  emit(eventName, payload) {
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
