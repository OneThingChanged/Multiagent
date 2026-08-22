const MAX_TEXT = 2_000;
const MAX_HTML = 12_000;
const MAX_LINKS = 80;
const MAX_CONTROLS = 80;
const SENSITIVE_URL_PART = /(?:token|access[_-]?token|refresh[_-]?token|secret|password|passwd|authorization|auth|session|session[_-]?id|code|key|signature|sig|nonce|credential|jwt|assertion|ticket)/i;

function stringValue(value, max = MAX_TEXT) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function sanitizeBrowserText(value, max = MAX_TEXT) {
  return stringValue(value, max);
}

export function sanitizeBrowserUrl(value, max = 4_000) {
  const raw = stringValue(value, max * 2);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.username) url.username = "[redacted]";
    if (url.password) url.password = "[redacted]";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_URL_PART.test(key)) url.searchParams.set(key, "[redacted]");
    }
    if (url.hash && SENSITIVE_URL_PART.test(url.hash)) url.hash = "#redacted";
    return stringValue(url.toString(), max);
  } catch {
    return stringValue(raw, max);
  }
}

export function sanitizeHtmlSnippet(value, max = MAX_HTML) {
  let html = stringValue(value, max * 2);
  if (!html) return "";
  // The browser snapshot is context for an agent, not executable markup. Keep
  // structure while removing active content and form values.
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\s(?:value|data-value|content|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:nonce|integrity|authenticity_token)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "blocked:");
  return html.length > max ? `${html.slice(0, max)}…` : html;
}

export function sanitizeElementDescriptor(value) {
  if (!value || typeof value !== "object") return null;
  const rect = value.rect && typeof value.rect === "object" ? value.rect : {};
  const viewport = value.viewport && typeof value.viewport === "object" ? value.viewport : {};
  const attributes = value.attributes && typeof value.attributes === "object"
    ? Object.fromEntries(
        Object.entries(value.attributes)
          .filter(([key]) => !/(?:value|password|token|secret|authorization|cookie|credential|session)/i.test(key))
          .slice(0, 30)
          .map(([key, entry]) => [stringValue(key, 80), stringValue(entry, 300)])
      )
    : {};
  return {
    tag: stringValue(value.tag, 80).toLowerCase(),
    label: stringValue(value.label, 200),
    role: stringValue(value.role, 120),
    id: stringValue(value.id, 160),
    classes: stringValue(value.classes, 300),
    text: stringValue(value.text, 600),
    ariaLabel: stringValue(value.ariaLabel, 300),
    selector: stringValue(value.selector, 500),
    attributes,
    rect: {
      x: Number.isFinite(rect.x) ? Math.round(rect.x) : 0,
      y: Number.isFinite(rect.y) ? Math.round(rect.y) : 0,
      width: Number.isFinite(rect.width) ? Math.round(rect.width) : 0,
      height: Number.isFinite(rect.height) ? Math.round(rect.height) : 0,
    },
    viewport: {
      width: Number.isFinite(viewport.width) ? Math.max(0, Math.round(viewport.width)) : 0,
      height: Number.isFinite(viewport.height) ? Math.max(0, Math.round(viewport.height)) : 0,
      scrollX: Number.isFinite(viewport.scrollX) ? Math.round(viewport.scrollX) : 0,
      scrollY: Number.isFinite(viewport.scrollY) ? Math.round(viewport.scrollY) : 0,
    },
  };
}

export function normalizeBrowserCaptureRect(rect, viewport = {}) {
  if (!rect || typeof rect !== "object") return null;
  const viewportWidth = Number.isFinite(viewport.width) && viewport.width > 0
    ? Math.round(viewport.width)
    : 4_000;
  const viewportHeight = Number.isFinite(viewport.height) && viewport.height > 0
    ? Math.round(viewport.height)
    : 4_000;
  const rawX = Number.isFinite(rect.x) ? Math.round(rect.x) : 0;
  const rawY = Number.isFinite(rect.y) ? Math.round(rect.y) : 0;
  const requestedWidth = Number.isFinite(rect.width) ? Math.round(rect.width) : 1;
  const requestedHeight = Number.isFinite(rect.height) ? Math.round(rect.height) : 1;
  const x = Math.max(0, Math.min(viewportWidth - 1, rawX));
  const y = Math.max(0, Math.min(viewportHeight - 1, rawY));
  const visibleWidth = rawX + Math.max(1, requestedWidth) - x;
  const visibleHeight = rawY + Math.max(1, requestedHeight) - y;
  return {
    x,
    y,
    width: Math.max(1, Math.min(4_000, viewportWidth - x, visibleWidth)),
    height: Math.max(1, Math.min(4_000, viewportHeight - y, visibleHeight)),
  };
}

export function sanitizeBrowserSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  const links = Array.isArray(value.links)
    ? value.links.slice(0, MAX_LINKS).map((link) => ({
        text: stringValue(link?.text, 300),
        href: sanitizeBrowserUrl(link?.href, 2_000),
      }))
    : [];
  const controls = Array.isArray(value.controls)
    ? value.controls.slice(0, MAX_CONTROLS).map((control) => ({
        tag: stringValue(control?.tag, 80).toLowerCase(),
        type: stringValue(control?.type, 80).toLowerCase(),
        text: stringValue(control?.text, 300),
        ariaLabel: stringValue(control?.ariaLabel, 300),
        selector: stringValue(control?.selector, 500),
        disabled: Boolean(control?.disabled),
      }))
    : [];
  return {
    url: sanitizeBrowserUrl(value.url),
    title: stringValue(value.title, 500),
    text: stringValue(value.text, 20_000),
    links,
    controls,
  };
}

export function buildBrowserAnnotation({
  browserId,
  agentId,
  url,
  title,
  element,
  html,
  screenshotPath,
  capturedAt = Date.now(),
}) {
  return {
    browserId: stringValue(browserId, 128),
    tabId: stringValue(browserId, 128),
    agentId: stringValue(agentId, 256) || null,
    url: sanitizeBrowserUrl(url),
    title: stringValue(title, 500),
    capturedAt,
    element: sanitizeElementDescriptor(element),
    html: sanitizeHtmlSnippet(html),
    screenshotPath: stringValue(screenshotPath, 1_000) || null,
  };
}
