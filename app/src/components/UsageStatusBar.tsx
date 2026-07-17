import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../platform/runtime";
import {
  clampUsagePercent,
  formatResetRemaining,
  formatUpdatedAgo,
  formatUsagePercent,
  formatUsageWindow,
  primaryUsageWindow,
  usageLimitLabel,
  usageTone,
  type UsageRateLimit,
  type UsageRateLimitSummary,
  type UsageRateLimitWindow,
} from "../lib/usageRateLimits";

const REFRESH_INTERVAL_MS = 60_000;
const CLOCK_INTERVAL_MS = 30_000;

function UsageProgress({ window }: { window: UsageRateLimitWindow }) {
  const percent = clampUsagePercent(window.usedPercent);
  return (
    <span className="usage-progress" aria-hidden="true">
      <span
        className={`usage-progress-fill usage-tone-${usageTone(percent)}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function DetailWindow({
  window,
  now,
}: {
  window: UsageRateLimitWindow;
  now: number;
}) {
  return (
    <div className="usage-detail-window">
      <div className="usage-detail-window-heading">
        <strong>{formatUsageWindow(window.windowMinutes)}</strong>
        <span>{formatUsagePercent(window.usedPercent)} 사용</span>
      </div>
      <UsageProgress window={window} />
      <div className="usage-detail-reset">
        {formatResetRemaining(window.resetsAt, now)}
      </div>
    </div>
  );
}

function UsageLimitDetails({
  limit,
  now,
}: {
  limit: UsageRateLimit;
  now: number;
}) {
  const windows = [limit.primary, limit.secondary].filter(
    (window): window is UsageRateLimitWindow => Boolean(window)
  );
  return (
    <section className="usage-detail-limit">
      <div className="usage-detail-limit-heading">
        <strong>{usageLimitLabel(limit)}</strong>
        {limit.planType && <span>{limit.planType}</span>}
      </div>
      {windows.map((window, index) => (
        <DetailWindow key={`${window.windowMinutes ?? "unknown"}-${index}`} window={window} now={now} />
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

export function UsageStatusBar() {
  const [summary, setSummary] = useState<UsageRateLimitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const limits = summary?.limits ?? [];
  const visibleLimits = useMemo(() => limits.slice(0, 3), [limits]);
  const statusText = loading
    ? "사용량 불러오는 중"
    : error
      ? "사용량 확인 실패"
      : limits.length === 0
        ? "사용량 준비 중"
        : null;

  return (
    <footer className="usage-status-bar" ref={rootRef}>
      <button
        type="button"
        className="usage-status-summary"
        aria-expanded={open}
        aria-controls="usage-status-popover"
        onClick={() => setOpen((value) => !value)}
      >
        {statusText ? (
          <span className="usage-status-empty">{statusText}</span>
        ) : (
          visibleLimits.map((limit) => {
            const window = primaryUsageWindow(limit);
            if (!window) return null;
            return (
              <span className="usage-status-limit" key={limit.limitId}>
                <strong>{usageLimitLabel(limit)}</strong>
                <UsageProgress window={window} />
                <b className={`usage-tone-${usageTone(window.usedPercent)}`}>
                  {formatUsagePercent(window.usedPercent)}
                </b>
                <span>{formatResetRemaining(window.resetsAt, now)}</span>
              </span>
            );
          })
        )}
      </button>
      <button
        type="button"
        className="usage-status-refresh"
        disabled={refreshing}
        onClick={() => void load(true)}
      >
        {refreshing ? "갱신 중" : "새로고침"}
      </button>
      {open && (
        <div className="usage-status-popover" id="usage-status-popover" role="dialog" aria-label="사용량 상세">
          <div className="usage-popover-heading">
            <div>
              <strong>사용량</strong>
              <span>{formatUpdatedAgo(summary?.updatedAt ?? 0, now)}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)}>닫기</button>
          </div>
          <div className="usage-popover-body">
            {error && <div className="usage-popover-message usage-popover-error">{error}</div>}
            {!error && limits.length === 0 && (
              <div className="usage-popover-message">
                Codex·Claude에서 다음 응답을 받으면 사용량이 자동으로 표시됩니다.
              </div>
            )}
            {limits.map((limit) => (
              <UsageLimitDetails key={limit.limitId} limit={limit} now={now} />
            ))}
          </div>
          <div className="usage-popover-footer">
            세션 활동에서 자동 갱신되며, 새로고침하면 최근 세션을 다시 확인합니다.
          </div>
        </div>
      )}
    </footer>
  );
}
