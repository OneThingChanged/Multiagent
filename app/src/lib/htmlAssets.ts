// Local-asset inlining for the sandboxed HTML doc viewer.
//
// HTML doc tabs render inside a `srcDoc` iframe whose document URL is
// `about:srcdoc`, so a relative `<img src="chart.png">` (or a CSS `url(...)`,
// or a linked stylesheet) cannot resolve against the file's real location and
// shows up broken. We fix this by rewriting local references into inlined
// content BEFORE the HTML reaches the iframe:
//   - images / media  -> data: URLs
//   - <link stylesheet> -> inlined <style> (with its own url()s rewritten)
//   - url(...) in inline styles and <style> blocks -> data: URLs
//
// The actual file reads happen through a caller-supplied `readAsset` callback
// (backed by the `read_doc_asset` IPC, which is containment-checked against the
// project root). Keeping the reads injectable means the pure string logic below
// is unit-testable without a DOM or IPC, and the DOM walk stays thin glue that
// only runs in the renderer (DOMParser is unavailable under the node test env).

export type HtmlAssetResult =
  | { kind: "data"; dataUrl: string; relativePath: string }
  | { kind: "text"; text: string; relativePath: string };

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// True for references that point at a local file we may try to inline:
// relative paths and absolute local paths (posix `/x` or windows `C:\x`).
// False for empty, fragment-only, protocol-relative, and URI schemes
// (http/https/data/blob/mailto/file/...). A windows drive letter is detected
// before the scheme check so `C:\img.png` is treated as local.
export function isLocalAssetRef(ref: string): boolean {
  const r = ref.trim();
  if (!r || r.startsWith("#") || r.startsWith("//")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(r)) return true;
  if (SCHEME_RE.test(r)) return /^file:/i.test(r);
  return true;
}

export type SrcsetPart = { url: string; descriptor: string };

export function splitSrcset(srcset: string): SrcsetPart[] {
  const out: SrcsetPart[] = [];
  for (const raw of srcset.split(",")) {
    const t = raw.trim();
    if (!t) continue;
    const sp = t.search(/\s/);
    if (sp === -1) out.push({ url: t, descriptor: "" });
    else out.push({ url: t.slice(0, sp).trim(), descriptor: t.slice(sp + 1).trim() });
  }
  return out;
}

export function buildSrcset(parts: SrcsetPart[]): string {
  return parts
    .map((p) => (p.descriptor ? `${p.url} ${p.descriptor}` : p.url))
    .join(", ");
}

function cssUrlRe(): RegExp {
  return /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"'][^)]*?))\s*\)/gi;
}

export function extractCssUrlRefs(css: string): string[] {
  const refs: string[] = [];
  for (const m of css.matchAll(cssUrlRe())) {
    const ref = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (ref) refs.push(ref);
  }
  return refs;
}

// Replace every url(...) whose reference the mapper resolves; leave the rest
// (external, data:, or unmapped local refs) untouched. Resolved values are
// emitted double-quoted with any embedded `"` percent-escaped (data: URLs never
// contain a literal `"`).
export function rewriteCssUrls(
  css: string,
  map: (ref: string) => string | null
): string {
  return css.replace(cssUrlRe(), (full, dq, sq, uq) => {
    const ref = ((dq ?? sq ?? uq ?? "") as string).trim();
    if (!ref) return full;
    const mapped = map(ref);
    if (!mapped) return full;
    return `url("${mapped.replace(/"/g, "%22")}")`;
  });
}

// Cheap pre-scan: skip the DOM parse entirely when the document has no local
// assets to inline, so asset-free HTML renders byte-for-byte as before.
export function htmlNeedsAssetInlining(html: string): boolean {
  return (
    /<(?:img|source|video)\b/i.test(html) ||
    /url\(/i.test(html) ||
    /rel\s*=\s*["']?\s*stylesheet/i.test(html)
  );
}

function cssUrlRefsIn(text: string): string[] {
  return /url\(/i.test(text) ? extractCssUrlRefs(text) : [];
}

// Rewrite local asset references in `html` to inlined content. `readAsset`
// resolves a reference relative to the directory of `containerRelative` (a
// project-relative file path) and returns null for anything outside the project
// root, missing, or unsupported. References that fail to resolve are left as-is.
export async function inlineHtmlAssets(
  html: string,
  opts: {
    htmlRelative: string;
    readAsset: (
      containerRelative: string,
      ref: string
    ) => Promise<HtmlAssetResult | null>;
  }
): Promise<string> {
  const { htmlRelative, readAsset } = opts;

  const dataUrlFor = async (
    container: string,
    ref: string
  ): Promise<string | null> => {
    if (!isLocalAssetRef(ref)) return null;
    const r = await readAsset(container, ref);
    return r && r.kind === "data" ? r.dataUrl : null;
  };

  // Resolve every local ref in a css string up-front, returning a sync lookup
  // so the pure rewriteCssUrls can stay synchronous.
  const buildCssMap = async (
    container: string,
    css: string
  ): Promise<((ref: string) => string | null) | null> => {
    const refs = cssUrlRefsIn(css);
    if (refs.length === 0) return null;
    const map = new Map<string, string | null>();
    await Promise.all(
      refs.map(async (ref) => {
        if (map.has(ref)) return;
        map.set(ref, await dataUrlFor(container, ref));
      })
    );
    return (ref: string) => map.get(ref) ?? null;
  };

  const doc = new DOMParser().parseFromString(html, "text/html");
  type Job = () => Promise<void>;
  const jobs: Job[] = [];

  const setIfChanged = (el: Element, attr: string, value: string | null) => {
    if (value != null && value !== el.getAttribute(attr)) {
      el.setAttribute(attr, value);
    }
  };

  doc
    .querySelectorAll(
      "img[src], img[srcset], source[src], source[srcset], video[src], video[poster]"
    )
    .forEach((el) => {
      const src = el.getAttribute("src");
      if (src != null) {
        jobs.push(async () =>
          setIfChanged(el, "src", await dataUrlFor(htmlRelative, src))
        );
      }
      const poster = el.getAttribute("poster");
      if (poster != null) {
        jobs.push(async () =>
          setIfChanged(el, "poster", await dataUrlFor(htmlRelative, poster))
        );
      }
      const srcset = el.getAttribute("srcset");
      if (srcset != null) {
        jobs.push(async () => {
          const parts = splitSrcset(srcset);
          if (parts.length === 0) return;
          const resolved = await Promise.all(
            parts.map(async (p) => ({
              url: (await dataUrlFor(htmlRelative, p.url)) ?? p.url,
              descriptor: p.descriptor,
            }))
          );
          setIfChanged(el, "srcset", buildSrcset(resolved));
        });
      }
    });

  doc.querySelectorAll("[style]").forEach((el) => {
    const style = el.getAttribute("style") ?? "";
    if (!/url\(/i.test(style)) return;
    jobs.push(async () => {
      const map = await buildCssMap(htmlRelative, style);
      if (!map) return;
      setIfChanged(el, "style", rewriteCssUrls(style, map));
    });
  });

  doc.querySelectorAll("style").forEach((styleEl) => {
    const css = styleEl.textContent ?? "";
    if (!/url\(/i.test(css)) return;
    jobs.push(async () => {
      const map = await buildCssMap(htmlRelative, css);
      if (!map) return;
      const next = rewriteCssUrls(css, map);
      if (next !== css) styleEl.textContent = next;
    });
  });

  // Inline local stylesheets so their rules (and the images they reference)
  // survive the sandbox. url()s inside are resolved relative to the stylesheet.
  const links = Array.from(
    doc.querySelectorAll('link[rel~="stylesheet"][href]')
  );
  for (const link of links) {
    const href = link.getAttribute("href") ?? "";
    if (!isLocalAssetRef(href)) continue;
    const result = await readAsset(htmlRelative, href);
    if (!result || result.kind !== "text") continue;
    const map = await buildCssMap(result.relativePath, result.text);
    const rewritten = map ? rewriteCssUrls(result.text, map) : result.text;
    const styleEl = doc.createElement("style");
    styleEl.textContent = rewritten;
    link.replaceWith(styleEl);
  }

  await Promise.all(jobs.map((job) => job().catch(() => {})));

  const doctype = doc.doctype ? "<!DOCTYPE html>\n" : "";
  return doctype + doc.documentElement.outerHTML;
}
