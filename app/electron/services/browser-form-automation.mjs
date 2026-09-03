const MAX_SELECTOR_LENGTH = 500;
const MAX_TARGET_TEXT = 300;
const MAX_INPUT_LENGTH = 8_000;
const WAIT_CONDITIONS = new Set([
  "visible",
  "hidden",
  "enabled",
  "disabled",
  "checked",
  "selected",
  "valid",
  "text",
  "valueState",
  "url",
  "navigationComplete",
]);

const ACTION_METHODS = new Set([
  "snapshot",
  "click",
  "type",
  "getControl",
  "formState",
  "setChecked",
  "selectOption",
  "clear",
  "scrollIntoView",
  "waitFor",
]);

function boundedString(value, max = MAX_TARGET_TEXT) {
  if (value === null || value === undefined) return "";
  const result = String(value).replace(/\0/g, "").trim();
  return result.slice(0, max);
}

export function normalizeBrowserTarget(value, legacySelector = "") {
  const raw = typeof value === "string"
    ? { targetId: value }
    : value && typeof value === "object"
      ? value
      : {};
  const selector = boundedString(raw.selector || legacySelector, MAX_SELECTOR_LENGTH);
  if ((raw.selector || legacySelector) && !selector) {
    throw new Error("CSS selector가 올바르지 않습니다.");
  }
  if (String(raw.selector || legacySelector || "").length > MAX_SELECTOR_LENGTH) {
    throw new Error("CSS selector가 너무 깁니다.");
  }
  const target = {
    targetId: boundedString(raw.targetId, 128),
    selector,
    id: boundedString(raw.id, 160),
    testId: boundedString(raw.testId, 160),
    name: boundedString(raw.name, 160),
    label: boundedString(raw.label),
    role: boundedString(raw.role, 80).toLowerCase(),
    formId: boundedString(raw.formId, 160),
  };
  return Object.fromEntries(Object.entries(target).filter(([, entry]) => entry !== ""));
}

export function normalizeBrowserFormRequest(method, body = {}) {
  if (!ACTION_METHODS.has(method)) throw new Error(`지원하지 않는 브라우저 폼 작업입니다: ${method}`);
  const request = {
    target: normalizeBrowserTarget(body.target, body.selector),
  };
  if (method === "snapshot") return {};
  if (method === "formState") {
    if (String(body.scopeSelector || body.selector || "").length > MAX_SELECTOR_LENGTH) {
      throw new Error("CSS selector가 너무 깁니다.");
    }
    return {
      scopeSelector: boundedString(body.scopeSelector || body.selector, MAX_SELECTOR_LENGTH),
    };
  }
  if (method === "type") {
    const text = String(body.text ?? "");
    if (!text || text.length > MAX_INPUT_LENGTH || text.includes("\0")) {
      throw new Error("입력 텍스트가 올바르지 않습니다.");
    }
    request.text = text;
  }
  if (method === "setChecked") {
    if (typeof body.checked !== "boolean") throw new Error("checked 값이 필요합니다.");
    request.checked = body.checked;
  }
  if (method === "selectOption") {
    const option = body.option && typeof body.option === "object" ? body.option : {};
    const label = boundedString(option.label ?? body.optionLabel, 500);
    const value = boundedString(option.value ?? body.optionValue, 500);
    const rawIndex = option.index ?? body.optionIndex;
    const index = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;
    if (!label && !value && index === null) throw new Error("선택할 옵션의 label, value 또는 index가 필요합니다.");
    request.option = { ...(label ? { label } : {}), ...(value ? { value } : {}), ...(index !== null ? { index } : {}) };
  }
  if (method === "waitFor") {
    const condition = boundedString(body.condition, 80);
    if (!WAIT_CONDITIONS.has(condition)) throw new Error("지원하지 않는 대기 조건입니다.");
    const timeoutDefault = condition === "navigationComplete" ? 30_000 : 15_000;
    const requestedTimeout = Number(body.timeoutMs);
    request.condition = condition;
    request.expected = typeof body.expected === "boolean"
      ? body.expected
      : boundedString(body.expected, 1_000);
    request.timeoutMs = Number.isFinite(requestedTimeout)
      ? Math.max(100, Math.min(timeoutDefault, Math.round(requestedTimeout)))
      : timeoutDefault;
  }
  if (!Object.keys(request.target).length && !["waitFor"].includes(method)) {
    throw new Error("브라우저 컨트롤 target 또는 selector가 필요합니다.");
  }
  if (method === "waitFor" && !Object.keys(request.target).length && !["url", "navigationComplete"].includes(request.condition)) {
    throw new Error("이 대기 조건에는 브라우저 컨트롤 target 또는 selector가 필요합니다.");
  }
  return request;
}

// This runtime is fixed application code. Callers can provide only JSON data
// through normalizeBrowserFormRequest; no page JavaScript is accepted.
export const BROWSER_FORM_RUNTIME_SOURCE = String.raw`(() => {
  const CONTROL_SELECTOR = [
    "button", "input", "textarea", "select", "[contenteditable=true]",
    "[role=button]", "[role=checkbox]", "[role=radio]", "[role=switch]",
    "[role=combobox]", "[role=listbox]", "[role=option]"
  ].join(",");
  const SENSITIVE = /(?:password|passwd|passcode|secret|token|credential|authorization|authenticity|one[-_ ]?time|otp|api[-_ ]?key|private[-_ ]?key|card[-_ ]?(?:number|security)|cvv|cvc)/i;
  const clip = (value, max = 500) => String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
  const cssEscape = (value) => globalThis.CSS?.escape
    ? globalThis.CSS.escape(String(value))
    : String(value).replace(/[^A-Za-z0-9_-]/g, (char) => "\\" + char);
  const visible = (node) => {
    if (!(node instanceof Element) || !node.isConnected || node.closest("[hidden],[inert]")) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const roleFor = (node) => {
    const explicit = clip(node.getAttribute("role"), 80).toLowerCase();
    if (explicit) return explicit;
    const tag = node.tagName.toLowerCase();
    const type = clip(node.getAttribute("type"), 80).toLowerCase();
    if (tag === "select") return node.multiple ? "listbox" : "combobox";
    if (tag === "textarea" || node.isContentEditable) return "textbox";
    if (tag === "button" || type === "button" || type === "submit" || type === "reset") return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (tag === "input") return "textbox";
    if (tag === "option") return "option";
    return tag;
  };
  const labelledText = (node) => {
    const labelledBy = clip(node.getAttribute("aria-labelledby"), 500);
    if (labelledBy) {
      const value = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
      if (clip(value, 300)) return clip(value, 300);
    }
    const aria = clip(node.getAttribute("aria-label"), 300);
    if (aria) return aria;
    if (node.id) {
      let explicit = null;
      try { explicit = document.querySelector("label[for=\"" + cssEscape(node.id) + "\"]"); } catch {}
      if (explicit && clip(explicit.textContent, 300)) return clip(explicit.textContent, 300);
    }
    const wrapping = node.closest("label");
    if (wrapping && clip(wrapping.textContent, 300)) return clip(wrapping.textContent, 300);
    return clip(node.getAttribute("placeholder") || node.getAttribute("title") || node.textContent || node.getAttribute("name"), 300);
  };
  const structuralSelector = (element) => {
    if (!(element instanceof Element)) return "";
    if (element.id && document.querySelectorAll("#" + cssEscape(element.id)).length === 1) return "#" + cssEscape(element.id);
    for (const attr of ["data-testid", "data-qa"]) {
      const value = clip(element.getAttribute(attr), 160);
      if (!value || SENSITIVE.test(value)) continue;
      const candidate = "[" + attr + "=\"" + cssEscape(value) + "\"]";
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch {}
    }
    const name = clip(element.getAttribute("name"), 160);
    if (name) {
      const candidate = element.tagName.toLowerCase() + "[name=\"" + cssEscape(name) + "\"]";
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch {}
    }
    const parts = [];
    let current = element;
    for (let depth = 0; current && current.nodeType === Node.ELEMENT_NODE && depth < 5; depth += 1) {
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(current) + 1) + ")";
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  };
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return "c-" + (result >>> 0).toString(16).padStart(8, "0");
  };
  const formContext = (node) => {
    const form = node.form || node.closest("form");
    const fieldset = node.closest("fieldset");
    return {
      formId: clip(form?.id, 160),
      formLabel: clip(form?.getAttribute("aria-label") || form?.getAttribute("name"), 300),
      fieldsetLabel: clip(fieldset?.querySelector(":scope > legend")?.textContent, 300),
    };
  };
  const isSensitive = (node, label = "") => {
    const type = clip(node.getAttribute("type"), 80).toLowerCase();
    if (type === "password" || type === "file") return true;
    const hint = [type, node.getAttribute("autocomplete"), node.id, node.getAttribute("name"), label,
      node.getAttribute("aria-label"), node.getAttribute("placeholder")].join(" ");
    return SENSITIVE.test(hint);
  };
  const safeErrorText = (node, sensitive) => {
    if (sensitive) return "";
    const ids = [node.getAttribute("aria-errormessage"), node.getAttribute("aria-describedby")]
      .filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
    return clip(ids.map((id) => document.getElementById(id)?.textContent || "").join(" "), 500);
  };
  const validityFor = (node, sensitive) => {
    const validity = node.validity;
    if (!validity) return null;
    return {
      valid: Boolean(validity.valid), valueMissing: Boolean(validity.valueMissing),
      typeMismatch: Boolean(validity.typeMismatch), patternMismatch: Boolean(validity.patternMismatch),
      tooLong: Boolean(validity.tooLong), tooShort: Boolean(validity.tooShort),
      rangeUnderflow: Boolean(validity.rangeUnderflow), rangeOverflow: Boolean(validity.rangeOverflow),
      stepMismatch: Boolean(validity.stepMismatch), customError: Boolean(validity.customError),
      message: sensitive ? "" : clip(node.validationMessage, 500),
      describedError: safeErrorText(node, sensitive),
    };
  };
  const descriptor = (node) => {
    if (!(node instanceof Element)) return null;
    const tag = node.tagName.toLowerCase();
    const type = clip(node.getAttribute("type"), 80).toLowerCase();
    const role = roleFor(node);
    const label = labelledText(node);
    const context = formContext(node);
    const selector = structuralSelector(node);
    const testId = clip(node.getAttribute("data-testid") || node.getAttribute("data-qa"), 160);
    const name = clip(node.getAttribute("name"), 160);
    const sensitive = isSensitive(node, label);
    const isFile = type === "file";
    const rawValue = node.isContentEditable ? node.textContent : ("value" in node ? node.value : "");
    const valueText = clip(rawValue, 500);
    const rect = node.getBoundingClientRect();
    const isVisible = visible(node);
    const disabled = Boolean(node.disabled || node.getAttribute("aria-disabled") === "true" || node.closest("fieldset[disabled]"));
    const readonly = Boolean(node.readOnly || node.getAttribute("aria-readonly") === "true");
    const checked = (type === "checkbox" || type === "radio")
      ? Boolean(node.checked)
      : ["checkbox", "radio", "switch"].includes(role)
        ? node.getAttribute("aria-checked") === "true"
        : null;
    const selected = tag === "option"
      ? Boolean(node.selected)
      : role === "option"
        ? node.getAttribute("aria-selected") === "true"
        : null;
    const options = tag === "select" ? [...node.options].slice(0, 100).map((option, index) => {
      const optionLabel = clip(option.label || option.textContent, 300);
      const optionSensitive = sensitive || SENSITIVE.test(option.value || "");
      return {
        index,
        label: optionLabel,
        selected: Boolean(option.selected),
        disabled: Boolean(option.disabled),
        valueState: optionSensitive ? "redacted" : (option.value ? "text" : "empty"),
        value: optionSensitive ? "" : clip(option.value, 300),
      };
    }) : [];
    const identity = [node.id ? "id:" + node.id : "", testId ? "test:" + testId : "", name ? "name:" + name : "",
      "role:" + role, "label:" + label, "form:" + context.formId, "fieldset:" + context.fieldsetLabel,
      !node.id && !testId && !name && !label ? "selector:" + selector : ""].join("|");
    return {
      targetId: hash(identity),
      locator: { id: clip(node.id, 160), testId, name, label, role, formId: context.formId },
      tag, type, role, name, label,
      ariaLabel: clip(node.getAttribute("aria-label"), 300),
      placeholder: clip(node.getAttribute("placeholder"), 300),
      text: clip(node.innerText || node.textContent, 300),
      selector,
      visible: isVisible,
      inViewport: isVisible && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
      enabled: !disabled,
      disabled,
      readonly,
      required: Boolean(node.required || node.getAttribute("aria-required") === "true"),
      checked,
      indeterminate: type === "checkbox" ? Boolean(node.indeterminate) : null,
      selected,
      multiple: Boolean(node.multiple),
      valueState: isFile ? "file" : sensitive ? "redacted" : valueText ? "text" : "empty",
      value: isFile || sensitive ? "" : valueText,
      valueLength: isFile || sensitive ? 0 : String(rawValue == null ? "" : rawValue).length,
      options,
      validity: validityFor(node, sensitive),
      ...context,
    };
  };
  const allControls = (root = document, limit = 200) => {
    let nodes = [];
    try { nodes = [...root.querySelectorAll(CONTROL_SELECTOR)]; } catch {}
    return nodes.slice(0, limit).map(descriptor).filter(Boolean);
  };
  const resolveTarget = (target = {}) => {
    let candidates = [];
    const selector = clip(target.selector, 500);
    if (selector) {
      try { candidates = [...document.querySelectorAll(selector)]; }
      catch { return { ok: false, error: "invalid_target" }; }
    } else if (target.id) {
      const node = document.getElementById(String(target.id));
      if (node) candidates = [node];
    } else if (target.testId) {
      const value = cssEscape(target.testId);
      try { candidates = [...document.querySelectorAll("[data-testid=\"" + value + "\"],[data-qa=\"" + value + "\"]")]; } catch {}
    } else {
      try { candidates = [...document.querySelectorAll(CONTROL_SELECTOR)]; } catch {}
    }
    const descriptors = candidates.map((node) => ({ node, state: descriptor(node) })).filter((entry) => entry.state);
    const matches = descriptors.filter(({ state }) => {
      if (target.targetId && state.targetId !== target.targetId) return false;
      if (target.name && state.name !== target.name) return false;
      if (target.label && state.label !== target.label) return false;
      if (target.role && state.role !== String(target.role).toLowerCase()) return false;
      if (target.formId && state.formId !== target.formId) return false;
      return true;
    });
    if (!matches.length) return { ok: false, error: "target_not_found" };
    if (matches.length > 1) {
      return { ok: false, error: "ambiguous_target", candidates: matches.slice(0, 10).map((entry) => entry.state) };
    }
    return { ok: true, node: matches[0].node, state: matches[0].state };
  };
  const blocked = (node, state, options = {}) => {
    if (!node || !state) return "target_not_found";
    if (state.type === "password" || state.type === "file" || state.valueState === "redacted" && options.textAction) return "sensitive_control";
    if (state.disabled) return "disabled_control";
    if (state.readonly && options.textAction) return "readonly_control";
    return "";
  };
  const afterRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const nativeValue = (node, value) => {
    const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(node, value); else node.value = value;
  };
  const dispatchEditEvents = (node, data = null) => {
    try { node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data })); }
    catch { node.dispatchEvent(new Event("input", { bubbles: true })); }
    node.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const stateResult = (action, before, after, extra = {}) => ({
    ok: true, action, before, after, postcondition: { satisfied: true }, ...extra,
  });
  const snapshot = () => {
    let total = 0;
    try { total = document.querySelectorAll(CONTROL_SELECTOR).length; } catch {}
    return { controls: allControls(document, 200), controlCount: total, truncated: total > 200 };
  };
  const getControl = ({ target }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    return { ok: true, action: "get_control", control: resolved.state };
  };
  const formState = ({ scopeSelector = "" } = {}) => {
    let root = document;
    if (scopeSelector) {
      let matches;
      try { matches = [...document.querySelectorAll(scopeSelector)]; }
      catch { return { ok: false, error: "invalid_target" }; }
      if (!matches.length) return { ok: false, error: "target_not_found" };
      if (matches.length > 1) return { ok: false, error: "ambiguous_target" };
      root = matches[0];
    }
    let total = 0;
    try { total = root.querySelectorAll(CONTROL_SELECTOR).length; } catch {}
    const controls = allControls(root, 200);
    return { ok: true, action: "form_state", controls, count: total, truncated: total > controls.length,
      invalidCount: controls.filter((entry) => entry.validity && !entry.validity.valid).length };
  };
  const click = async ({ target }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    const issue = blocked(resolved.node, resolved.state);
    if (issue) return { ok: false, error: issue };
    resolved.node.scrollIntoView({ block: "center", inline: "nearest" });
    resolved.node.click();
    const after = resolveTarget(target);
    return stateResult("click", resolved.state, after.ok ? after.state : null, { changed: true });
  };
  const type = async ({ target, text }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    const issue = blocked(resolved.node, resolved.state, { textAction: true });
    if (issue) return { ok: false, error: issue };
    const node = resolved.node;
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.focus();
    if (node.isContentEditable) node.textContent = text;
    else if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) nativeValue(node, text);
    else return { ok: false, error: "unsupported_control" };
    dispatchEditEvents(node, null);
    await afterRender();
    const after = resolveTarget(target);
    if (!after.ok || after.state.valueState === "empty") return { ok: false, error: "verification_failed", before: resolved.state, after: after.state || null };
    return stateResult("type", resolved.state, after.state, { changed: true });
  };
  const clear = async ({ target }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    const issue = blocked(resolved.node, resolved.state, { textAction: true });
    if (issue) return { ok: false, error: issue };
    const node = resolved.node;
    node.focus();
    if (node.isContentEditable) node.textContent = "";
    else if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) nativeValue(node, "");
    else return { ok: false, error: "unsupported_control" };
    dispatchEditEvents(node, null);
    await afterRender();
    const after = resolveTarget(target);
    if (!after.ok || after.state.valueState !== "empty") return { ok: false, error: "verification_failed", before: resolved.state, after: after.state || null };
    return stateResult("clear", resolved.state, after.state, { changed: resolved.state.valueState !== "empty", skipped: resolved.state.valueState === "empty" });
  };
  const setChecked = async ({ target, checked }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    const issue = blocked(resolved.node, resolved.state);
    if (issue) return { ok: false, error: issue };
    const node = resolved.node;
    const state = resolved.state;
    if (!["checkbox", "radio", "switch"].includes(state.role)) return { ok: false, error: "unsupported_control" };
    if (state.role === "radio" && checked === false) return { ok: false, error: "unsupported_control" };
    if (state.checked === checked) return stateResult("set_checked", state, state, { changed: false, skipped: true });
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.click();
    await afterRender();
    const after = resolveTarget(target);
    if (!after.ok || after.state.checked !== checked) return { ok: false, error: "verification_failed", before: state, after: after.state || null };
    return stateResult("set_checked", state, after.state, { changed: true, skipped: false });
  };
  const optionMatch = (options, option) => {
    if (Number.isInteger(option.index)) return options.filter((entry) => entry.index === option.index);
    if (option.label) return options.filter((entry) => clip(entry.label, 500) === clip(option.label, 500));
    if (option.value) return options.filter((entry) => String(entry.value) === String(option.value));
    return [];
  };
  const selectOption = async ({ target, option }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    const issue = blocked(resolved.node, resolved.state);
    if (issue) return { ok: false, error: issue };
    const node = resolved.node;
    if (node instanceof HTMLSelectElement) {
      const options = [...node.options].map((entry, index) => ({ node: entry, index, label: entry.label || entry.textContent || "", value: entry.value }));
      const matches = optionMatch(options, option);
      if (!matches.length) return { ok: false, error: "option_not_found" };
      if (matches.length > 1) return { ok: false, error: "ambiguous_option" };
      if (matches[0].node.disabled) return { ok: false, error: "disabled_option" };
      const alreadySelected = matches[0].node.selected && (!node.multiple || [...node.selectedOptions].length === 1);
      if (alreadySelected) return stateResult("select_option", resolved.state, resolved.state, { changed: false, skipped: true });
      if (node.multiple) [...node.options].forEach((entry) => { entry.selected = entry === matches[0].node; });
      else {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        if (setter) setter.call(node, matches[0].node.value); else node.value = matches[0].node.value;
      }
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      await afterRender();
      const after = resolveTarget(target);
      const selected = after.ok && after.state.options.some((entry) => entry.index === matches[0].index && entry.selected);
      if (!selected) return { ok: false, error: "verification_failed", before: resolved.state, after: after.state || null };
      return stateResult("select_option", resolved.state, after.state, { changed: true, skipped: false });
    }
    if (!["combobox", "listbox"].includes(resolved.state.role)) return { ok: false, error: "unsupported_control" };
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.focus();
    node.click();
    await afterRender();
    const visibleOptions = [...document.querySelectorAll("[role=option]")].filter(visible);
    const candidates = visibleOptions.map((entry, index) => ({ node: entry, index, label: labelledText(entry) || clip(entry.textContent, 300), value: entry.getAttribute("data-value") || entry.getAttribute("value") || "" }));
    const matches = optionMatch(candidates, option);
    if (!matches.length) return { ok: false, error: "option_not_found" };
    if (matches.length > 1) return { ok: false, error: "ambiguous_option" };
    if (matches[0].node.getAttribute("aria-disabled") === "true") return { ok: false, error: "disabled_option" };
    matches[0].node.click();
    await afterRender();
    const after = resolveTarget(target);
    const optionSelected = matches[0].node.isConnected && matches[0].node.getAttribute("aria-selected") === "true";
    if (!after.ok || (!optionSelected && !clip(after.state.text + " " + after.state.value, 600).includes(clip(matches[0].label, 300)))) {
      return { ok: false, error: "verification_failed", before: resolved.state, after: after.state || null };
    }
    return stateResult("select_option", resolved.state, after.state, { changed: true, skipped: false });
  };
  const scrollIntoView = async ({ target }) => {
    const resolved = resolveTarget(target);
    if (!resolved.ok) return resolved;
    resolved.node.scrollIntoView({ block: "center", inline: "nearest" });
    await afterRender();
    const after = resolveTarget(target);
    if (!after.ok) return after;
    return { ok: true, action: "scroll_into_view", control: after.state };
  };
  const waitFor = async ({ target, condition, expected, timeoutMs }) => {
    const started = Date.now();
    let last = null;
    const matches = (state) => {
      if (condition === "url") return location.href.includes(String(expected || ""));
      if (condition === "navigationComplete") return document.readyState !== "loading";
      if (condition === "hidden") return !state || !state.visible;
      if (!state) return false;
      if (condition === "visible") return state.visible === (expected === false ? false : true);
      if (condition === "enabled") return state.enabled === (expected === false ? false : true);
      if (condition === "disabled") return state.disabled === (expected === false ? false : true);
      if (condition === "checked") return state.checked === (expected === false ? false : true);
      if (condition === "selected") return state.selected === (expected === false ? false : true);
      if (condition === "valid") return Boolean(state.validity?.valid) === (expected === false ? false : true);
      if (condition === "valueState") return state.valueState === String(expected || "");
      if (condition === "text") return (state.text + " " + state.label).includes(String(expected || ""));
      return false;
    };
    while (Date.now() - started <= timeoutMs) {
      if (condition === "url" || condition === "navigationComplete") {
        if (matches(null)) return { ok: true, action: "wait_for", condition, satisfied: true, url: location.href, elapsedMs: Date.now() - started };
      } else {
        const resolved = resolveTarget(target);
        last = resolved.ok ? resolved.state : null;
        if (matches(last)) return { ok: true, action: "wait_for", condition, satisfied: true, control: last, elapsedMs: Date.now() - started };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { ok: false, error: "wait_timeout", action: "wait_for", condition, satisfied: false, control: last, url: location.href, elapsedMs: Date.now() - started };
  };
  return { snapshot, click, type, getControl, formState, setChecked, selectOption, clear, scrollIntoView, waitFor };
})`;

export function browserFormRuntimeExpression(method, body = {}) {
  if (!ACTION_METHODS.has(method)) throw new Error(`지원하지 않는 브라우저 폼 작업입니다: ${method}`);
  const payload = normalizeBrowserFormRequest(method, body);
  return `(async () => { const runtime = (${BROWSER_FORM_RUNTIME_SOURCE})(); return runtime[${JSON.stringify(method)}](${JSON.stringify(payload)}); })()`;
}

export const browserFormInternals = {
  actionMethods: ACTION_METHODS,
  waitConditions: WAIT_CONDITIONS,
};
