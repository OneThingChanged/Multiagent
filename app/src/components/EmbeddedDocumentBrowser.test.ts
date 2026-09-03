import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("EmbeddedDocumentBrowser visibility lifecycle", () => {
  it("hides the persistent native view when its pane unmounts", () => {
    const source = fs.readFileSync(
      new URL("./EmbeddedDocumentBrowser.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain("Screen changes unmount the current PaneSlot");
    expect(source).toMatch(
      /return \(\) => \{[\s\S]*?document_browser_visibility[\s\S]*?browserId,[\s\S]*?visible: false,[\s\S]*?\};/
    );
  });
});
