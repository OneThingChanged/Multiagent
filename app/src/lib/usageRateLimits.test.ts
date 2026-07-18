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

  it("formats reset countdowns without negative time", () => {
    const now = Date.UTC(2026, 6, 18, 0, 0, 0);
    expect(formatResetRemaining(now / 1000 + 6 * 86_400 + 23 * 3_600, now)).toBe(
      "6일 23시간 후 초기화"
    );
    expect(formatResetRemaining(now / 1000 - 1, now)).toBe("곧 초기화");
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

  it("formats compact reset countdowns for the status bar", () => {
    const now = Date.UTC(2026, 6, 18, 0, 0, 0);
    expect(formatResetShort(now / 1000 + 6 * 86_400 + 23 * 3_600, now)).toBe(
      "6일 23시간"
    );
    expect(formatResetShort(now / 1000 + 3 * 3_600 + 90, now)).toBe("3시간 1분");
    expect(formatResetShort(now / 1000 - 1, now)).toBe("곧 초기화");
    expect(formatResetShort(null, now)).toBe("");
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
