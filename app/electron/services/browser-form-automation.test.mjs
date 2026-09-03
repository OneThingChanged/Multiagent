import { describe, expect, it } from "vitest";
import {
  BROWSER_FORM_RUNTIME_SOURCE,
  browserFormRuntimeExpression,
  normalizeBrowserFormRequest,
  normalizeBrowserTarget,
} from "./browser-form-automation.mjs";

describe("browser form automation contract", () => {
  it("normalizes semantic targets and preserves the legacy selector fallback", () => {
    expect(normalizeBrowserTarget({
      targetId: " c-123 ",
      label: " Worldwide markets ",
      role: "CHECKBOX",
    })).toEqual({ targetId: "c-123", label: "Worldwide markets", role: "checkbox" });
    expect(normalizeBrowserTarget(null, "#legacy")).toEqual({ selector: "#legacy" });
  });

  it("rejects missing targets and clamps waits", () => {
    expect(() => normalizeBrowserFormRequest("setChecked", { checked: true })).toThrow(/target/);
    expect(normalizeBrowserFormRequest("waitFor", {
      condition: "checked",
      target: { targetId: "c-1" },
      expected: true,
      timeoutMs: 99_999,
    })).toMatchObject({ condition: "checked", expected: true, timeoutMs: 15_000 });
    expect(normalizeBrowserFormRequest("waitFor", {
      condition: "navigationComplete",
      timeoutMs: 99_999,
    })).toMatchObject({ condition: "navigationComplete", timeoutMs: 30_000 });
  });

  it("requires an explicit select option and keeps empty text in the clear operation only", () => {
    expect(() => normalizeBrowserFormRequest("selectOption", { target: { targetId: "c-1" } })).toThrow(/옵션/);
    expect(() => normalizeBrowserFormRequest("type", { selector: "#name", text: "" })).toThrow(/입력 텍스트/);
    expect(normalizeBrowserFormRequest("clear", { selector: "#name" })).toEqual({ target: { selector: "#name" } });
  });

  it("builds only fixed runtime methods with JSON-encoded input", () => {
    const expression = browserFormRuntimeExpression("type", {
      selector: "#name",
      text: '\"); globalThis.pwned = true; (\"',
    });
    expect(expression).toContain(BROWSER_FORM_RUNTIME_SOURCE);
    expect(expression).toContain('runtime["type"]');
    expect(expression).not.toContain('runtime["evaluate"]');
    expect(() => browserFormRuntimeExpression("evaluate", {})).toThrow(/지원하지 않는/);
  });
});
