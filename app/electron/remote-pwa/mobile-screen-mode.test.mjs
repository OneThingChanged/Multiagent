import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync(
  fileURLToPath(new URL("./app.js", import.meta.url)),
  "utf8",
);

describe("Remote mobile Screen routing", () => {
  it("hides Screen navigation and uses a session-only search label on mobile", () => {
    expect(script).toContain("ui.screensSection.hidden = mobile;");
    expect(script).toContain('? "프로젝트 · 세션 검색"');
  });

  it("does not choose a Screen as the mobile default", () => {
    expect(script).toContain("if (!isMobile()) {\n    const screen = screenGroups()[0];");
    expect(script).toContain('if (agent) return { type: "session", id: agent.id };');
  });

  it("redirects mobile Screen URLs and viewport transitions to a session", () => {
    expect(script).toContain('if (selection.type === "screen") {');
    expect(script).toContain('selection = agentId ? { type: "session", id: agentId } : defaultWorkspaceSelection();');
    expect(script).toContain('mobileMedia.addEventListener("change", () => {\n  applyScreenAvailability();\n  validateSelection();');
  });
});
