import fs from "node:fs";
import { describe, expect, it } from "vitest";

function zIndexFor(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return Number(block.match(/z-index:\s*(\d+)/)?.[1] ?? Number.NaN);
}

describe("desktop overlay layering", () => {
  it("keeps dialogs above context-menu click blockers", () => {
    const css = fs.readFileSync(new URL("./App.css", import.meta.url), "utf8");

    expect(zIndexFor(css, ".modal-backdrop")).toBeGreaterThan(
      zIndexFor(css, ".ctx-backdrop")
    );
    expect(zIndexFor(css, ".modal-backdrop")).toBeGreaterThan(
      zIndexFor(css, ".ctx-menu")
    );
    expect(zIndexFor(css, ".ssh-guide-backdrop")).toBeGreaterThan(
      zIndexFor(css, ".modal-backdrop")
    );
  });
});
