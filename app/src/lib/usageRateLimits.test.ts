import { describe, expect, it } from "vitest";
import {
  clampUsagePercent,
  formatResetRemaining,
  formatResetShort,
  formatUpdatedAgo,
  formatUsagePercent,
  formatUsageWindow,
  groupUsageProviders,
  usageLimitShortName,
  usageProviderKey,
  usageTone,
  type UsageRateLimit,
} from "./usageRateLimits";

function limitOf(limitId: string, limitName: string | null): UsageRateLimit {
  return {
    limitId,
    limitName,
    planType: null,
    primary: { usedPercent: 10, windowMinutes: 300, resetsAt: null },
    secondary: null,
    credits: { hasCredits: false, unlimited: false, balance: null },
    updatedAt: 0,
  };
}

describe("usage rate limit formatting", () => {
  it("formats common rate-limit windows", () => {
    expect(formatUsageWindow(300)).toBe("5시간 한도");
    expect(formatUsageWindow(10_080)).toBe("주간 한도");
    expect(formatUsageWindow(null)).toBe("사용 한도");
  });

  it("formats reset as absolute local wall-clock time", () => {
    const ts = Math.floor(Date.parse("2026-07-21T18:53:00") / 1000);
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(formatResetRemaining(ts)).toBe(
      `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(
        d.getMinutes()
      )} 초기화`
    );
    expect(formatResetRemaining(null)).toBe("초기화 시간 미확인");
  });

  it("clamps percentages and assigns warning levels", () => {
    expect(clampUsagePercent(108)).toBe(100);
    expect(formatUsagePercent(2.25)).toBe("2.3%");
    expect(usageTone(69)).toBe("normal");
    expect(usageTone(70)).toBe("warning");
    expect(usageTone(90)).toBe("danger");
  });

  it("formats relative refresh time", () => {
    const now = Date.UTC(2026, 6, 18, 0, 10, 0);
    expect(formatUpdatedAgo(now - 6 * 60_000, now)).toBe("6분 전 갱신");
  });

  it("formats compact absolute reset time for the status bar", () => {
    const ts = Math.floor(Date.parse("2026-07-21T18:53:00") / 1000);
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(formatResetShort(ts)).toBe(
      `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(
        d.getMinutes()
      )}`
    );
    expect(formatResetShort(null)).toBe("");
  });
});

describe("usage provider grouping", () => {
  it("maps limit ids to provider keys", () => {
    expect(usageProviderKey(limitOf("codex", null))).toBe("codex");
    expect(usageProviderKey(limitOf("claude", "Claude"))).toBe("claude");
    expect(
      usageProviderKey(limitOf("claude:model:fable", "Claude Fable"))
    ).toBe("claude");
    expect(usageProviderKey(limitOf("gemini", "Gemini"))).toBe("gemini");
  });

  it("groups limits per provider preserving order", () => {
    const groups = groupUsageProviders([
      limitOf("codex", null),
      limitOf("claude", "Claude"),
      limitOf("claude:model:fable", "Claude Fable"),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["codex", "claude"]);
    expect(groups[1].limits).toHaveLength(2);
    expect(groups[0].label).toBe("Codex");
    expect(groups[1].label).toBe("Claude");
  });

  it("derives short names inside a provider", () => {
    expect(
      usageLimitShortName(limitOf("claude", "Claude"), "Claude")
    ).toBe("");
    expect(
      usageLimitShortName(limitOf("claude:model:fable", "Claude Fable"), "Claude")
    ).toBe("Fable");
    expect(usageLimitShortName(limitOf("codex", null), "Codex")).toBe("");
  });
});


it("shows different Codex accounts as separate labeled provider groups", () => {
  const groups = groupUsageProviders([limitOf("codex", null), limitOf("codex:a", "Codex · Personal"), limitOf("codex:b", "Codex · Work")]);
  expect(groups.map((g) => g.label)).toEqual(["Codex", "Codex · Personal", "Codex · Work"]);
  expect(groups.every((g) => g.limits.length === 1)).toBe(true);
});
