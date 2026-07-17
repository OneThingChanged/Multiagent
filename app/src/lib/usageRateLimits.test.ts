import { describe, expect, it } from "vitest";
import {
  clampUsagePercent,
  formatResetRemaining,
  formatUpdatedAgo,
  formatUsagePercent,
  formatUsageWindow,
  usageTone,
} from "./usageRateLimits";

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
});
