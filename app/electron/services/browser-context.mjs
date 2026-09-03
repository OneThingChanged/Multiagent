const MAX_TEXT = 2_000;
const MAX_HTML = 12_000;
const MAX_LINKS = 80;
const MAX_CONTROLS = 200;
const MAX_OPTIONS = 100;
const SENSITIVE_URL_PART = /(?:token|access[_-]?token|refresh[_-]?token|secret|password|passwd|authorization|auth|session|session[_-]?id|code|key|signature|sig|nonce|credential|jwt|assertion|ticket)/i;
const SENSITIVE_CONTROL_PART = /(?:password|passwd|passcode|secret|token|credential|authorization|authenticity|one[-_ ]?time|otp|api[-_ ]?key|private[-_ ]?key|card[-_ ]?(?:number|security)|cvv|cvc)/i;

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

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function sanitizeBrowserValidity(value, sensitive = false) {
  if (!value || typeof value !== "object") return null;
  return {
    valid: Boolean(value.valid),
    valueMissing: Boolean(value.valueMissing),
    typeMismatch: Boolean(value.typeMismatch),
    patternMismatch: Boolean(value.patternMismatch),
    tooLong: Boolean(value.tooLong),
    tooShort: Boolean(value.tooShort),
    rangeUnderflow: Boolean(value.rangeUnderflow),
    rangeOverflow: Boolean(value.rangeOverflow),
    stepMismatch: Boolean(value.stepMismatch),
    customError: Boolean(value.customError),
    message: sensitive ? "" : stringValue(value.message, 500),
    describedError: sensitive ? "" : stringValue(value.describedError, 500),
  };
}

export function sanitizeBrowserControl(value) {
  if (!value || typeof value !== "object") return null;
  const type = stringValue(value.type, 80).toLowerCase();
  const tag = stringValue(value.tag, 80).toLowerCase();
  const role = stringValue(value.role, 80).toLowerCase();
  const label = stringValue(value.label, 300);
  const name = stringValue(value.name, 160);
  const ariaLabel = stringValue(value.ariaLabel, 300);
  const placeholder = stringValue(value.placeholder, 300);
  const hint = [type, name, label, ariaLabel, placeholder, value?.locator?.id, value?.locator?.testId].join(" ");
  const fileControl = type === "file" || value.valueState === "file";
  const sensitive = fileControl || type === "password" || value.valueState === "redacted" || SENSITIVE_CONTROL_PART.test(hint);
  const rawValue = sensitive ? "" : stringValue(value.value, 500);
  const options = Array.isArray(value.options)
    ? value.options.slice(0, MAX_OPTIONS).map((option, index) => {
        const optionSensitive = sensitive || option?.valueState === "redacted" || SENSITIVE_CONTROL_PART.test(String(option?.value || ""));
        return {
          index: Number.isInteger(option?.index) ? option.index : index,
          label: stringValue(option?.label, 300),
          selected: Boolean(option?.selected),
          disabled: Boolean(option?.disabled),
          valueState: optionSensitive ? "redacted" : option?.valueState === "empty" ? "empty" : "text",
          value: optionSensitive ? "" : stringValue(option?.value, 300),
        };
      })
    : [];
  const locator = value.locator && typeof value.locator === "object"
    ? {
        id: stringValue(value.locator.id, 160),
        testId: stringValue(value.locator.testId, 160),
        name: stringValue(value.locator.name, 160),
        label: stringValue(value.locator.label, 300),
        role: stringValue(value.locator.role, 80).toLowerCase(),
        formId: stringValue(value.locator.formId, 160),
      }
    : {};
  return {
    targetId: stringValue(value.targetId, 128),
    locator,
    tag,
    type,
    role,
    name,
    label,
    ariaLabel,
    placeholder,
    text: stringValue(value.text, 300),
    selector: stringValue(value.selector, 500),
    visible: Boolean(value.visible),
    inViewport: Boolean(value.inViewport),
    enabled: Boolean(value.enabled),
    disabled: Boolean(value.disabled),
    readonly: Boolean(value.readonly),
    required: Boolean(value.required),
    checked: nullableBoolean(value.checked),
    indeterminate: nullableBoolean(value.indeterminate),
    selected: nullableBoolean(value.selected),
    multiple: Boolean(value.multiple),
    valueState: fileControl ? "file" : sensitive ? "redacted" : value.valueState === "empty" || !rawValue ? "empty" : "text",
    value: rawValue,
    valueLength: sensitive ? 0 : Math.max(0, Math.min(Number(value.valueLength) || rawValue.length, 100_000_000)),
    options,
    validity: sanitizeBrowserValidity(value.validity, sensitive),
    formId: stringValue(value.formId, 160),
    formLabel: stringValue(value.formLabel, 300),
    fieldsetLabel: stringValue(value.fieldsetLabel, 300),
  };
}

export function sanitizeBrowserActionResult(value) {
  if (!value || typeof value !== "object") return null;
  const result = {
    ok: value.ok !== false,
    action: stringValue(value.action, 80),
    error: stringValue(value.error, 160),
    changed: typeof value.changed === "boolean" ? value.changed : undefined,
    skipped: typeof value.skipped === "boolean" ? value.skipped : undefined,
    satisfied: typeof value.satisfied === "boolean" ? value.satisfied : undefined,
    condition: stringValue(value.condition, 80),
    elapsedMs: Number.isFinite(value.elapsedMs) ? Math.max(0, Math.round(value.elapsedMs)) : undefined,
    url: value.url ? sanitizeBrowserUrl(value.url) : undefined,
    before: sanitizeBrowserControl(value.before),
    after: sanitizeBrowserControl(value.after),
    control: sanitizeBrowserControl(value.control),
    candidates: Array.isArray(value.candidates)
      ? value.candidates.slice(0, 10).map(sanitizeBrowserControl).filter(Boolean)
      : undefined,
    controls: Array.isArray(value.controls)
      ? value.controls.slice(0, MAX_CONTROLS).map(sanitizeBrowserControl).filter(Boolean)
      : undefined,
    count: Number.isFinite(value.count) ? Math.max(0, Math.round(value.count)) : undefined,
    invalidCount: Number.isFinite(value.invalidCount) ? Math.max(0, Math.round(value.invalidCount)) : undefined,
    truncated: typeof value.truncated === "boolean" ? value.truncated : undefined,
    postcondition: value.postcondition && typeof value.postcondition === "object"
      ? { satisfied: Boolean(value.postcondition.satisfied) }
      : undefined,
  };
  return Object.fromEntries(Object.entries(result).filter(([, entry]) => entry !== undefined && entry !== "" && entry !== null));
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
    ? value.controls.slice(0, MAX_CONTROLS).map(sanitizeBrowserControl).filter(Boolean)
    : [];
  return {
    url: sanitizeBrowserUrl(value.url),
    title: stringValue(value.title, 500),
    text: stringValue(value.text, 20_000),
    links,
    controls,
    controlCount: Number.isFinite(value.controlCount) ? Math.max(0, Math.round(value.controlCount)) : controls.length,
    truncated: Boolean(value.truncated || Number(value.controlCount) > controls.length),
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
