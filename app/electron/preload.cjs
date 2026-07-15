const { contextBridge, ipcRenderer, webUtils } = require("electron");

const INVOKE_COMMANDS = new Set([
  "runtime_flags",
  "renderer_ready",
  "spawn_pty",
  "write_pty",
  "resize_pty",
  "kill_pty",
  "confirm_close",
  "show_main_window",
  "open_new_app_window",
  "set_desktop_pet_enabled",
  "update_desktop_pet",
  "desktop_pet_snapshot",
  "reset_desktop_pet_position",
  "show_open_dialog",
  "open_external_url",
  "open_local_path",
  "open_folder_path",
  "reveal_local_path",
  "list_markdown_files",
  "read_markdown_file",
  "resolve_markdown_path",
  "resolve_terminal_path",
  "read_image_data_url",
  "play_system_sound",
  "read_audio_file",
  "clipboard_read_text",
  "clipboard_write_text",
  "show_native_notification",
  "resolve_cli_session",
  "relink_cli_session",
  "sync_remote_agents",
  "sync_remote_view",
  "sync_usage_catalog",
  "sync_monitor_state",
  "repair_active_hooks",
  "usage_ingest_now",
  "usage_config_get",
  "usage_config_set",
  "usage_server_status",
  "start_usage_server",
  "stop_usage_server",
  "remote_config_get",
  "remote_config_set",
  "remote_server_status",
  "start_remote_server",
  "stop_remote_server",
  "tunnel_status",
  "start_tunnel",
  "stop_tunnel",
  "remote_access_list",
  "remote_access_approve",
  "remote_access_revoke",
  "monitor_config_get",
  "monitor_config_set",
  "monitor_server_status",
  "start_monitor_server",
  "stop_monitor_server",
  "ssh_password_set",
  "ssh_password_clear",
  "ssh_password_has",
  "ssh_test",
  "get_ssh_public_key",
  "generate_ssh_key",
  "check_for_update",
  "download_and_install_update",
  "export_tauri_storage",
  "import_tauri_storage",
  "persist_storage_snapshot",
  "relaunch",
]);

const DELIVERED_EVENTS = new Set([
  "pty:data",
  "pty:exit",
  "desktop-pet:update",
  "desktop-pet:position-reset",
  "desktop-pet:activate",
  "desktop-pet:close-requested",
  "remote:access-request",
  "app:close-requested",
  "agent:hook-event",
  "native-notification:clicked",
  "update:progress",
]);

const EMITTED_EVENTS = new Set([
  "desktop-pet:activate",
  "desktop-pet:close-requested",
]);

function assertAllowed(set, value, kind) {
  if (typeof value !== "string" || !set.has(value)) {
    throw new Error(`Blocked Electron ${kind}: ${String(value)}`);
  }
}

contextBridge.exposeInMainWorld("multiAgentElectron", {
  invoke(command, args) {
    assertAllowed(INVOKE_COMMANDS, command, "command");
    return ipcRenderer.invoke("multiagent:invoke", command, args ?? {});
  },
  onEvent(eventName, listener) {
    assertAllowed(DELIVERED_EVENTS, eventName, "event subscription");
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    const wrapped = (_event, deliveredName, payload) => {
      if (deliveredName === eventName) listener(payload);
    };
    ipcRenderer.on("multiagent:event", wrapped);
    return () => ipcRenderer.removeListener("multiagent:event", wrapped);
  },
  emit(eventName, payload) {
    assertAllowed(EMITTED_EVENTS, eventName, "event emission");
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
