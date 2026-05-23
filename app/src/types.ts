import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

export type AgentStatus = "idle" | "starting" | "running" | "working" | "exited";

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
    id: "none",
    label: "Shell only",
    icon: "$",
    iconColor: "#8b949e",
    command: "",
  },
];

export function toolForId(id: string): AiTool {
  return AI_TOOLS.find((t) => t.id === id) ?? AI_TOOLS[2];
}

export type Agent = {
  id: string;
  name: string;
  folder: string;
  aiToolId: string;
  aiLabel: string;
  dangerous: boolean;
  status: AgentStatus;
  createdAt: number;
  lastSessionId?: string;
};

export type StoredAgent = {
  id: string;
  name: string;
  folder: string;
  aiToolId: string;
  dangerous?: boolean;
  createdAt: number;
  lastSessionId?: string;
  // Legacy fields kept for one-time migration on load.
  lastResumeToken?: string;
  lastClaudeSessionId?: string;
};

export type TerminalEntry = {
  term: Terminal;
  fit: FitAddon;
  el: HTMLDivElement;
  opened: boolean;
  spawned: boolean;
};

export type NewAgentPayload = {
  name: string;
  folder: string;
  aiToolId: string;
  dangerous: boolean;
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
  layout: LayoutNode;
  sessionPins?: Record<string, string>;
  sessionLocked?: boolean;
};

export type ContextMenuState = {
  x: number;
  y: number;
  agentId: string;
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
export const LS_GROUPS = "multiagent.groups.v1";
export const LS_VIEW = "multiagent.view.v1";
export const LS_LAYOUT_LEGACY = "multiagent.layout.v1";
