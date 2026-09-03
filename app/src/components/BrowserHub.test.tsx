import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DocumentBrowserSnapshot } from "../platform/ipcContract";
import { BrowserHub, browserHubTabTitle } from "./BrowserHub";

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
