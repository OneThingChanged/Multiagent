import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { invoke, listen } from "../platform/runtime";
import type { Agent, Project } from "../types";
import { PortsMonitor } from "./PortsMonitor";
import { ResourceMonitor } from "./ResourceMonitor";
import {
  clampUsagePercent,
  formatResetRemaining,
  formatResetShort,
  formatUpdatedAgo,
  formatUsagePercent,
  formatUsageWindow,
  groupUsageProviders,
  primaryUsageWindow,
  usageLimitShortName,
  usageTone,
  type UsageProviderGroup,
  type UsageRateLimit,
  type UsageRateLimitSummary,
  type UsageRateLimitWindow,
} from "../lib/usageRateLimits";

const REFRESH_INTERVAL_MS = 60_000;
const CLOCK_INTERVAL_MS = 30_000;
const POPOVER_WIDTH = 300;

function UsageProgress({
  window,
  large,
}: {
  window: UsageRateLimitWindow;
  large?: boolean;
}) {
  const percent = clampUsagePercent(window.usedPercent);
  return (
    <span
      className={`usage-progress ${large ? "usage-progress-large" : ""}`}
      aria-hidden="true"
    >
      <span
        className={`usage-progress-fill usage-tone-${usageTone(percent)}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function DetailWindow({
  heading,
  window,
  now,
}: {
  heading: string;
  window: UsageRateLimitWindow;
  now: number;
}) {
  return (
    <div className="usage-detail-window">
      <div className="usage-detail-window-heading">
        <strong>{heading}</strong>
      </div>
      <UsageProgress window={window} large />
      <div className="usage-detail-window-meta">
        <span className={`usage-tone-${usageTone(window.usedPercent)}`}>
          {formatUsagePercent(window.usedPercent)} 사용
        </span>
        <span>{formatResetRemaining(window.resetsAt, now)}</span>
      </div>
    </div>
  );
}

function ProviderLimitDetails({
  limit,
  providerLabel,
  now,
}: {
  limit: UsageRateLimit;
  providerLabel: string;
  now: number;
}) {
  const shortName = usageLimitShortName(limit, providerLabel);
  const windows = [limit.primary, limit.secondary].filter(
    (window): window is UsageRateLimitWindow => Boolean(window)
  );
  return (
    <section className="usage-detail-limit">
      {windows.map((window, index) => (
        <DetailWindow
          key={`${window.windowMinutes ?? "unknown"}-${index}`}
          heading={
            shortName ||
            formatUsageWindow(window.windowMinutes) ||
            "사용 한도"
          }
          window={window}
          now={now}
        />
      ))}
      {(limit.credits.unlimited || limit.credits.hasCredits) && (
        <div className="usage-detail-credit">
          {limit.credits.unlimited
            ? "추가 사용량 무제한"
            : `추가 사용량 ${limit.credits.balance ?? "확인 가능"}`}
        </div>
      )}
    </section>
  );
}

function ProviderPopover({
  provider,
  summary,
  now,
  left,
  onClose,
}: {
  provider: UsageProviderGroup;
  summary: UsageRateLimitSummary | null;
  now: number;
  left: number;
  onClose: () => void;
}) {
  const planType = provider.limits.find((limit) => limit.planType)?.planType;
  return (
    <div
      className="usage-provider-popover"
      style={{ left }}
      role="dialog"
      aria-label={`${provider.label} 사용량`}
    >
      <div className="usage-popover-heading">
        <div>
          <strong>
            <span
              className="usage-provider-icon"
              style={{ color: provider.iconColor }}
            >
              {provider.icon}
            </span>
            {provider.label}
            {planType && <em className="usage-provider-plan">{planType}</em>}
          </strong>
          <span>{formatUpdatedAgo(summary?.updatedAt ?? 0, now)}</span>
        </div>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="usage-popover-body">
        {provider.limits.map((limit) => (
          <ProviderLimitDetails
            key={limit.limitId}
            limit={limit}
            providerLabel={provider.label}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}

export function UsageStatusBar({
  agents,
  projects,
  onSelectProject,
}: {
  agents: Agent[];
  projects: Project[];
  onSelectProject: (projectId: string) => void;
}) {
  const [summary, setSummary] = useState<UsageRateLimitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<{
    provider: string;
    left: number;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const rootRef = useRef<HTMLElement>(null);

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    try {
      const next = await invoke<UsageRateLimitSummary>("usage_rate_limits_get", {
        refresh,
      });
      setSummary(next);
      setError(null);
      setNow(Date.now());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const refreshTimer = window.setInterval(() => void load(false), REFRESH_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  // Refresh the moment a turn completes instead of waiting up to a full poll
  // interval. On a "done" hook the main process has already re-ingested that
  // agent's transcript (Codex rate limits) and kicked off the Claude OAuth
  // refresh before dispatching the event, so re-reading the DB (load(false))
  // surfaces the new numbers immediately. Debounced so a burst settles once.
  useEffect(() => {
    let cancelled = false;
    let unlisten = () => {};
    let timer: number | undefined;
    void listen<{ event?: string }>("agent:hook-event", (e) => {
      if (e.payload?.event !== "done") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(false), 400);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten();
      window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!openPopover) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPopover(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPopover]);

  const limits = summary?.limits ?? [];
  const providers = useMemo(() => groupUsageProviders(limits), [limits]);
  const statusText = loading
    ? "사용량 불러오는 중"
    : error
      ? "사용량 확인 실패"
      : limits.length === 0
        ? "사용량 준비 중"
        : null;

  const toggleProvider = (
    event: ReactMouseEvent<HTMLButtonElement>,
    key: string
  ) => {
    if (openPopover?.provider === key) {
      setOpenPopover(null);
      return;
    }
    const rootRect = rootRef.current?.getBoundingClientRect();
    const segmentRect = event.currentTarget.getBoundingClientRect();
    const rawLeft = rootRect ? segmentRect.left - rootRect.left : 8;
    const maxLeft = Math.max(8, (rootRect?.width ?? POPOVER_WIDTH) - POPOVER_WIDTH - 8);
    setOpenPopover({ provider: key, left: Math.min(Math.max(8, rawLeft), maxLeft) });
  };

  const openProvider = openPopover
    ? providers.find((provider) => provider.key === openPopover.provider) ?? null
    : null;

  return (
    <footer className="usage-status-bar" ref={rootRef}>
      <div className="usage-status-summary">
        {statusText ? (
          <span className="usage-status-empty">{statusText}</span>
        ) : (
          providers.map((provider) => (
            <button
              type="button"
              key={provider.key}
              className={`usage-status-provider ${
                openPopover?.provider === provider.key
                  ? "usage-status-provider-open"
                  : ""
              }`}
              onClick={(event) => toggleProvider(event, provider.key)}
              title={`${provider.label} 사용량 상세`}
            >
              <span
                className="usage-provider-icon"
                style={{ color: provider.iconColor }}
              >
                {provider.icon}
              </span>
              <strong>{provider.label}</strong>
              {provider.limits.map((limit) => {
                const window = primaryUsageWindow(limit);
                if (!window) return null;
                const shortName = usageLimitShortName(limit, provider.label);
                return (
                  <span className="usage-status-limit" key={limit.limitId}>
                    <UsageProgress window={window} />
                    <b className={`usage-tone-${usageTone(window.usedPercent)}`}>
                      {formatUsagePercent(window.usedPercent)}
                    </b>
                    <span className="usage-status-limit-meta">
                      {shortName || formatResetShort(window.resetsAt, now)}
                    </span>
                  </span>
                );
              })}
            </button>
          ))
        )}
      </div>
      <ResourceMonitor
        agents={agents}
        projects={projects}
        onRefreshUsage={() => load(true)}
      />
      <PortsMonitor
        agents={agents}
        projects={projects}
        onSelectProject={onSelectProject}
        onRefreshUsage={() => load(true)}
      />
      <button
        type="button"
        className="usage-status-refresh"
        disabled={refreshing}
        onClick={() => void load(true)}
      >
        {refreshing ? "갱신 중" : "새로고침"}
      </button>
      {openProvider && openPopover && (
        <ProviderPopover
          provider={openProvider}
          summary={summary}
          now={now}
          left={openPopover.left}
          onClose={() => setOpenPopover(null)}
        />
      )}
    </footer>
  );
}
