const INVOKE_COMMANDS = Object.freeze([
  "runtime_flags",
  "renderer_ready",
  "spawn_pty",
  "attach_terminal",
  "detach_terminal",
  "terminal_session_action",
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
  "list_directory",
  "read_text_file",
  "git_status",
  "git_changes",
  "git_stage",
  "git_unstage",
  "git_commit",
  "create_file",
  "create_directory",
  "rename_path",
  "duplicate_path",
  "delete_path",
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
  "export_diagnostics",
  "usage_ingest_now",
  "usage_rate_limits_get",
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

const DELIVERED_EVENTS = Object.freeze([
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

const EMITTED_EVENTS = Object.freeze([
  "desktop-pet:activate",
  "desktop-pet:close-requested",
]);

const invokeSet = new Set(INVOKE_COMMANDS);
const deliveredSet = new Set(DELIVERED_EVENTS);
const emittedSet = new Set(EMITTED_EVENTS);
const SESSION_ACTIONS = new Set(["sleep", "close", "restart", "quit"]);

function assertAllowed(set, value, kind) {
  if (typeof value !== "string" || !set.has(value)) {
    throw new Error(`Blocked Electron ${kind}: ${String(value)}`);
  }
}

function assertObject(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Electron IPC args must be an object");
  }
  return value;
}

function assertId(args) {
  if (typeof args.id !== "string" || args.id.trim().length < 1 || args.id.length > 256) {
    throw new TypeError("Electron terminal id must be a non-empty string");
  }
}

function assertPositiveInteger(value, name, maximum = 10000) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`Electron ${name} must be a positive integer`);
  }
}

function assertInvokeRequest(command, rawArgs) {
  assertAllowed(invokeSet, command, "command");
  const args = assertObject(rawArgs);
  switch (command) {
    case "spawn_pty":
      assertId(args);
      assertPositiveInteger(args.cols, "terminal cols");
      assertPositiveInteger(args.rows, "terminal rows");
      break;
    case "attach_terminal":
      assertId(args);
      if (!Number.isInteger(args.afterSequence) || args.afterSequence < 0) {
        throw new TypeError("Electron terminal sequence must be a non-negative integer");
      }
      break;
    case "detach_terminal":
    case "kill_pty":
      assertId(args);
      break;
    case "terminal_session_action":
      assertId(args);
      if (!SESSION_ACTIONS.has(args.action)) {
        throw new TypeError("Electron terminal session action is invalid");
      }
      break;
    case "write_pty":
      assertId(args);
      if (typeof args.data !== "string" || args.data.length > 1024 * 1024) {
        throw new TypeError("Electron terminal data must be a string up to 1 MiB");
      }
      break;
    case "resize_pty":
      assertId(args);
      assertPositiveInteger(args.cols, "terminal cols");
      assertPositiveInteger(args.rows, "terminal rows");
      break;
    case "list_directory":
      assertPathString(args.folder, "folder");
      assertPathString(args.relative, "relative path", true);
      break;
    case "read_text_file":
    case "create_file":
    case "create_directory":
    case "duplicate_path":
    case "delete_path":
      assertPathString(args.folder, "folder");
      assertPathString(args.relativePath, "relative path");
      break;
    case "rename_path":
      assertPathString(args.folder, "folder");
      assertPathString(args.relativePath, "relative path");
      assertPathString(args.newName, "new name");
      break;
    case "git_status":
    case "git_changes":
      assertPathString(args.folder, "folder");
      break;
    case "git_stage":
    case "git_unstage":
      assertPathString(args.folder, "folder");
      if (
        !Array.isArray(args.paths) ||
        args.paths.length < 1 ||
        args.paths.length > 500 ||
        args.paths.some(
          (p) => typeof p !== "string" || !p.trim() || p.length > 4096
        )
      ) {
        throw new TypeError("Electron git paths must be 1-500 non-empty strings");
      }
      break;
    case "git_commit":
      assertPathString(args.folder, "folder");
      if (
        typeof args.message !== "string" ||
        !args.message.trim() ||
        args.message.length > 5000
      ) {
        throw new TypeError("Electron git commit message must be a non-empty string");
      }
      break;
  }
  return args;
}

function assertPathString(value, name, allowEmpty = false) {
  if (typeof value !== "string" || value.length > 4096) {
    throw new TypeError(`Electron ${name} must be a string up to 4096 chars`);
  }
  if (!allowEmpty && value.trim().length < 1) {
    throw new TypeError(`Electron ${name} must be a non-empty string`);
  }
}

module.exports = {
  INVOKE_COMMANDS,
  DELIVERED_EVENTS,
  EMITTED_EVENTS,
  assertAllowed,
  assertInvokeRequest,
  invokeSet,
  deliveredSet,
  emittedSet,
};
