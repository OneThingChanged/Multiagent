export type RuntimeCommand =
  | "runtime_flags" | "renderer_ready" | "spawn_pty"
  | "attach_terminal" | "detach_terminal" | "terminal_session_action"
  | "write_pty" | "resize_pty" | "kill_pty" | "confirm_close"
  | "show_main_window" | "open_new_app_window" | "get_detached_agents"
  | "get_agent_window_usage" | "claim_agent_for_window" | "set_desktop_pet_enabled"
  | "update_desktop_pet" | "desktop_pet_snapshot" | "reset_desktop_pet_position"
  | "show_open_dialog" | "open_external_url" | "open_store_product" | "open_local_path"
  | "open_folder_path" | "reveal_local_path" | "list_markdown_files"
  | "document_browser_open" | "document_browser_ready" | "document_browser_bounds"
  | "document_browser_visibility"
  | "document_browser_back" | "document_browser_forward"
  | "document_browser_reload" | "document_browser_navigate" | "document_browser_open_external"
  | "document_browser_inspect" | "document_browser_attach_annotation" | "document_browser_close"
  | "read_markdown_file" | "resolve_markdown_path" | "list_directory"
  | "list_git_submodules"
  | "read_text_file" | "read_chat_transcript" | "chat_blocks" | "search_files"
  | "conversation_record_user_message" | "conversation_storage_get" | "conversation_storage_set"
  | "session_storage_list" | "session_storage_delete"
  | "git_status" | "git_changes" | "git_stage"
  | "git_unstage" | "git_discard" | "git_commit"
  | "git_branches" | "git_checkout" | "git_diff_tool" | "git_file_history"
  | "git_log" | "git_commit_files" | "git_commit_diff"
  | "resource_usage"
  | "set_titlebar_overlay"
  | "list_ports" | "kill_port_process"
  | "create_file" | "create_directory"
  | "rename_path" | "duplicate_path" | "delete_path"
  | "resolve_terminal_path"
  | "read_image_data_url" | "play_system_sound" | "read_audio_file"
  | "clipboard_read_text" | "clipboard_write_text" | "save_clipboard_image"
  | "check_tools" | "qwen_region_get" | "qwen_region_set"
  | "show_native_notification"
  | "resolve_cli_session" | "resolve_cline_session" | "relink_cli_session" | "sync_remote_agents"
  | "sync_remote_view" | "sync_usage_catalog" | "sync_monitor_state"
  | "complete_remote_session_create" | "complete_remote_session_activation"
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
  | "download_and_install_update" | "storage_snapshot_get"
  | "persist_storage_snapshot"
  | "reopen_state_get" | "reopen_state_clear" | "relaunch";

export type RuntimeEventName =
  | "pty:data" | "pty:exit" | "desktop-pet:update"
  | "desktop-pet:position-reset" | "desktop-pet:activate"
  | "desktop-pet:close-requested" | "remote:access-request"
  | "remote:restart-session" | "remote:create-session" | "remote:rename-session"
  | "chat:changed"
  | "app:close-requested" | "app:close-cancelled" | "agent:hook-event"
  | "native-notification:clicked" | "update:progress"
  | "session-detached" | "sessions-reattached"
  | "workspace:coordinator-changed" | "document-browser:update"
  | "document-browser:show-tab";

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

export type DirectoryEntry = {
  name: string;
  relative_path: string;
  is_dir: boolean;
};

export type GitSubmoduleEntry = {
  name: string;
  relative_path: string;
  url: string;
  initialized: boolean;
};

export type TextFileResult =
  | { kind: "text"; content: string }
  | { kind: "binary" }
  | { kind: "too_large"; size: number };

export type DocumentBrowserSnapshot = {
  browserId: string;
  tabId?: string;
  agentId?: string | null;
  profileId?: string;
  title: string;
  relativePath: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  hoveredElement?: unknown;
  selectedElement?: unknown;
  annotation?: unknown;
  annotationDelivery?: unknown;
  hasAnnotation?: boolean;
  inspectionMode?: boolean;
  inspectionSendToSession?: boolean;
  error?: string;
};

export type GitStatusLetter = "M" | "A" | "U" | "D" | "R";

export type GitStatusResult = {
  is_repo: boolean;
  entries: Array<{ relative_path: string; status: GitStatusLetter }>;
};

export type GitChangeEntry = {
  relative_path: string;
  status: GitStatusLetter;
  additions: number;
  deletions: number;
};

export type ResourceSessionUsage = {
  id: string;
  pid: number;
  cpu_percent: number;
  memory_bytes: number;
  process_count: number;
};

export type ResourceUsageResult = {
  updated_at: number;
  sampled: boolean;
  total_cpu_percent: number;
  total_memory_bytes: number;
  total_process_count: number;
  system_memory_bytes: number;
  sessions: ResourceSessionUsage[];
};

export type PortEntry = {
  port: number;
  pid: number;
  connect_host: string;
  process_name: string;
  kind: "workspace" | "external";
  terminal_id: string | null;
  project_id: string | null;
  own_app: boolean;
};

export type PortsResult = {
  updated_at: number;
  sampled: boolean;
  ports: PortEntry[];
};

export type ChatDiffLine = { type: "add" | "del" | "context" | "meta"; text: string };

export type ChatBlock = {
  role: "user" | "assistant" | "tool";
  kind: "text" | "reasoning" | "tool-call" | "tool-result" | "image";
  text?: string;
  name?: string;
  input?: unknown;
  summary?: string;
  diff?: ChatDiffLine[];
  output?: string;
  isError?: boolean;
  sequence?: number;
};

export type ChatBlocksResult = {
  blocks: ChatBlock[];
  truncated?: boolean;
  missing?: boolean;
  unsupported?: boolean;
  tool?: string;
  lifecycle?: "working" | "idle";
  sessionId?: string;
  conversationId?: string | null;
  hasOlder?: boolean;
  firstSequence?: number | null;
  total?: number;
  indexing?: boolean;
  artifacts?: ConversationArtifact[];
};

export type ConversationArtifact = {
  kind: string;
  path: string;
  size: number;
  modifiedAt: number | null;
};

export type ConversationStorageStatus = {
  path: string;
  defaultPath: string;
  custom: boolean;
  databasePath: string;
  available: boolean;
  error: string | null;
  bytes: number;
  conversations: number;
  blocks: number;
  artifacts: number;
};

export type SessionStorageQuery = {
  aiToolId: "codex" | "claude";
  sessionId: string;
};

export type SessionStorageEntry = SessionStorageQuery & {
  bytes: number;
  fileCount: number;
  updatedAt: number;
  primaryPath: string | null;
  paths: string[];
};

export type GitFileCommit = {
  hash: string;
  subject: string;
  date: string;
  author: string;
};

export type GitLogCommit = {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  date: string;
  relDate: string;
  refs: string[];
  subject: string;
};

export type GitLogResult = { commits: GitLogCommit[]; hasMore: boolean };

export type GitCommitFile = {
  relative_path: string;
  status: GitStatusLetter;
  additions: number;
  deletions: number;
};

export type GitCommitDetail = {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  relDate: string;
  message: string;
  files: GitCommitFile[];
};

export type GitChangesResult = {
  is_repo: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitChangeEntry[];
  unstaged: GitChangeEntry[];
  commits: Array<{ hash: string; subject: string }>;
};

export type RuntimeCommandContract = {
  open_store_product: { args: Record<string, never>; result: null };
  spawn_pty: { args: SpawnTerminalArgs; result: SpawnTerminalResult };
  complete_remote_session_create: {
    args: {
      requestId: string;
      id: string;
      ok: boolean;
      error?: string;
      statusCode?: 400 | 404 | 409 | 500 | 503;
    };
    result: boolean;
  };
  complete_remote_session_activation: {
    args: {
      requestId: string;
      id: string;
      ok: boolean;
      error?: string;
      statusCode?: 400 | 404 | 409 | 500 | 503;
    };
    result: boolean;
  };
  document_browser_open: {
    args: { folder: string; relativePath: string; agentId?: string; initialUrl?: string };
    result: { browserId: string };
  };
  document_browser_ready: {
    args: { browserId: string };
    result: DocumentBrowserSnapshot;
  };
  document_browser_bounds: {
    args: { browserId: string; x: number; y: number; width: number; height: number };
    result: null;
  };
  document_browser_visibility: {
    args: { browserId: string; visible: boolean };
    result: null;
  };
  document_browser_back: { args: { browserId: string }; result: null };
  document_browser_forward: { args: { browserId: string }; result: null };
  document_browser_reload: { args: { browserId: string }; result: null };
  document_browser_navigate: { args: { browserId: string; url: string }; result: null };
  document_browser_open_external: { args: { browserId: string }; result: null };
  document_browser_inspect: {
    args: { browserId: string; enabled: boolean; sendToSession?: boolean };
    result: DocumentBrowserSnapshot;
  };
  document_browser_attach_annotation: { args: { browserId: string; sendToSession?: boolean }; result: unknown };
  document_browser_close: { args: { browserId: string }; result: null };
  list_directory: {
    args: { folder: string; relative: string };
    result: DirectoryEntry[];
  };
  list_git_submodules: {
    args: { folder: string };
    result: GitSubmoduleEntry[];
  };
  read_text_file: {
    args: { folder: string; relativePath: string };
    result: TextFileResult;
  };
  read_chat_transcript: {
    args: { tool: string; path: string };
    result: { blocks: ChatBlock[]; truncated: boolean; missing: boolean };
  };
  chat_blocks: {
    args: { id: string; sessionId?: string; beforeSequence?: number; limit?: number };
    result: ChatBlocksResult;
  };
  conversation_record_user_message: {
    args: { id: string; sessionId?: string; text: string };
    result: { conversationId: string; sequence: number; block: ChatBlock } | null;
  };
  conversation_storage_get: {
    args: Record<string, never>;
    result: ConversationStorageStatus;
  };
  conversation_storage_set: {
    args: { path: string | null };
    result: ConversationStorageStatus;
  };
  session_storage_list: {
    args: {
      folder: string;
      sessions?: SessionStorageQuery[];
      includeAllProjectSessions?: boolean;
    };
    result: { sessions: SessionStorageEntry[]; totalBytes: number };
  };
  session_storage_delete: {
    args: {
      folder: string;
      aiToolId: "codex" | "claude";
      sessionId: string;
      agentId?: string;
    };
    result: { trashedFiles: number; reclaimedBytes: number };
  };
  git_status: {
    args: { folder: string };
    result: GitStatusResult;
  };
  git_changes: {
    args: { folder: string };
    result: GitChangesResult;
  };
  git_stage: {
    args: { folder: string; paths: string[] };
    result: null;
  };
  git_unstage: {
    args: { folder: string; paths: string[] };
    result: null;
  };
  git_discard: {
    args: { folder: string; paths: string[] };
    result: null;
  };
  git_commit: {
    args: { folder: string; message: string; paths?: string[] };
    result: null;
  };
  git_branches: {
    args: { folder: string };
    result: { current: string; branches: string[] };
  };
  git_checkout: {
    args: { folder: string; branch: string };
    result: null;
  };
  git_diff_tool: {
    args: {
      folder: string;
      relativePath: string;
      staged: boolean;
      command: string;
      ref?: string;
    };
    result: null;
  };
  git_file_history: {
    args: { folder: string; relativePath: string };
    result: { commits: GitFileCommit[] };
  };
  git_log: {
    args: {
      folder: string;
      path?: string;
      skip?: number;
      limit?: number;
      search?: string;
    };
    result: GitLogResult;
  };
  git_commit_files: {
    args: { folder: string; hash: string };
    result: GitCommitDetail;
  };
  git_commit_diff: {
    args: { folder: string; hash: string; relativePath: string };
    result: { diff: ChatDiffLine[] };
  };
  resource_usage: {
    args: Record<string, never>;
    result: ResourceUsageResult;
  };
  set_titlebar_overlay: {
    args: { color: string; symbolColor: string };
    result: null;
  };
  list_ports: {
    args: { projects: Array<{ id: string; folder: string }> };
    result: PortsResult;
  };
  kill_port_process: {
    args: { pid: number; port: number };
    result: null;
  };
  create_file: {
    args: { folder: string; relativePath: string };
    result: null;
  };
  create_directory: {
    args: { folder: string; relativePath: string };
    result: null;
  };
  rename_path: {
    args: { folder: string; relativePath: string; newName: string };
    result: string; // new relative path
  };
  duplicate_path: {
    args: { folder: string; relativePath: string };
    result: string; // new relative path
  };
  delete_path: {
    args: { folder: string; relativePath: string };
    result: null;
  };
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
