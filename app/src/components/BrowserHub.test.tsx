import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DocumentBrowserSnapshot } from "../platform/ipcContract";
import {
  BrowserHub,
  browserHubTabTitle,
  isHtmlDocumentBrowser,
} from "./BrowserHub";

function browser(overrides: Partial<DocumentBrowserSnapshot> = {}): DocumentBrowserSnapshot {
  return {
    browserId: "browser-a",
    title: "Example",
    relativePath: "https://example.com/",
    url: "https://example.com/",
    canGoBack: false,
    canGoForward: false,
    loading: false,
    ...overrides,
  };
}

describe("BrowserHub", () => {
  it("uses a readable hostname when the native title is only the URL", () => {
    expect(browserHubTabTitle(browser({ title: "https://example.com/docs" }))).toBe(
      "example.com"
    );
  });

  it("uses the original filename and HTML badge for a local document preview", () => {
    const preview = browser({
      title: "127.0.0.1",
      relativePath: "reports/UProject_Git_Storage_Report.html",
      url: "http://127.0.0.1:64371/preview/token/reports/UProject_Git_Storage_Report.html",
    });

    expect(isHtmlDocumentBrowser(preview)).toBe(true);
    expect(browserHubTabTitle(preview)).toBe("UProject_Git_Storage_Report.html");

    const html = renderToStaticMarkup(
      <BrowserHub
        browsers={[preview]}
        selectedBrowserId="browser-a"
        agentNames={new Map()}
        onSelectBrowser={() => {}}
        onCreateBrowser={async () => {}}
        onCloseBrowser={async () => {}}
      />
    );

    expect(html).toContain(">HTML</span>");
    expect(html).toContain("UProject_Git_Storage_Report.html");
  });

  it("renders every shared browser as a top tab with its session", () => {
    const html = renderToStaticMarkup(
      <BrowserHub
        browsers={[
          browser({ agentId: "agent-a" }),
          browser({ browserId: "browser-b", title: "Search", url: "https://google.com/" }),
        ]}
        selectedBrowserId="browser-a"
        agentNames={new Map([["agent-a", "Codex"]])}
        onSelectBrowser={() => {}}
        onCreateBrowser={async () => {}}
        onCloseBrowser={async () => {}}
      />
    );

    expect(html).toContain("브라우저 모아보기");
    expect(html).toContain("Example");
    expect(html).toContain("Search");
    expect(html).toContain("Codex");
    expect(html).toContain("2개");
  });
});
