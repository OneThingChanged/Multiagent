import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DocumentPreviewService, documentPreviewInternals } from "./document-preview-service.mjs";

const services = [];
const roots = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "multiagent-preview-"));
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.writeFile(
    path.join(root, "docs", "index.html"),
    "<!doctype html><link rel=stylesheet href=style.css><img src=logo.svg><script src=app.js></script>",
  );
  await fs.writeFile(path.join(root, "docs", "style.css"), "body { color: red; }");
  await fs.writeFile(path.join(root, "docs", "app.js"), "document.title = 'preview';");
  await fs.writeFile(path.join(root, "docs", "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  await fs.writeFile(path.join(root, "secret.txt"), "do not expose");
  roots.push(root);
  return root;
}

describe("DocumentPreviewService", () => {
  it("serves a project HTML file and its relative assets", async () => {
    const root = await fixture();
    const service = new DocumentPreviewService();
    services.push(service);

    const preview = await service.issue({ folder: root, relativePath: "docs/index.html" });
    expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/preview\//);

    const html = await fetch(preview.url);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-security-policy")).toContain("sandbox");
    expect(await html.text()).toContain("style.css");

    const css = await fetch(new URL("style.css", preview.url));
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain("color: red");
  });

  it("rejects paths outside the project and unsupported entry files", async () => {
    const root = await fixture();
    const service = new DocumentPreviewService();
    services.push(service);

    await expect(service.issue({ folder: root, relativePath: "../secret.txt" })).rejects.toThrow();
    await expect(service.issue({ folder: root, relativePath: "secret.txt" })).rejects.toThrow(/HTML/);

    const preview = await service.issue({ folder: root, relativePath: "docs/index.html" });
    const outside = await fetch(preview.url.replace(/docs\/index\.html$/, "%2E%2E/secret.txt"));
    expect(outside.status).toBe(404);
  });

  it("expires capability URLs", async () => {
    const root = await fixture();
    const service = new DocumentPreviewService({ ttlMs: 1 });
    services.push(service);

    const preview = await service.issue({ folder: root, relativePath: "docs/index.html" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(service.isPreviewUrl(preview.url, preview.token)).toBe(false);
    expect((await fetch(preview.url)).status).toBe(404);
  });

  it("normalizes only safe relative paths", () => {
    expect(documentPreviewInternals.normalizeRelativePath("docs\\index.html")).toBe("docs/index.html");
    expect(documentPreviewInternals.normalizeRelativePath("../secret.txt")).toBeNull();
    expect(documentPreviewInternals.isSafeRelativePath(".git/config")).toBe(false);
    expect(documentPreviewInternals.isSafeRelativePath("docs/index.html")).toBe(true);
  });
});
