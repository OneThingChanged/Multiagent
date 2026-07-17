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
