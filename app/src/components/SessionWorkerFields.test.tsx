import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionWorkerFields } from "./SessionWorkerFields";

function render(disabledTools: string[]) {
  return renderToStaticMarkup(
    <SessionWorkerFields
      settings={undefined}
      disabledTools={disabledTools}
      onChange={() => {}}
    />
  );
}

describe("SessionWorkerFields", () => {
  it("shows both enabled providers", () => {
    const html = render([]);
    expect(html).toContain("Codex · Luna Max");
    expect(html).toContain("Claude · Opus");
  });

  it("hides the Claude option when Claude is disabled", () => {
    const html = render(["claude"]);
    expect(html).toContain("Codex · Luna Max");
    expect(html).not.toContain("Claude · Opus");
  });

  it("hides the Codex option when Codex is disabled", () => {
    const html = render(["codex"]);
    expect(html).not.toContain("Codex · Luna Max");
    expect(html).toContain("Claude · Opus");
  });

  it("hides the entire section when both tools are disabled", () => {
    expect(render(["codex", "claude"])).toBe("");
  });
});
