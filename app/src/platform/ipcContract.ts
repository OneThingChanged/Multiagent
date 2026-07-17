export type RuntimeCommand =
  | "runtime_flags" | "renderer_ready" | "spawn_pty"
  | "attach_terminal" | "detach_terminal" | "terminal_session_action"
  | "write_pty" | "resize_pty" | "kill_pty" | "confirm_close"
  | "show_main_window" | "open_new_app_window" | "set_desktop_pet_enabled"
  | "update_desktop_pet" | "desktop_pet_snapshot" | "reset_desktop_pet_position"
  | "show_open_dialog" | "open_external_url" | "open_local_path"
  | "open_folder_path" | "reveal_local_path" | "list_markdown_files"
  | "read_markdown_file" | "resolve_markdown_path" | "resolve_terminal_path"
  | "read_image_data_url" | "play_system_sound" | "read_audio_file"
  | "clipboard_read_text" | "clipboard_write_text" | "show_native_notification"
  | "resolve_cli_session" | "relink_cli_session" | "sync_remote_agents"
  | "sync_remote_view" | "sync_usage_catalog" | "sync_monitor_state"
  | "repair_active_hooks" | "export_diagnostics" | "usage_ingest_now"
  | "usage_rate_limits_get"
  | "usage_config_get" | "usage_config_set" | "usage_server_status"
  | "start_usage_server" | "stop_usage_server" | "remote_config_get"
  | "remote_config_set" | "remote_server_status" | "start_remote_server"
  | "stop_remote_server" | "tunnel_status" | "start_tunnel" | "stop_tunnel"
  | "remote_access_list" | "remote_access_approve" | "remote_access_revoke"
  | "monitor_config_get" | "monitor_config_set" | "monitor_server_status"
  | "start_monitor_server" | "stop_monitor_server" | "ssh_password_set"
  | "ssh_password_clear" | "ssh_password_has" | "ssh_test"
  | "get_ssh_public_key" | "generate_ssh_key" | "check_for_update"
  | "download_and_install_update" | "export_tauri_storage"
  | "import_tauri_storage" | "persist_storage_snapshot" | "relaunch";

export type RuntimeEventName =
  | "pty:data" | "pty:exit" | "desktop-pet:update"
  | "desktop-pet:position-reset" | "desktop-pet:activate"
  | "desktop-pet:close-requested" | "remote:access-request"
  | "app:close-requested" | "agent:hook-event"
  | "native-notification:clicked" | "update:progress";

export type RuntimeEmittedEventName =
  | "desktop-pet:activate"
  | "desktop-pet:close-requested";

export type TerminalSessionAction = "sleep" | "close" | "restart" | "quit";

export type TerminalDataPayload = {
  id: string;
  data: string;
  sequenceStart?: number;
  sequenceEnd?: number;
  resetRequired?: boolean;
  truncated?: boolean;
};

export type TerminalReplay = Required<
  Pick<TerminalDataPayload, "data" | "sequenceStart" | "sequenceEnd">
> & {
  resetRequired: boolean;
  truncated: boolean;
};

export type SpawnTerminalResult = { reattached: boolean; cancelled?: boolean };

export type SpawnTerminalArgs = {
  id: string;
  shell: string | null;
  cwd: string;
  initCommand: string;
  aiToolId: string;
  ssh: unknown;
  cols: number;
  rows: number;
};

export type RuntimeCommandContract = {
  spawn_pty: { args: SpawnTerminalArgs; result: SpawnTerminalResult };
  attach_terminal: {
    args: { id: string; afterSequence: number };
    result: TerminalReplay;
  };
  detach_terminal: { args: { id: string }; result: null };
  terminal_session_action: {
    args: { id: string; action: TerminalSessionAction };
    result: boolean;
  };
  write_pty: { args: { id: string; data: string }; result: null };
  resize_pty: {
    args: { id: string; cols: number; rows: number };
    result: null;
  };
};

export type TypedRuntimeCommand = keyof RuntimeCommandContract;
export type RuntimeCommandArgs<C extends TypedRuntimeCommand> =
  RuntimeCommandContract[C]["args"];
export type RuntimeCommandResult<C extends TypedRuntimeCommand> =
  RuntimeCommandContract[C]["result"];
