import { describe, expect, it } from "vitest";
import {
  normalizeAppLanguagePreference,
  resolveAppLanguage,
} from "./appLanguage";

describe("app language", () => {
  it("keeps explicit language choices", () => {
    expect(resolveAppLanguage("ko", ["en-US"])).toBe("ko");
    expect(resolveAppLanguage("en", ["ko-KR"])).toBe("en");
  });

  it("uses Korean for a Korean system locale", () => {
    expect(resolveAppLanguage("system", ["ko-KR", "en-US"])).toBe("ko");
  });

  it("falls back to English for other system locales", () => {
    expect(resolveAppLanguage("system", ["ja-JP"])).toBe("en");
    expect(resolveAppLanguage("system", [])).toBe("en");
  });

  it("normalizes stale stored values", () => {
    expect(normalizeAppLanguagePreference("ko")).toBe("ko");
    expect(normalizeAppLanguagePreference("invalid")).toBe("system");
    expect(normalizeAppLanguagePreference(null)).toBe("system");
  });
});
