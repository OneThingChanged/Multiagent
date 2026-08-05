import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name) => fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("Remote mobile document layout", () => {
  const html = read("./index.html");
  const css = read("./styles.css");
  const script = read("./app.js");

  it("groups project controls and the tree inside a dedicated document sidebar", () => {
    const sidebar = html.slice(
      html.indexOf('id="documentSidebar"'),
      html.indexOf('id="documentSidebarBackdrop"'),
    );

    expect(sidebar).toContain('id="documentProjectSelect"');
    expect(sidebar).toContain('id="documentSearchInput"');
    expect(sidebar).toContain('id="documentList"');
    expect(html).toContain('id="documentSidebarToggle"');
  });

  it("uses an off-canvas drawer instead of stacking the tree above the preview", () => {
    expect(css).toContain('.documents-view.document-sidebar-open .document-sidebar { transform: translateX(0); }');
    expect(css).toContain('.document-preview { width: 100%; height: 100%; }');
    expect(css).not.toContain('grid-template-rows: minmax(120px, 34%) minmax(0, 1fr)');
  });

  it("closes the drawer after a mobile document selection", () => {
    expect(script).toContain('if (isMobile()) setDocumentSidebarOpen(false);');
    expect(script).toContain('ui.documentSidebarBackdrop.addEventListener("click", () => setDocumentSidebarOpen(false));');
  });
});
