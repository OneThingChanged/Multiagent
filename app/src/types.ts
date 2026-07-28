import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type {
  SpawnTerminalResult,
  TerminalDataPayload,
} from "./platform/ipcContract";
import type { WindowsPtyBackend } from "./lib/ptyBackend";

export type AgentRuntimeStatus =
  | "idle"
  | "starting"
  | "running"
  | "exited"
  | "unreachable";

export type AgentWorkStatus =
  | "unknown"
  | "idle"
  | "working"
  | "waiting"
  | "blocked"
  | "done";

export type AgentActivitySource = "hook" | "process" | "terminal" | "recovery";

export type AgentActivity = {
  workStatus: AgentWorkStatus;
  source: AgentActivitySource;
  receivedAt: number;
  stateStartedAt: number;
  providerSessionId?: string;
  hookEventName?: string;
  lastPrompt?: string;
  toolName?: string;
  toolInput?: string;
  interactiveQuestion?: string;
  lastAssistantMessage?: string;
};

// Compatibility status used by the existing UI and remote dashboard contract.
// It is derived from runtimeStatus + activity by lib/agentActivity.ts.
export type AgentStatus =
  | AgentRuntimeStatus
  | "working"
  | "waiting"
  | "blocked";

export type AiTool = {
  id: string;
  label: string;
  icon: string;
  iconColor: string;
  command: string;
  dangerousFlag?: string;
};

export const AI_TOOLS: AiTool[] = [
  {
    id: "claude",
    label: "Claude Code",
    icon: "✻",
    iconColor: "#cc785c",
    command: "claude",
    dangerousFlag: "--dangerously-skip-permissions",
  },
  {
    id: "codex",
    label: "Codex",
    icon: "⬢",
    iconColor: "#10a37f",
    command: "codex",
    dangerousFlag: "--dangerously-bypass-approvals-and-sandbox",
  },
  {
    id: "qwen",
    label: "Qwen",
    icon: "◆",
    iconColor: "#615ced",
    command: "qwen",
    dangerousFlag: "--yolo",
  },
  {
    id: "cline",
    label: "Cline",
    icon: "◈",
    iconColor: "#3aa0ff",
    command: "cline",
  },
  {
    id: "none",
    label: "Shell only",
    icon: "$",
    iconColor: "#8b949e",
    command: "",
  },
];

// The chat (conversation) view is only wired for CLIs that write a decodable
// JSONL transcript. Others (qwen, cline, none, …) are terminal-only — hide the
// chat toggle entirely for them.
export function toolSupportsChat(aiToolId: string | null | undefined): boolean {
  return aiToolId === "codex" || aiToolId === "claude";
}

export function toolForId(id: string): AiTool {
  return (
    AI_TOOLS.find((t) => t.id === id) ??
    AI_TOOLS.find((t) => t.id === "none") ??
    AI_TOOLS[AI_TOOLS.length - 1]
  );
}

// A reusable SSH connection target. Stored in its own localStorage registry
// (LS_SSH_HOSTS) and referenced by projects via Project.sshHostId.
export type SshRemoteOs = "posix" | "windows";
export type SshAuthMethod = "key" | "password";

export type SshHost = {
  id: string;
  label: string; // display alias in sidebar / pickers
  host: string; // hostname or IP
  user: string;
  port?: number; // defaults to 22
  identityFile?: string; // optional private key path
  extraOptions?: string; // extra ssh options, e.g. "-o StrictHostKeyChecking=accept-new"
  // Shell family on the remote machine. Decides how the cd + tool command is
  // built. Defaults to "posix" (Linux/macOS) when unset.
  remoteOs?: SshRemoteOs;
  // "key" (default): use key auth (IdentitiesOnly when an identity file is set,
  // which avoids "Too many authentication failures"). "password": skip keys and
  // use a stored password (auto-typed into the PTY). The password itself is NOT
  // stored here — it lives in a Rust-side secrets file keyed by host id.
  authMethod?: SshAuthMethod;
  // Windows remote only. npm CLIs create both .ps1 and .cmd shims; PowerShell
  // execution policy can block the .ps1 shim, so prefer .cmd by default.
  preferCmdShim?: boolean;
};

export type Agent = {
  id: string;
  projectId: string;
  name: string;
  folder: string;
  aiToolId: string;
  aiLabel: string;
  dangerous: boolean;
  // Codex only: skip the forced --no-alt-screen so the TUI runs on the
  // alternate screen (its own internal scrolling). Applies from next spawn.
  useAltScreen?: boolean;
  // Tab customization (right-click tab menu).
  pinned?: boolean;
  tabColor?: string;
  status: AgentStatus;
  runtimeStatus?: AgentRuntimeStatus;
  activity?: AgentActivity;
  createdAt: number;
  lastSessionId?: string;
  // Derived from the owning project at load time (not persisted on the agent).
  sshHostId?: string;
  remoteFolder?: string;
};

export type StoredAgent = {
  id: string;
  projectId?: string;
  name: string;
  folder: string;
  aiToolId: string;
  dangerous?: boolean;
  useAltScreen?: boolean;
  pinned?: boolean;
  tabColor?: string;
  createdAt: number;
  lastSessionId?: string;
  // Legacy fields kept for one-time migration on load.
  lastResumeToken?: string;
  lastClaudeSessionId?: string;
};

export type Project = {
  id: string;
  name: string;
  folder: string;
  createdAt: number;
  lastOpenedAt?: number;
  // When set, sessions of this project run on the referenced SSH host instead
  // of locally. remoteFolder is the working directory on the remote machine.
  sshHostId?: string;
  remoteFolder?: string;
};

export type StoredProject = Project;

export type TerminalEntry = {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  serialize: SerializeAddon;
  el: HTMLDivElement;
  opened: boolean;
  spawned: boolean;
  spawnPromise: Promise<SpawnTerminalResult> | null;
  attached: boolean;
  lastSequence: number;
  syncing: boolean;
  pendingOutput: TerminalDataPayload[];
  restoreScrollbackOnAttach: boolean;
  restoredScrollback: boolean;
  windowsPtyBackend: WindowsPtyBackend;
};

export type NewAgentPayload = {
  name: string;
  aiToolId: string;
  dangerous: boolean;
};

export type NewProjectPayload = {
  name: string;
  folder: string;
  sshHostId?: string;
  remoteFolder?: string;
};

export type Toast = {
  id: string;
  agentId: string;
  title: string;
  body: string;
};

export type LeafNode = {
  type: "leaf";
  id: string;
  tabs: string[];
  activeIndex: number;
};
export type SplitNode = {
  type: "split";
  id: string;
  direction: "h" | "v";
  children: LayoutNode[];
  sizes: number[];
};
export type LayoutNode = LeafNode | SplitNode;
export type Path = number[];

export type Group = {
  id: string;
  projectId?: string;
  layout: LayoutNode;
  sessionPins?: Record<string, string>;
  sessionLocked?: boolean;
};

export type ContextMenuState = {
  x: number;
  y: number;
  agentId: string;
};

export type SessionContextAction =
  | "open"
  | "open-new-window"
  | "tab"
  | "split-h"
  | "split-v"
  | "rename"
  | "pin-session"
  | "clear-session-pin"
  | "deactivate"
  | "delete"
  | "relink"
  | "properties";

export type ProjectContextMenuState = {
  x: number;
  y: number;
  projectId: string;
};

export type TabCtxState = {
  x: number;
  y: number;
  path: Path;
  agentId: string;
};

export type DropZone = "top" | "bottom" | "left" | "right" | "center";

export type DragState = {
  fromAgentId: string;
};

export type DropTargetState = {
  leafId: string;
  zone: DropZone;
};

export const LS_AGENTS = "multiagent.agents.v1";
export const LS_PROJECTS = "multiagent.projects.v1";
export const LS_SSH_HOSTS = "multiagent.sshHosts.v1";
export const LS_GROUPS = "multiagent.groups.v1";
export const LS_VIEW = "multiagent.view.v1";
export const LS_LAYOUT_LEGACY = "multiagent.layout.v1";
