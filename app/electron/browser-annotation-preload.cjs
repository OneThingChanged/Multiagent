const { ipcRenderer } = require("electron");

const MAX_TEXT = 600;
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "summary",
  "[role=button]",
  "[role=link]",
  "[contenteditable=true]",
].join(",");

let inspectMode = false;
let lastHoverAt = 0;
let lastHoverKey = "";
let hoveredElement = null;
let overlayHost = null;
let overlayBox = null;
let overlayLabel = null;
let previousRootCursor = "";

function clipped(value, max = MAX_TEXT) {
  const text = String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cssPath(element) {
  if (!(element instanceof Element)) return "";
  if (element.id && /^[A-Za-z][\w-]{0,120}$/.test(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }
  const parts = [];
  let current = element;
  for (let depth = 0; current && current.nodeType === Node.ELEMENT_NODE && depth < 5; depth += 1) {
    let part = current.tagName.toLowerCase();
    const classes = [...current.classList]
      .filter((name) => /^[A-Za-z_][\w-]{0,80}$/.test(name))
      .slice(0, 2);
    if (classes.length) part += `.${classes.map((name) => CSS.escape(name)).join(".")}`;
    const parent = current.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

function meaningfulTarget(value) {
  if (!(value instanceof Element)) return null;
  const interactive = value.closest(INTERACTIVE_SELECTOR);
  if (!interactive) return value;
  let current = value;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current === interactive) return interactive;
    current = current.parentElement;
  }
  return value;
}

function displayName(element) {
  if (!(element instanceof Element)) return "element";
  let name = element.tagName.toLowerCase();
  if (element.id) name += `#${element.id}`;
  const classes = [...element.classList].slice(0, 2);
  if (classes.length) name += `.${classes.join(".")}`;
  return clipped(name, 160);
}

function descriptor(element) {
  if (!(element instanceof Element)) return null;
  const rect = element.getBoundingClientRect();
  const attributes = {};
  for (const attribute of [...element.attributes].slice(0, 30)) {
    if (/(?:value|password|token|secret|authorization|cookie|credential|session)/i.test(attribute.name)) continue;
    attributes[attribute.name] = clipped(attribute.value, 300);
  }
  return {
    tag: element.tagName.toLowerCase(),
    label: displayName(element),
    role: element.getAttribute("role") || "",
    id: element.id || "",
    classes: clipped(element.className, 300),
    text: clipped(element.innerText || element.textContent, 600),
    ariaLabel: element.getAttribute("aria-label") || "",
    selector: cssPath(element),
    attributes,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };
}

function ensureOverlay() {
  if (overlayHost?.isConnected) return;
  overlayHost = document.createElement("div");
  overlayHost.setAttribute("data-multiagent-inspector", "");
  Object.assign(overlayHost.style, {
    all: "initial",
    position: "fixed",
    inset: "0",
    display: "none",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const shadow = overlayHost.attachShadow({ mode: "closed" });
  overlayBox = document.createElement("div");
  Object.assign(overlayBox.style, {
    position: "fixed",
    display: "none",
    boxSizing: "border-box",
    border: "2px solid #58a6ff",
    background: "rgba(88, 166, 255, 0.18)",
    boxShadow: "0 0 0 1px rgba(8, 12, 18, 0.75)",
    pointerEvents: "none",
  });
  overlayLabel = document.createElement("div");
  Object.assign(overlayLabel.style, {
    position: "fixed",
    display: "none",
    boxSizing: "border-box",
    maxWidth: "min(520px, calc(100vw - 12px))",
    padding: "4px 7px",
    borderRadius: "4px",
    background: "#0969da",
    color: "#ffffff",
    font: "11px/1.35 Consolas, 'Courier New', monospace",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.38)",
    pointerEvents: "none",
  });
  shadow.append(overlayBox, overlayLabel);
  document.documentElement.appendChild(overlayHost);
}

function hideHighlight() {
  if (overlayBox) overlayBox.style.display = "none";
  if (overlayLabel) overlayLabel.style.display = "none";
}

function updateHighlight(element) {
  if (!inspectMode || !(element instanceof Element)) {
    hideHighlight();
    return;
  }
  ensureOverlay();
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, Math.min(window.innerWidth - 1, rect.left));
  const top = Math.max(0, Math.min(window.innerHeight - 1, rect.top));
  const right = Math.max(left + 1, Math.min(window.innerWidth, rect.right));
  const bottom = Math.max(top + 1, Math.min(window.innerHeight, rect.bottom));
  if (right <= 0 || bottom <= 0 || left >= window.innerWidth || top >= window.innerHeight) {
    hideHighlight();
    return;
  }
  Object.assign(overlayBox.style, {
    display: "block",
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.max(1, right - left)}px`,
    height: `${Math.max(1, bottom - top)}px`,
  });
  overlayLabel.textContent = `${displayName(element)}  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  overlayLabel.style.display = "block";
  const labelHeight = 24;
  const labelTop = top >= labelHeight + 4
    ? top - labelHeight - 2
    : Math.min(window.innerHeight - labelHeight, bottom + 2);
  overlayLabel.style.left = `${Math.max(4, Math.min(left, window.innerWidth - 180))}px`;
  overlayLabel.style.top = `${Math.max(2, labelTop)}px`;
}

function setInspectMode(enabled) {
  const wasEnabled = inspectMode;
  inspectMode = Boolean(enabled);
  ensureOverlay();
  overlayHost.style.display = inspectMode ? "block" : "none";
  if (inspectMode) {
    if (!wasEnabled) previousRootCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "crosshair";
  } else if (wasEnabled) {
    document.documentElement.style.cursor = previousRootCursor;
    hoveredElement = null;
    lastHoverKey = "";
    hideHighlight();
  }
}

function send(kind, element) {
  const value = descriptor(element);
  if (!value) return;
  try { ipcRenderer.send(`multiagent:browser-${kind}`, value); } catch {}
}

function install() {
  ensureOverlay();
  document.addEventListener("mousemove", (event) => {
    if (!inspectMode) return;
    const element = meaningfulTarget(event.composedPath?.()[0] || event.target);
    if (!element) return;
    hoveredElement = element;
    updateHighlight(element);

    const now = Date.now();
    if (now - lastHoverAt < 80) return;
    lastHoverAt = now;
    const value = descriptor(element);
    if (!value) return;
    const key = `${value.selector}|${value.text.slice(0, 80)}|${value.rect.x},${value.rect.y}`;
    if (key === lastHoverKey) return;
    lastHoverKey = key;
    try { ipcRenderer.send("multiagent:browser-hover", value); } catch {}
  }, true);

  document.addEventListener("click", (event) => {
    if (!inspectMode) return;
    const element = meaningfulTarget(event.composedPath?.()[0] || event.target);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    send("select", element);
    setInspectMode(false);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!inspectMode || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setInspectMode(false);
    try { ipcRenderer.send("multiagent:browser-inspect-cancelled"); } catch {}
  }, true);

  window.addEventListener("scroll", () => updateHighlight(hoveredElement), true);
  window.addEventListener("resize", () => updateHighlight(hoveredElement));
}

ipcRenderer.on("multiagent:browser-inspect-mode", (_event, payload) => {
  setInspectMode(payload?.enabled === true);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
