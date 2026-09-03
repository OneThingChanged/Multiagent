import { describe, expect, it } from "vitest";
import {
  buildBrowserAnnotation,
  normalizeBrowserCaptureRect,
  sanitizeBrowserActionResult,
  sanitizeBrowserControl,
  sanitizeBrowserUrl,
  sanitizeBrowserSnapshot,
  sanitizeElementDescriptor,
  sanitizeHtmlSnippet,
} from "./browser-context.mjs";

describe("browser context sanitization", () => {
  it("masks credential-like URL query values before sending browser context", () => {
    const url = sanitizeBrowserUrl("https://example.com/view?item=42&access_token=secret&code=oauth-code#session=abc");
    expect(url).toContain("item=42");
    expect(url).toContain("access_token=%5Bredacted%5D");
    expect(url).toContain("code=%5Bredacted%5D");
    expect(url).toContain("#redacted");
    expect(url).not.toContain("secret");
    expect(url).not.toContain("oauth-code");
  });

  it("removes active markup and sensitive attributes from HTML snippets", () => {
    const html = sanitizeHtmlSnippet('<button value="secret">Run</button><script>alert(1)</script>');
    expect(html).toContain("<button>Run</button>");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("script");
  });

  it("keeps useful element geometry while dropping password-like attributes", () => {
    const element = sanitizeElementDescriptor({
      tag: "input",
      label: "input#email",
      selector: "#email",
      attributes: { type: "text", value: "private", autocomplete: "email", "data-session-token": "secret" },
      rect: { x: 1.4, y: 2.8, width: 100.2, height: 30.9 },
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 300 },
    });
    expect(element).toMatchObject({
      tag: "input",
      label: "input#email",
      selector: "#email",
      rect: { x: 1, y: 3, width: 100, height: 31 },
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 300 },
    });
    expect(element?.attributes).not.toHaveProperty("value");
    expect(element?.attributes).not.toHaveProperty("data-session-token");
  });

  it("clips element screenshots to the visible browser viewport", () => {
    expect(normalizeBrowserCaptureRect(
      { x: -10, y: 690, width: 120, height: 80 },
      { width: 1280, height: 720 },
    )).toEqual({ x: 0, y: 690, width: 110, height: 30 });
    expect(normalizeBrowserCaptureRect(
      { x: 1260, y: 10, width: 100, height: 20 },
      { width: 1280, height: 720 },
    )).toEqual({ x: 1260, y: 10, width: 20, height: 20 });
  });

  it("bounds page snapshots and builds an attachable annotation", () => {
    const snapshot = sanitizeBrowserSnapshot({
      url: "https://example.com",
      title: "Example",
      text: "x".repeat(30_000),
      links: Array.from({ length: 200 }, (_, index) => ({ text: String(index), href: "https://example.com" })),
    });
    expect(snapshot?.text.length).toBeLessThanOrEqual(20_001);
    expect(snapshot?.links).toHaveLength(80);
    const annotation = buildBrowserAnnotation({
      browserId: "browser-1",
      agentId: "agent-1",
      url: "https://example.com",
      title: "Example",
      element: { tag: "main", selector: "main", rect: { x: 0, y: 0, width: 10, height: 10 } },
      html: "<main>Hello</main>",
      screenshotPath: "C:/tmp/annotation.png",
    });
    expect(annotation).toMatchObject({ browserId: "browser-1", tabId: "browser-1", agentId: "agent-1" });
    expect(annotation.screenshotPath).toContain("annotation.png");
  });

  it("preserves useful form state while redacting password and file values", () => {
    const safe = sanitizeBrowserControl({
      targetId: "c-safe",
      tag: "select",
      role: "combobox",
      label: "Country",
      valueState: "text",
      value: "KR",
      options: [{ index: 0, label: "Korea", value: "KR", valueState: "text", selected: true }],
      visible: true,
      enabled: true,
      validity: { valid: true },
    });
    expect(safe).toMatchObject({
      targetId: "c-safe",
      role: "combobox",
      value: "KR",
      visible: true,
      options: [{ label: "Korea", value: "KR", selected: true }],
      validity: { valid: true },
    });

    const password = sanitizeBrowserControl({
      tag: "input",
      type: "text",
      name: "api_token",
      valueState: "text",
      value: "do-not-return",
      valueLength: 13,
      validity: { valid: false, message: "do-not-return is invalid" },
    });
    expect(password).toMatchObject({ valueState: "redacted", value: "", valueLength: 0 });
    expect(password.validity.message).toBe("");

    const file = sanitizeBrowserControl({
      tag: "input",
      type: "file",
      valueState: "file",
      value: "C:\\private\\secret.png",
    });
    expect(file).toMatchObject({ valueState: "file", value: "", valueLength: 0 });
  });

  it("sanitizes before and after state returned by form actions", () => {
    const result = sanitizeBrowserActionResult({
      ok: false,
      error: "verification_failed",
      action: "set_checked",
      before: { tag: "input", type: "checkbox", checked: false },
      after: { tag: "input", type: "checkbox", checked: true },
      url: "https://example.com/form?access_token=secret",
      postcondition: { satisfied: false, ignored: "raw" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: "verification_failed",
      before: { checked: false },
      after: { checked: true },
      postcondition: { satisfied: false },
    });
    expect(result.url).toContain("access_token=%5Bredacted%5D");
    expect(result).not.toHaveProperty("ignored");
  });
});
