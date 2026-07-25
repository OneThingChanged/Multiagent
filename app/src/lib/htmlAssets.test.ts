import { describe, expect, it } from "vitest";
import {
  buildSrcset,
  extractCssUrlRefs,
  htmlNeedsAssetInlining,
  isLocalAssetRef,
  rewriteCssUrls,
  splitSrcset,
} from "./htmlAssets";

describe("isLocalAssetRef", () => {
  it("accepts relative and absolute local paths", () => {
    expect(isLocalAssetRef("chart.png")).toBe(true);
    expect(isLocalAssetRef("./chart.png")).toBe(true);
    expect(isLocalAssetRef("../img/chart.png")).toBe(true);
    expect(isLocalAssetRef("/abs/chart.png")).toBe(true);
    expect(isLocalAssetRef("C:/repo/chart.png")).toBe(true);
    expect(isLocalAssetRef("C:\\repo\\chart.png")).toBe(true);
    expect(isLocalAssetRef("file:///C:/repo/chart.png")).toBe(true);
    expect(isLocalAssetRef("file:///home/u/chart.png")).toBe(true);
  });

  it("rejects empty, fragment, protocol-relative and uri schemes", () => {
    expect(isLocalAssetRef("")).toBe(false);
    expect(isLocalAssetRef("   ")).toBe(false);
    expect(isLocalAssetRef("#anchor")).toBe(false);
    expect(isLocalAssetRef("//cdn.example.com/x.png")).toBe(false);
    expect(isLocalAssetRef("http://example.com/x.png")).toBe(false);
    expect(isLocalAssetRef("https://example.com/x.png")).toBe(false);
    expect(isLocalAssetRef("data:image/png;base64,abc")).toBe(false);
    expect(isLocalAssetRef("blob:http://x/y")).toBe(false);
    expect(isLocalAssetRef("mailto:a@b")).toBe(false);
  });
});

describe("splitSrcset / buildSrcset", () => {
  it("splits urls and descriptors", () => {
    expect(splitSrcset("a.png 1x, b.png 2x")).toEqual([
      { url: "a.png", descriptor: "1x" },
      { url: "b.png", descriptor: "2x" },
    ]);
    expect(splitSrcset("a.png")).toEqual([{ url: "a.png", descriptor: "" }]);
    expect(splitSrcset("  ")).toEqual([]);
  });

  it("round-trips through buildSrcset", () => {
    const parts = splitSrcset("a.png 300w, b.png 2x");
    expect(buildSrcset(parts)).toBe("a.png 300w, b.png 2x");
  });
});

describe("extractCssUrlRefs", () => {
  it("captures quoted and unquoted url() references", () => {
    expect(
      extractCssUrlRefs(
        'background: url(a.png) no-repeat; x: url("b.png"); y: url(\'c.png\'); z: url( d.png )'
      )
    ).toEqual(["a.png", "b.png", "c.png", "d.png"]);
  });

  it("returns nothing when there are no url()s", () => {
    expect(extractCssUrlRefs("color: red;")).toEqual([]);
  });
});

describe("rewriteCssUrls", () => {
  it("replaces resolved refs and leaves the rest untouched", () => {
    const css =
      'a{background:url(a.png)} b{background:url("https://x/y.png")} c{background:url(missing.png)}';
    const out = rewriteCssUrls(css, (ref) =>
      ref === "a.png" ? "data:image/png;base64,AA" : null
    );
    expect(out).toContain('url("data:image/png;base64,AA")');
    expect(out).toContain('url("https://x/y.png")');
    expect(out).toContain("url(missing.png)");
  });
});

describe("htmlNeedsAssetInlining", () => {
  it("detects asset-bearing documents", () => {
    expect(htmlNeedsAssetInlining('<img src="a.png">')).toBe(true);
    expect(htmlNeedsAssetInlining("<div style='background:url(a.png)'>")).toBe(
      true
    );
    expect(htmlNeedsAssetInlining('<link rel="stylesheet" href="s.css">')).toBe(
      true
    );
    expect(htmlNeedsAssetInlining("<source srcset='a.png 1x'>")).toBe(true);
  });

  it("returns false for asset-free documents", () => {
    expect(htmlNeedsAssetInlining("<p>hello world</p>")).toBe(false);
    expect(htmlNeedsAssetInlining("<h1>Title</h1><p>text</p>")).toBe(false);
  });
});
