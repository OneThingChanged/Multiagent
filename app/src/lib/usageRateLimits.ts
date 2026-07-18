export type UsageRateLimitWindow = {
  usedPercent: number;
  windowMinutes: number | null;
  resetsAt: number | null;
};

export type UsageRateLimit = {
  limitId: string;
  limitName: string | null;
  planType: string | null;
  primary: UsageRateLimitWindow | null;
  secondary: UsageRateLimitWindow | null;
  credits: {
    hasCredits: boolean;
    unlimited: boolean;
    balance: string | null;
  };
  updatedAt: number;
};

export type UsageRateLimitSummary = {
  updatedAt: number;
  limits: UsageRateLimit[];
};

export function clampUsagePercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function usageTone(value: number) {
  const percent = clampUsagePercent(value);
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "normal";
}

export function formatUsagePercent(value: number) {
  const percent = clampUsagePercent(value);
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
}

export function formatUsageWindow(minutes: number | null) {
  if (!minutes || minutes <= 0) return "사용 한도";
  if (minutes === 10_080) return "주간 한도";
  if (minutes % 1_440 === 0) return `${minutes / 1_440}일 한도`;
  if (minutes % 60 === 0) return `${minutes / 60}시간 한도`;
  return `${minutes}분 한도`;
}

export function formatResetRemaining(
  resetsAt: number | null,
  nowMs = Date.now()
) {
  if (!resetsAt) return "초기화 시간 미확인";
  const remainingSeconds = Math.max(0, resetsAt - Math.floor(nowMs / 1000));
  if (remainingSeconds === 0) return "곧 초기화";
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.max(1, Math.floor((remainingSeconds % 3_600) / 60));
  if (days > 0) return `${days}일 ${hours}시간 후 초기화`;
  if (hours > 0) return `${hours}시간 ${minutes}분 후 초기화`;
  return `${minutes}분 후 초기화`;
}

export function formatUpdatedAgo(updatedAt: number, nowMs = Date.now()) {
  if (!updatedAt) return "아직 갱신되지 않음";
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - updatedAt) / 1000));
  if (elapsedSeconds < 60) return "방금 갱신";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}분 전 갱신`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 갱신`;
  return `${Math.floor(hours / 24)}일 전 갱신`;
}

export function usageLimitLabel(limit: UsageRateLimit) {
  if (limit.limitId === "codex") return "Codex";
  return limit.limitName?.trim() || limit.limitId;
}

export function primaryUsageWindow(limit: UsageRateLimit) {
  return limit.primary ?? limit.secondary;
}

// Compact reset text for the status bar segments ("3시간 1분", "6일 22시간").
export function formatResetShort(resetsAt: number | null, nowMs = Date.now()) {
  if (!resetsAt) return "";
  const remainingSeconds = Math.max(0, resetsAt - Math.floor(nowMs / 1000));
  if (remainingSeconds === 0) return "곧 초기화";
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.max(1, Math.floor((remainingSeconds % 3_600) / 60));
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

// ---- Provider grouping (Codex / Claude / Gemini / …) ----

export type UsageProviderMeta = {
  key: string;
  label: string;
  icon: string;
  iconColor: string;
};

export type UsageProviderGroup = UsageProviderMeta & {
  limits: UsageRateLimit[];
};

const PROVIDER_META: Record<string, Omit<UsageProviderMeta, "key">> = {
  codex: { label: "Codex", icon: "⬢", iconColor: "#10a37f" },
  claude: { label: "Claude", icon: "✻", iconColor: "#cc785c" },
  gemini: { label: "Gemini", icon: "✦", iconColor: "#4796e3" },
};

export function usageProviderKey(limit: UsageRateLimit) {
  const id = limit.limitId.toLowerCase();
  if (id === "codex" || id.startsWith("codex")) return "codex";
  if (id === "claude" || id.startsWith("claude")) return "claude";
  if (id === "gemini" || id.startsWith("gemini")) return "gemini";
  return id;
}

// Group limits by provider, preserving the backend's sort order.
export function groupUsageProviders(
  limits: UsageRateLimit[]
): UsageProviderGroup[] {
  const groups: UsageProviderGroup[] = [];
  const byKey = new Map<string, UsageProviderGroup>();
  for (const limit of limits) {
    const key = usageProviderKey(limit);
    let group = byKey.get(key);
    if (!group) {
      const meta = PROVIDER_META[key];
      group = {
        key,
        label: meta?.label ?? usageLimitLabel(limit),
        icon: meta?.icon ?? "•",
        iconColor: meta?.iconColor ?? "#8b949e",
        limits: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.limits.push(limit);
  }
  return groups;
}

// Short display name for a limit inside its provider popover/segment:
// "Claude Fable" under the Claude provider → "Fable"; base limits → "".
export function usageLimitShortName(
  limit: UsageRateLimit,
  providerLabel: string
) {
  const label = usageLimitLabel(limit);
  if (label.toLowerCase() === providerLabel.toLowerCase()) return "";
  if (label.toLowerCase().startsWith(`${providerLabel.toLowerCase()} `)) {
    return label.slice(providerLabel.length + 1);
  }
  return label;
}
