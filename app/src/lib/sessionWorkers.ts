import type {
  SessionWorkerPreset,
  SessionWorkerSettings,
} from "../types";

export type SessionWorkerOption = {
  id: SessionWorkerPreset;
  label: string;
  requiredToolId: "codex" | "claude";
};

export const SESSION_WORKER_OPTIONS: readonly SessionWorkerOption[] = [
  {
    id: "codex-luna-max",
    label: "Codex · Luna Max",
    requiredToolId: "codex",
  },
  {
    id: "claude-opus",
    label: "Claude · Opus",
    requiredToolId: "claude",
  },
];

export function defaultSessionWorkerSettings(
  aiToolId: string
): SessionWorkerSettings | undefined {
  if (aiToolId !== "codex") return undefined;
  return {
    documents: "codex-luna-max",
    html: "codex-luna-max",
  };
}

const VALID_PRESETS = new Set<SessionWorkerPreset>(
  SESSION_WORKER_OPTIONS.map((option) => option.id)
);

export function availableSessionWorkerOptions(
  disabledTools: readonly string[]
): readonly SessionWorkerOption[] {
  return SESSION_WORKER_OPTIONS.filter(
    (option) => !disabledTools.includes(option.requiredToolId)
  );
}

export function normalizeSessionWorkerSettings(
  value: unknown
): SessionWorkerSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const documents = VALID_PRESETS.has(raw.documents as SessionWorkerPreset)
    ? (raw.documents as SessionWorkerPreset)
    : undefined;
  const html = VALID_PRESETS.has(raw.html as SessionWorkerPreset)
    ? (raw.html as SessionWorkerPreset)
    : undefined;
  return documents || html ? { documents, html } : undefined;
}

export function updateSessionWorkerSetting(
  current: SessionWorkerSettings | undefined,
  kind: keyof SessionWorkerSettings,
  preset: SessionWorkerPreset | undefined
): SessionWorkerSettings | undefined {
  const next = { ...current, [kind]: preset };
  return next.documents || next.html ? next : undefined;
}

function tomlString(value: string): string {
  // JSON strings are valid TOML basic strings. Encode apostrophes so the
  // surrounding single-quoted shell argument is safe in PowerShell and POSIX.
  return JSON.stringify(value).replace(/'/g, "\\u0027");
}

export function sessionWorkerDeveloperInstructions(
  settings: SessionWorkerSettings
): string {
  const lines = [
    "MultiAgent configured parallel content workers for this session.",
    "Delegate only bounded work that can run independently. Never let workers edit the same file concurrently. The primary agent owns integration and final verification.",
  ];

  const addPolicy = (
    label: string,
    preset: SessionWorkerPreset | undefined
  ) => {
    if (preset === "codex-luna-max") {
      lines.push(
        `For ${label}, spawn the matching MultiAgent worker role. It runs with gpt-5.6-luna and max reasoning effort. Give it exact target files, constraints, and expected output.`
      );
    } else if (preset === "claude-opus") {
      lines.push(
        `For ${label}, spawn the matching MultiAgent worker role and have it invoke the installed Claude Code CLI using claude -p --model opus --effort max --no-session-persistence --safe-mode --tools Read,Write,Edit,Glob,Grep --permission-mode acceptEdits. Use claude.cmd on Windows only when the normal launcher is blocked. Pass the bounded prompt through stdin rather than a command-line argument. Include exact target files, constraints, and necessary project guidance, wait for its result, then verify all changes. Never add a dangerous permission flag. If Claude is unavailable or not authenticated, report that and continue safely with the primary agent.`
      );
    }
  };

  addPolicy("documentation and Markdown work", settings.documents);
  addPolicy("HTML and related presentation work", settings.html);
  lines.push("Do not delegate trivial edits where coordination costs more than the work.");
  return lines.join("\n");
}

export function addSessionWorkerArgs(
  aiToolId: string,
  command: string,
  value: SessionWorkerSettings | undefined
): string {
  if (aiToolId !== "codex") return command;
  const settings = normalizeSessionWorkerSettings(value);
  if (!settings) return command;

  const overrides = [
    "features.multi_agent=true",
    "agents.enabled=true",
    "agents.max_concurrent_threads_per_session=2",
  ];
  if (
    settings.documents === "codex-luna-max" ||
    settings.html === "codex-luna-max"
  ) {
    overrides.push(
      `agents.default_subagent_model=${tomlString("gpt-5.6-luna")}`,
      `agents.default_subagent_reasoning_effort=${tomlString("max")}`
    );
  }
  if (settings.documents) {
    const description = settings.documents === "codex-luna-max"
      ? "Documentation and Markdown specialist using the configured Luna Max subagent defaults."
      : "Documentation and Markdown specialist that delegates the bounded task to Claude Code Opus through stdin.";
    overrides.push(
      `agents.multiagent_docs_writer.description=${tomlString(description)}`
    );
  }
  if (settings.html) {
    const description = settings.html === "codex-luna-max"
      ? "HTML and presentation specialist using the configured Luna Max subagent defaults."
      : "HTML and presentation specialist that delegates the bounded task to Claude Code Opus through stdin.";
    overrides.push(
      `agents.multiagent_html_builder.description=${tomlString(description)}`
    );
  }
  overrides.push(
    `developer_instructions=${tomlString(
      sessionWorkerDeveloperInstructions(settings)
    )}`
  );
  return `${command} ${overrides.map((item) => `-c '${item}'`).join(" ")}`;
}
