const $ = (selector) => document.querySelector(selector);

const ui = {
  appShell: $(".app-shell"),
  connection: $("#connection"),
  updated: $("#updated"),
  workingCount: $("#workingCount"),
  questionCount: $("#questionCount"),
  doneCount: $("#doneCount"),
  idleCount: $("#idleCount"),
  offlineCount: $("#offlineCount"),
  totalCount: $("#totalCount"),
  summaryGrid: $("#summaryGrid"),
  navigationPane: $("#navigationPane"),
  sidebarToggle: $("#sidebarToggle"),
  sidebarBackdrop: $("#sidebarBackdrop"),
  overviewButton: $("#overviewButton"),
  documentsButton: $("#documentsButton"),
  documentProjectCount: $("#documentProjectCount"),
  usageButton: $("#usageButton"),
  usageProviderCount: $("#usageProviderCount"),
  searchInput: $("#searchInput"),
  screensSection: $("#screensSection"),
  screenCount: $("#screenCount"),
  screenList: $("#screenList"),
  visibleSessionCount: $("#visibleSessionCount"),
  filters: $("#filters"),
  sessionList: $("#sessionList"),
  emptyState: $("#emptyState"),
  monitorView: $("#monitorView"),
  monitorTitle: $("#monitorTitle"),
  monitorMeta: $("#monitorMeta"),
  monitorBoard: $("#monitorBoard"),
  screenView: $("#screenView"),
  screenTitle: $("#screenTitle"),
  screenMeta: $("#screenMeta"),
  screenPaneTabs: $("#screenPaneTabs"),
  screenLayout: $("#screenLayout"),
  screenOpenSession: $("#screenOpenSession"),
  documentsView: $("#documentsView"),
  documentProjectSelect: $("#documentProjectSelect"),
  documentSearchInput: $("#documentSearchInput"),
  refreshDocumentsButton: $("#refreshDocumentsButton"),
  documentListTitle: $("#documentListTitle"),
  documentListCount: $("#documentListCount"),
  documentList: $("#documentList"),
  documentEmptyState: $("#documentEmptyState"),
  documentName: $("#documentName"),
  documentPath: $("#documentPath"),
  documentKind: $("#documentKind"),
  documentMessage: $("#documentMessage"),
  documentMarkdown: $("#documentMarkdown"),
  documentHtml: $("#documentHtml"),
  usageView: $("#usageView"),
  refreshUsageButton: $("#refreshUsageButton"),
  usageRemainingSummary: $("#usageRemainingSummary"),
  usageProviderSummary: $("#usageProviderSummary"),
  usageUpdatedSummary: $("#usageUpdatedSummary"),
  usageMessage: $("#usageMessage"),
  usageProviderGrid: $("#usageProviderGrid"),
  sessionView: $("#sessionView"),
  detailStatus: $("#detailStatus"),
  detailName: $("#detailName"),
  detailMeta: $("#detailMeta"),
  sessionNavButton: $("#sessionNavButton"),
  backToScreenButton: $("#backToScreenButton"),
  questionPanel: $("#questionPanel"),
  questionText: $("#questionText"),
  questionOptions: $("#questionOptions"),
  focusAnswerButton: $("#focusAnswerButton"),
  promptPanel: $("#promptPanel"),
  promptText: $("#promptText"),
  outputText: $("#outputText"),
  sessionOffline: $("#sessionOffline"),
  restartSessionButton: $("#restartSessionButton"),
  sessionMode: $("#sessionMode"),
  chatView: $("#chatView"),
  outputPanel: $("#outputPanel"),
  terminalMount: $("#terminalMount"),
  terminalLive: $("#terminalLive"),
  copyOutputButton: $("#copyOutputButton"),
  composerForm: $("#composerForm"),
  composerQueue: $("#composerQueue"),
  composerAc: $("#composerAc"),
  composerAttachments: $("#composerAttachments"),
  attachmentButton: $("#attachmentButton"),
  attachmentInput: $("#attachmentInput"),
  messageInput: $("#messageInput"),
  sendButton: $("#sendButton"),
  refreshButton: $("#refreshButton"),
  installButton: $("#installButton"),
  androidDownloadButton: $("#androidDownloadButton"),
  notifyButton: $("#notifyButton"),
  logoutButton: $("#logoutButton"),
  mobileMonitorButton: $("#mobileMonitorButton"),
  mobileSessionsButton: $("#mobileSessionsButton"),
  mobileDocumentsButton: $("#mobileDocumentsButton"),
  mobileUsageButton: $("#mobileUsageButton"),
  toast: $("#toast"),
};

const STATUS = {
  working: { label: "작업 중", rank: 0 },
  attention: { label: "답변 필요", rank: 1 },
  recovering: { label: "복구 중", rank: 2 },
  starting: { label: "시작 중", rank: 2 },
  done: { label: "완료", rank: 3 },
  idle: { label: "대기", rank: 4 },
  offline: { label: "비활성", rank: 5 },
};
const STATUS_ORDER = Object.keys(STATUS);
const FILTERS = ["all", "active", ...STATUS_ORDER];
const FILTER_LABELS = { all: "전체 세션", active: "활성 세션" };

let remoteState = { agents: [], view: { projects: [], agents: [], groups: [] } };
const initialUrl = new URL(location.href);
let activeFilter = FILTERS.includes(initialUrl.searchParams.get("filter"))
  ? initialUrl.searchParams.get("filter")
  : "all";
let selection = initialUrl.searchParams.get("usage") === "1"
  ? { type: "usage", id: null }
  : initialUrl.searchParams.get("docs")
  ? { type: "documents", id: initialUrl.searchParams.get("docs") }
  : initialUrl.searchParams.get("screen")
  ? { type: "screen", id: initialUrl.searchParams.get("screen") }
  : initialUrl.searchParams.get("agent")
    ? { type: "session", id: initialUrl.searchParams.get("agent") }
    : { type: "monitor", id: null };
let selectedDocumentPath = initialUrl.searchParams.get("file") || null;
let returnScreenId = null;
let mobilePaneId = null;
let deferredInstallPrompt = null;
let firstSnapshot = true;
let pollTimer = null;
let toastTimer = null;
let screenRenderKey = "";
let previousActivity = new Map();
let backgroundPushEnabled = false;
const leafTabSelection = new Map();
const screenDrafts = new Map();
const screenPaneModes = new Map();
const screenChatCache = new Map();
const screenChatLoads = new Map();
const documentLists = new Map();
const documentListLoads = new Map();
const documentExpandedFolders = new Map();
const attachmentDrafts = new Map();
let documentContent = null;
let documentContentKey = "";
let documentContentLoading = false;
let documentContentError = "";
let documentProjectsRenderKey = "";
let documentListRenderKey = "";
let usageSummary = null;
let usageLoading = false;
let usageRefreshing = false;
let usageError = "";
let usageLoadedAt = 0;
let usageLoadAttempted = false;

function text(value) {
  return String(value ?? "").trim();
}

function make(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value != null) element.textContent = value;
  return element;
}

function questionDetails(agent) {
  const raw = text(agent?.hook?.interactive_question);
  if (!raw) return { text: "", options: [] };
  try {
    const parsed = JSON.parse(raw);
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (questions.length > 0) {
      const options = [];
      const blocks = questions.map((question) => {
        const title = text(question.question || question.header);
        const choices = Array.isArray(question.options)
          ? question.options.map((option) => text(option.label || option)).filter(Boolean)
          : [];
        options.push(...choices);
        return choices.length > 0
          ? `${title}\n${choices.map((choice) => `• ${choice}`).join("\n")}`
          : title;
      }).filter(Boolean);
      return { text: blocks.join("\n\n"), options: [...new Set(options)] };
    }
  } catch {}
  return { text: raw, options: [] };
}

function questionOf(agent) {
  return questionDetails(agent).text;
}

const PERMISSION_HINTS = ["allow", "permission", "approve", "grant", "proceed?", "do you want", "y/n", "yes/no", "허용", "권한", "승인", "진행할까요", "계속할까요"];
function promptFirstLine(t) {
  const line = String(t || "").split(/\r?\n/).find((l) => l.trim()) || "";
  return line.replace(/^[\s>❯•*-]+/, "").trim().slice(0, 200);
}
function promptOptionLines(t) {
  const options = [];
  for (const raw of String(t || "").split(/\r?\n/)) {
    const line = raw.replace(/^[\s>❯•]+/, "").trim();
    const m = line.match(/^(\d{1,2})[.)]\s+(.+)$/) || line.match(/^\[?([a-zA-Z])\]?[.)]\s+(.+)$/);
    if (m && m[2]) options.push({ label: m[2].replace(/\s+/g, " ").slice(0, 80), send: m[1] });
    if (options.length >= 12) break;
  }
  return options;
}
// Inline prompt (question options / permission) for the chat card.
function promptFor(agent) {
  if (!agent) return null;
  // Only while the agent is actually waiting for input (avoids a stale card).
  if (statusOf(agent) !== "attention") return null;
  const details = questionDetails(agent);
  if (details.options && details.options.length) {
    return {
      kind: "question",
      answerStyle: agent.aiToolId === "codex" ? "digit" : "arrow",
      text: promptFirstLine(details.text),
      options: details.options.map((label, i) => ({ label: String(label).slice(0, 80), send: String(i + 1) })),
    };
  }
  const src = details.text || "";
  if (!src) return null;
  const numbered = promptOptionLines(src);
  const lower = src.toLowerCase();
  const isPerm = PERMISSION_HINTS.some((h) => lower.includes(h));
  if (numbered.length >= 2) return { kind: isPerm ? "permission" : "question", answerStyle: "digit", text: promptFirstLine(src), options: numbered };
  if (isPerm) {
    const options = [{ label: "예 (Yes)", send: "y" }, { label: "아니오 (No)", send: "n" }];
    if (lower.includes("always") || lower.includes("항상")) options.push({ label: "항상 허용", send: "a" });
    return { kind: "permission", answerStyle: "digit", text: promptFirstLine(src), options };
  }
  return null;
}
function promptSignature(prompt) {
  return prompt ? `${prompt.kind}|${prompt.text}|${prompt.options.map((o) => o.label).join("|")}` : "";
}
let answeredPromptSig = "";
async function respondPrompt(agentId, prompt, option) {
  answeredPromptSig = promptSignature(prompt); // hide the card; block spam clicks
  if (lastChatData) renderChat(lastChatData);
  const keys =
    prompt.answerStyle === "arrow"
      ? [...Array(Math.max(0, Number(option.send) - 1)).fill("\x1b[B"), "\r"]
      : [option.send, "\r"];
  for (const key of keys) {
    await sendRaw(agentId, key);
    await new Promise((r) => setTimeout(r, 60));
  }
  lastChatFetch = { id: null, at: 0 };
}

function statusOf(agent) {
  const hookEvent = text(agent?.hook?.event).toLowerCase();
  const rawStatus = text(agent?.status).toLowerCase();
  if (["exited", "unreachable", "offline"].includes(rawStatus)) return "offline";
  if (["cancelled", "canceled", "interrupted", "aborted"].includes(hookEvent)) return "idle";
  if (rawStatus === "recovering") return "recovering";
  if (rawStatus === "starting") return "starting";
  if (questionOf(agent) || ["waiting", "blocked", "permission-request"].includes(rawStatus)
    || ["waiting", "blocked", "permission-request"].includes(hookEvent)) return "attention";
  if (rawStatus === "working"
    || ["working", "tool-start", "tool-end"].includes(hookEvent)) return "working";
  if (hookEvent === "done" || rawStatus === "done") return "done";
  if (["running", "idle"].includes(rawStatus)) return "idle";
  return "offline";
}

function stripTerminal(value) {
  return String(value ?? "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[()][0-2A-Z]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/\r/g, "")
    .replace(/[^\x09\x0a\x20-\x7e\u00a0-\uffff]/g, "");
}

function recentOutput(agent, maxLines = 100) {
  const lines = stripTerminal(agent?.output)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  return lines.slice(-maxLines).join("\n").trim();
}

function outputPreview(agent) {
  const prompt = text(agent?.hook?.prompt);
  if (prompt) return prompt;
  const lines = recentOutput(agent, 8).split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.slice(-2).join(" · ") || "표시할 최근 내용이 없습니다.";
}

function projectMap() {
  return new Map((remoteState.view?.projects || []).map((project) => [project.id, project]));
}

function localDocumentProjects() {
  return (remoteState.view?.projects || []).filter((project) => (
    text(project?.id) && text(project?.folder) && !text(project?.sshHostId)
  ));
}

function allAgents() {
  const result = new Map();
  for (const agent of remoteState.view?.agents || []) {
    if (agent?.id) result.set(agent.id, { ...agent });
  }
  for (const agent of remoteState.agents || []) {
    if (agent?.id) result.set(agent.id, { ...(result.get(agent.id) || {}), ...agent });
  }
  return [...result.values()];
}

function agentMap() {
  return new Map(allAgents().map((agent) => [agent.id, agent]));
}

function projectName(agent) {
  return text(agent?.project || projectMap().get(agent?.projectId)?.name) || "기타";
}

function toolName(agent) {
  return text(agent?.tool || agent?.aiToolId) || "shell";
}

function collectLeaves(node, output = []) {
  if (!node || typeof node !== "object") return output;
  if (node.type === "leaf") {
    output.push(node);
    return output;
  }
  if (node.type === "split" && Array.isArray(node.children)) {
    for (const child of node.children) collectLeaves(child, output);
  }
  return output;
}

function collectAgentIds(node, output = []) {
  for (const leaf of collectLeaves(node)) {
    for (const id of Array.isArray(leaf.tabs) ? leaf.tabs : []) {
      if (!output.includes(id)) output.push(id);
    }
  }
  return output;
}

function activeAgentIdForLeaf(group, leaf) {
  const agentsById = agentMap();
  const knownTabs = (Array.isArray(leaf.tabs) ? leaf.tabs : []).filter((id) => agentsById.has(id));
  const key = `${group.id}:${leaf.id}`;
  const localSelection = leafTabSelection.get(key);
  if (knownTabs.includes(localSelection)) return localSelection;
  const stored = knownTabs.includes(leaf.tabs?.[leaf.activeIndex]) ? leaf.tabs[leaf.activeIndex] : null;
  return stored || knownTabs[0] || null;
}

function screenGroups() {
  const agentsById = agentMap();
  const result = [];
  const groups = Array.isArray(remoteState.view?.groups) ? remoteState.view.groups : [];
  for (const group of groups) {
    if (!group?.id || group.layout?.type !== "split") continue;
    const leaves = collectLeaves(group.layout).filter((leaf) =>
      (leaf.tabs || []).some((id) => agentsById.has(id))
    );
    const memberIds = collectAgentIds(group.layout).filter((id) => agentsById.has(id));
    if (leaves.length < 2 || memberIds.length < 2) continue;
    const number = result.length + 1;
    const paneNames = leaves.map((leaf) => {
      const knownTabs = (leaf.tabs || []).filter((id) => agentsById.has(id));
      const activeId = activeAgentIdForLeaf(group, leaf);
      const activeName = text(agentsById.get(activeId)?.name || activeId || "Empty");
      return knownTabs.length > 1 ? `${activeName}(+${knownTabs.length - 1})` : activeName;
    });
    result.push({ ...group, number, leaves, memberIds, label: paneNames.join(" + ") });
  }
  return result;
}

function sortedAgents() {
  return allAgents().sort((left, right) => {
    const statusDifference = STATUS[statusOf(left)].rank - STATUS[statusOf(right)].rank;
    if (statusDifference !== 0) return statusDifference;
    const projectDifference = projectName(left).localeCompare(projectName(right), "ko");
    if (projectDifference !== 0) return projectDifference;
    return text(left.name || left.id).localeCompare(text(right.name || right.id), "ko");
  });
}

function matchesQuery(agent, query) {
  if (!query) return true;
  return [agent.name, agent.id, projectName(agent), toolName(agent), agent.hook?.prompt]
    .some((value) => text(value).toLowerCase().includes(query));
}

function visibleAgents() {
  const query = ui.searchInput.value.trim().toLowerCase();
  return sortedAgents().filter((agent) => {
    const status = statusOf(agent);
    if (activeFilter === "active" && status === "offline") return false;
    if (!["all", "active"].includes(activeFilter) && status !== activeFilter) return false;
    return matchesQuery(agent, query);
  });
}

function setConnection(state, label) {
  ui.connection.dataset.state = state;
  ui.connection.querySelector("span").textContent = label;
}

function showToast(message) {
  if (toastTimer) clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2800);
}

function updateUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("agent");
  url.searchParams.delete("screen");
  url.searchParams.delete("docs");
  url.searchParams.delete("file");
  url.searchParams.delete("usage");
  if (selection.type === "session") url.searchParams.set("agent", selection.id);
  if (selection.type === "screen") url.searchParams.set("screen", selection.id);
  if (selection.type === "usage") url.searchParams.set("usage", "1");
  if (selection.type === "documents") {
    url.searchParams.set("docs", selection.id);
    if (selectedDocumentPath) url.searchParams.set("file", selectedDocumentPath);
  }
  if (activeFilter === "all") url.searchParams.delete("filter");
  else url.searchParams.set("filter", activeFilter);
  history.replaceState(null, "", url);
}

function setActiveFilter(filter) {
  activeFilter = FILTERS.includes(filter) ? filter : "all";
  for (const button of ui.filters.querySelectorAll("[data-filter]")) {
    button.classList.toggle("active", button.dataset.filter === activeFilter);
  }
  for (const card of ui.summaryGrid.querySelectorAll("[data-summary-filter]")) {
    card.classList.toggle("active", card.dataset.summaryFilter === activeFilter);
  }
  updateUrl();
}

function renderSummary() {
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  for (const agent of allAgents()) counts[statusOf(agent)] += 1;
  ui.workingCount.textContent = String(counts.working);
  ui.questionCount.textContent = String(counts.attention);
  ui.doneCount.textContent = String(counts.done);
  ui.idleCount.textContent = String(counts.idle);
  ui.offlineCount.textContent = String(counts.offline);
  ui.totalCount.textContent = String(allAgents().length);
  ui.documentProjectCount.textContent = String(localDocumentProjects().length);
  if ("setAppBadge" in navigator) {
    if (counts.attention > 0) navigator.setAppBadge(counts.attention).catch(() => {});
    else navigator.clearAppBadge?.().catch(() => {});
  }
}

function renderNavigation() {
  const query = ui.searchInput.value.trim().toLowerCase();
  const screens = screenGroups().filter((screen) => {
    if (!query) return true;
    const members = screen.memberIds.map((id) => agentMap().get(id)).filter(Boolean);
    return `screen ${screen.number} ${screen.label}`.toLowerCase().includes(query)
      || members.some((agent) => matchesQuery(agent, query));
  });
  ui.screenCount.textContent = String(screenGroups().length);
  const screenFragment = document.createDocumentFragment();
  for (const screen of screens) {
    const button = make("button", "screen-row");
    button.type = "button";
    button.classList.toggle("selected", selection.type === "screen" && selection.id === screen.id);
    const rail = make("span", "screen-rail");
    rail.setAttribute("aria-hidden", "true");
    const copy = make("span", "screen-copy");
    copy.append(make("strong", "", `Screen ${screen.number}`), make("small", "", screen.label));
    button.append(rail, copy, make("span", "screen-direction", screen.layout.direction === "v" ? "↕" : "↔"));
    button.addEventListener("click", () => selectScreen(screen.id));
    screenFragment.appendChild(button);
  }
  if (screens.length === 0) screenFragment.appendChild(make("p", "empty-state", query ? "검색된 Screen이 없습니다." : "분할 Screen이 없습니다."));
  ui.screenList.replaceChildren(screenFragment);

  const agents = visibleAgents();
  ui.visibleSessionCount.textContent = String(agents.length);
  const sessionFragment = document.createDocumentFragment();
  let currentProject = null;
  for (const agent of agents) {
    const project = projectName(agent);
    if (project !== currentProject) {
      currentProject = project;
      sessionFragment.appendChild(make("div", "project-label", project));
    }
    const status = statusOf(agent);
    const button = make("button", "session-row");
    button.type = "button";
    button.dataset.status = status;
    button.classList.toggle("selected", selection.type === "session" && selection.id === agent.id);
    const dot = make("span", `status-dot ${status}`);
    dot.setAttribute("aria-hidden", "true");
    const copy = make("span", "session-copy");
    copy.append(make("strong", "", text(agent.name || agent.id)), make("small", "", `${toolName(agent)} · ${outputPreview(agent)}`));
    button.append(dot, copy, make("span", "session-status", STATUS[status].label));
    button.addEventListener("click", () => selectSession(agent.id));
    sessionFragment.appendChild(button);
  }
  ui.sessionList.replaceChildren(sessionFragment);
  ui.emptyState.hidden = agents.length !== 0;
  ui.overviewButton.classList.toggle("selected", selection.type === "monitor");
  ui.documentsButton.classList.toggle("selected", selection.type === "documents");
  ui.usageButton.classList.toggle("selected", selection.type === "usage");
}

function renderMonitor() {
  const query = ui.searchInput.value.trim().toLowerCase();
  const statuses = activeFilter === "all"
    ? STATUS_ORDER
    : activeFilter === "active"
      ? STATUS_ORDER.filter((status) => status !== "offline")
      : [activeFilter];
  const filterLabel = FILTER_LABELS[activeFilter] || STATUS[activeFilter].label;
  ui.monitorTitle.textContent = filterLabel;
  ui.monitorMeta.textContent = activeFilter === "all"
    ? "PC에서 실행 중인 작업을 상태별로 확인합니다."
    : `${filterLabel}만 표시하고 있습니다.`;
  ui.monitorBoard.dataset.filtered = ["all", "active"].includes(activeFilter) ? "false" : "true";
  const fragment = document.createDocumentFragment();
  for (const status of statuses) {
    const agents = sortedAgents().filter((agent) => statusOf(agent) === status && matchesQuery(agent, query));
    const lane = make("section", "status-lane");
    lane.dataset.status = status;
    const head = make("div", "lane-head");
    const title = make("span", "lane-title");
    title.append(make("i", ""), make("strong", "", STATUS[status].label));
    head.append(title, make("b", "", String(agents.length)));
    const cards = make("div", "lane-cards");
    for (const agent of agents) {
      const card = make("button", "monitor-card");
      card.type = "button";
      card.append(
        make("strong", "", text(agent.name || agent.id)),
        make("span", "", `${projectName(agent)} · ${toolName(agent)}`),
        make("p", "", outputPreview(agent))
      );
      card.addEventListener("click", () => selectSession(agent.id));
      cards.appendChild(card);
    }
    if (agents.length === 0) cards.appendChild(make("p", "lane-empty", "해당 세션 없음"));
    lane.append(head, cards);
    fragment.appendChild(lane);
  }
  ui.monitorBoard.replaceChildren(fragment);
}

function selectedScreen() {
  return selection.type === "screen" ? screenGroups().find((screen) => screen.id === selection.id) || null : null;
}

function selectedAgent() {
  return selection.type === "session" ? agentMap().get(selection.id) || null : null;
}

function activeScreenAgentId(screen = selectedScreen()) {
  if (!screen) return null;
  const leaf = screen.leaves.find((candidate) => candidate.id === mobilePaneId) || screen.leaves[0];
  return leaf ? activeAgentIdForLeaf(screen, leaf) : screen.memberIds[0] || null;
}

function updateMobilePaneVisibility() {
  for (const leaf of ui.screenLayout.querySelectorAll(".screen-leaf")) {
    leaf.classList.toggle("mobile-pane-active", leaf.dataset.leafId === mobilePaneId);
  }
}

function renderScreenPaneTabs(screen) {
  if (!screen.leaves.some((leaf) => leaf.id === mobilePaneId)) mobilePaneId = screen.leaves[0]?.id || null;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < screen.leaves.length; index += 1) {
    const leaf = screen.leaves[index];
    const agentId = activeAgentIdForLeaf(screen, leaf);
    const agent = agentMap().get(agentId);
    const button = make("button", "screen-pane-tab");
    button.type = "button";
    button.classList.toggle("active", leaf.id === mobilePaneId);
    button.textContent = `${index + 1}. ${text(agent?.name || agentId || "Empty")}`;
    button.addEventListener("click", () => {
      mobilePaneId = leaf.id;
      renderScreenPaneTabs(screen);
      updateMobilePaneVisibility();
      updateScreenHeader(screen);
      syncTerminal();
      syncScreenChats(screen);
    });
    fragment.appendChild(button);
  }
  ui.screenPaneTabs.replaceChildren(fragment);
}

function screenPaneKey(screen, leaf) {
  return `${screen.id}:${leaf.id}`;
}

function screenPaneMode(screen, leaf) {
  return screenPaneModes.get(screenPaneKey(screen, leaf)) === "chat" ? "chat" : "term";
}

function setScreenPaneMode(screen, leaf, mode) {
  screenPaneModes.set(screenPaneKey(screen, leaf), mode === "chat" ? "chat" : "term");
  screenRenderKey = "";
  renderScreen();
  syncTerminal();
}

function renderLayoutNode(node, screen) {
  if (node?.type === "split") {
    const split = make("div", `screen-split direction-${node.direction === "v" ? "v" : "h"}`);
    for (const child of node.children || []) split.appendChild(renderLayoutNode(child, screen));
    return split;
  }
  const leaf = node || { id: "empty", tabs: [], activeIndex: 0 };
  const agentsById = agentMap();
  const knownTabs = (leaf.tabs || []).filter((id) => agentsById.has(id));
  const activeAgentId = activeAgentIdForLeaf(screen, leaf);
  const activeAgent = agentsById.get(activeAgentId);
  const panel = make("section", "screen-leaf");
  panel.dataset.leafId = leaf.id;
  panel.classList.toggle("mobile-pane-active", leaf.id === mobilePaneId);
  if (!activeAgent) {
    panel.appendChild(make("p", "lane-empty", "세션을 찾을 수 없습니다."));
    return panel;
  }
  panel.dataset.screenAgent = activeAgent.id;
  const paneMode = screenPaneMode(screen, leaf);
  panel.dataset.paneMode = paneMode;
  const terminal = make("div", "screen-terminal");
  const head = make("div", "screen-terminal-head");
  const tabs = make("div", "screen-tabs");
  for (const id of knownTabs) {
    const agent = agentsById.get(id);
    const tab = make("button", "screen-tab");
    tab.type = "button";
    tab.dataset.tabAgent = id;
    tab.classList.toggle("active", id === activeAgent.id);
    tab.append(make("span", `status-dot ${statusOf(agent)}`), make("span", "", text(agent.name || id)));
    tab.addEventListener("click", () => {
      leafTabSelection.set(`${screen.id}:${leaf.id}`, id);
      screenRenderKey = "";
      renderScreen();
    });
    tabs.appendChild(tab);
  }
  const actions = make("div", "screen-terminal-actions");
  const modeSwitch = make("div", "screen-pane-mode");
  for (const [mode, label] of [["chat", "채팅"], ["term", "터미널"]]) {
    const button = make("button", paneMode === mode ? "active" : "", label);
    button.type = "button";
    button.dataset.screenPaneMode = mode;
    button.title = mode === "chat" ? "대화로 보기" : "라이브 터미널로 보기";
    button.addEventListener("click", () => setScreenPaneMode(screen, leaf, mode));
    modeSwitch.appendChild(button);
  }
  const expand = make("button", "expand-session", "↗");
  expand.type = "button";
  expand.title = "세션 크게 보기";
  expand.addEventListener("click", () => selectSession(activeAgent.id, screen.id));
  actions.append(modeSwitch, expand);
  head.append(tabs, actions);

  const body = make("div", "terminal-body");
  const meta = make("div", "terminal-meta");
  const status = make("span", `status-chip ${statusOf(activeAgent)}`, STATUS[statusOf(activeAgent)].label);
  status.dataset.role = "status";
  const metaText = make("span", "", `${projectName(activeAgent)} · ${toolName(activeAgent)}`);
  metaText.dataset.role = "meta";
  meta.append(status, metaText);
  const question = make("p", "terminal-question", questionOf(activeAgent));
  question.dataset.role = "question";
  question.hidden = !questionOf(activeAgent);
  body.append(meta, question);
  if (paneMode === "chat") {
    const chat = make("div", "screen-chat-view chat-view");
    chat.dataset.screenChat = activeAgent.id;
    chat.appendChild(make("div", "chat-empty", "대화를 불러오는 중…"));
    body.append(chat);
  } else if (terminalSupported) {
    // syncTerminal() attaches a live xterm to this mount after render.
    const mount = make("div", "screen-terminal-mount");
    mount.dataset.terminalMount = activeAgent.id;
    body.append(mount);
  } else {
    const output = make("pre", "terminal-output", recentOutput(activeAgent, 70) || "출력 대기 중…");
    output.dataset.role = "output";
    body.append(output);
  }

  const form = make("form", "screen-composer");
  const input = document.createElement("input");
  input.maxLength = 4000;
  const activeStatus = statusOf(activeAgent);
  const inactiveTerminal = ["offline", "recovering", "starting"].includes(activeStatus) && paneMode === "term";
  input.placeholder = inactiveTerminal
    ? activeStatus === "offline"
      ? "비활성 세션은 채팅 모드에서 활성화할 수 있습니다"
      : "세션 초기화가 끝나면 입력할 수 있습니다"
    : "메시지 또는 답변";
  input.disabled = inactiveTerminal;
  input.value = screenDrafts.get(activeAgent.id) || "";
  input.addEventListener("input", () => screenDrafts.set(activeAgent.id, input.value));
  const send = make("button", "", "전송");
  send.type = "submit";
  send.disabled = inactiveTerminal;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    send.disabled = true;
    const latestStatus = statusOf(agentMap().get(activeAgent.id) || activeAgent);
    if (latestStatus === "offline") {
      if (paneMode !== "chat") {
        showToast("비활성 세션에는 채팅 모드에서만 메시지를 보낼 수 있습니다.");
        send.disabled = false;
        return;
      }
      const requested = await requestSessionActivation(activeAgent.id, { queuedMessage: true });
      if (!requested || !(await waitForSessionReady(activeAgent.id))) {
        if (requested) showToast("세션을 활성화하지 못해 메시지를 전송하지 않았습니다.");
        send.disabled = false;
        return;
      }
    }
    if (["recovering", "starting"].includes(statusOf(agentMap().get(activeAgent.id) || activeAgent))) {
      if (!(await waitForSessionReady(activeAgent.id))) {
        showToast("세션 초기화가 끝나지 않아 메시지를 전송하지 않았습니다.");
        send.disabled = false;
        return;
      }
    }
    const sent = await sendInput(activeAgent.id, message);
    if (sent) {
      input.value = "";
      screenDrafts.delete(activeAgent.id);
    }
    send.disabled = false;
  });
  form.append(input, send);
  terminal.append(head, body, form);
  panel.appendChild(terminal);
  return panel;
}

function screenChatRenderKey(data, agent) {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  const last = blocks[blocks.length - 1];
  const prompt = promptFor(agent);
  return JSON.stringify([
    agent?.id,
    blocks.length,
    String(last?.text ?? last?.output ?? "").length,
    data?.unsupported ? 1 : 0,
    data?.missing ? 1 : 0,
    data?.error ? 1 : 0,
    statusOf(agent),
    prompt ? `${prompt.kind}:${prompt.text}:${prompt.options.length}` : "",
  ]);
}

function renderScreenChat(container, data, agent) {
  if (!container || !agent) return;
  const key = screenChatRenderKey(data, agent);
  if (container.dataset.renderKey === key) return;
  container.dataset.renderKey = key;
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  const fragment = document.createDocumentFragment();

  if (data?.unsupported) {
    fragment.appendChild(make("div", "chat-empty", "이 세션은 대화 보기를 지원하지 않습니다."));
  } else if (data?.error) {
    const error = make("div", "chat-error");
    error.append(make("strong", "", "대화를 불러오지 못했습니다"), make("span", "", "터미널 보기로 전환하거나 다시 시도해 주세요."));
    const retry = make("button", "", "다시 시도");
    retry.type = "button";
    retry.addEventListener("click", () => {
      screenChatCache.delete(agent.id);
      void loadScreenChat(agent.id, container, true);
    });
    const actions = make("div", "chat-error-actions");
    actions.appendChild(retry);
    error.appendChild(actions);
    fragment.appendChild(error);
  } else if (!blocks.length) {
    fragment.appendChild(make("div", "chat-empty", data?.missing ? "아직 대화 기록이 없습니다." : "대화를 불러오는 중…"));
  } else {
    const ranges = [];
    let index = 0;
    while (index < blocks.length) {
      const block = blocks[index];
      if (block.role === "user" && block.kind === "text") {
        ranges.push({ user: true, start: index, end: index + 1 });
        index += 1;
      } else {
        const start = index;
        do { index += 1; }
        while (index < blocks.length && !(blocks[index].role === "user" && blocks[index].kind === "text"));
        ranges.push({ user: false, start, end: index });
      }
    }
    const visible = ranges.slice(-12);
    if (ranges.length > visible.length) {
      const more = make("button", "chat-more", `↗ 이전 대화 ${ranges.length - visible.length}개 · 크게 보기`);
      more.type = "button";
      more.addEventListener("click", () => selectSession(agent.id, selectedScreen()?.id || null));
      fragment.appendChild(more);
    }
    for (const range of visible) {
      if (range.user) {
        const turn = make("div", "chat-turn user");
        turn.appendChild(make("div", "chat-user", blocks[range.start].text));
        fragment.appendChild(turn);
      } else {
        fragment.appendChild(renderAssistantTurn(blocks.slice(range.start, range.end)));
      }
    }
  }

  const chatStatus = statusOf(agent);
  if (!data?.unsupported && chatStatus === "working" && data?.lifecycle !== "idle") {
    const thinking = make("div", "chat-thinking");
    const dots = make("span", "chat-thinking-dots");
    dots.append(make("i", ""), make("i", ""), make("i", ""));
    thinking.append(dots, document.createTextNode("작업 중…"));
    const stop = make("button", "chat-stop", "■ 중단");
    stop.type = "button";
    stop.addEventListener("click", () => { void cancelSession(agent.id); });
    thinking.appendChild(stop);
    fragment.appendChild(thinking);
  } else if (!data?.unsupported && ["recovering", "starting"].includes(chatStatus)) {
    const thinking = make("div", "chat-thinking");
    const dots = make("span", "chat-thinking-dots");
    dots.append(make("i", ""), make("i", ""), make("i", ""));
    thinking.append(
      dots,
      document.createTextNode(chatStatus === "recovering" ? "세션 복구 중…" : "세션 시작 중…"),
    );
    fragment.appendChild(thinking);
  }
  const prompt = promptFor(agent);
  if (prompt && promptSignature(prompt) !== answeredPromptSig) {
    const card = make("div", `chat-prompt ${prompt.kind}`);
    card.appendChild(make("div", "chat-prompt-text", `${prompt.kind === "permission" ? "🔒 " : "❓ "}${prompt.text}`));
    const options = make("div", "chat-prompt-options");
    for (const option of prompt.options) {
      const button = make("button", "chat-prompt-option", option.label);
      button.type = "button";
      button.addEventListener("click", () => { void respondPrompt(agent.id, prompt, option); });
      options.appendChild(button);
    }
    card.appendChild(options);
    fragment.appendChild(card);
  }

  container.replaceChildren(fragment);
  if (nearBottom) requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

async function loadScreenChat(agentId, container, force = false) {
  const agent = agentMap().get(agentId);
  if (!agent || !container?.isConnected || container.dataset.screenChat !== agentId) return;
  const cached = screenChatCache.get(agentId);
  if (cached) renderScreenChat(container, cached.data, agent);
  if (!force && cached && Date.now() - cached.at < 3000) return;
  let pending = screenChatLoads.get(agentId);
  if (!pending) {
    pending = fetch(`/api/chat?id=${encodeURIComponent(agentId)}`, { credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({ blocks: [] }));
        return response.ok ? data : { blocks: [], error: true };
      })
      .catch(() => ({ blocks: [], error: true }))
      .finally(() => screenChatLoads.delete(agentId));
    screenChatLoads.set(agentId, pending);
  }
  const data = await pending;
  screenChatCache.set(agentId, { at: Date.now(), data });
  if (container.isConnected && container.dataset.screenChat === agentId) {
    renderScreenChat(container, data, agentMap().get(agentId));
  }
}

function syncScreenChats(screen = selectedScreen()) {
  if (!screen || selection.type !== "screen") return;
  for (const container of ui.screenLayout.querySelectorAll("[data-screen-chat]")) {
    if (isMobile() && !container.closest(".screen-leaf")?.classList.contains("mobile-pane-active")) continue;
    void loadScreenChat(container.dataset.screenChat, container);
  }
}

function updateScreenHeader(screen) {
  const activeId = activeScreenAgentId(screen);
  ui.screenOpenSession.hidden = !activeId;
  ui.screenOpenSession.dataset.agentId = activeId || "";
}

function updateScreenLive(screen) {
  const agentsById = agentMap();
  for (const panel of ui.screenLayout.querySelectorAll("[data-screen-agent]")) {
    const agent = agentsById.get(panel.dataset.screenAgent);
    if (!agent) continue;
    const status = statusOf(agent);
    const statusNode = panel.querySelector('[data-role="status"]');
    statusNode.className = `status-chip ${status}`;
    statusNode.textContent = STATUS[status].label;
    panel.querySelector('[data-role="meta"]').textContent = `${projectName(agent)} · ${toolName(agent)}`;
    const question = panel.querySelector('[data-role="question"]');
    question.textContent = questionOf(agent);
    question.hidden = !questionOf(agent);
    const output = panel.querySelector('[data-role="output"]');
    if (output) {
      const nextOutput = recentOutput(agent, 70) || "출력 대기 중…";
      if (output.textContent !== nextOutput) {
        const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 42;
        output.textContent = nextOutput;
        if (nearBottom) requestAnimationFrame(() => { output.scrollTop = output.scrollHeight; });
      }
    }
  }
  for (const tab of ui.screenLayout.querySelectorAll("[data-tab-agent]")) {
    const agent = agentsById.get(tab.dataset.tabAgent);
    const dot = tab.querySelector(".status-dot");
    if (agent && dot) dot.className = `status-dot ${statusOf(agent)}`;
  }
  updateScreenHeader(screen);
  syncScreenChats(screen);
}

function renderScreen() {
  const screen = selectedScreen();
  if (!screen) {
    selectMonitor();
    return;
  }
  ui.screenTitle.textContent = `Screen ${screen.number}`;
  ui.screenMeta.textContent = `${screen.leaves.length}개 패널 · ${screen.memberIds.length}개 세션 · ${screen.label}`;
  if (!screen.leaves.some((leaf) => leaf.id === mobilePaneId)) mobilePaneId = screen.leaves[0]?.id || null;
  renderScreenPaneTabs(screen);
  const nextKey = JSON.stringify([
    screen.id,
    screen.layout,
    [...leafTabSelection.entries()].filter(([key]) => key.startsWith(`${screen.id}:`)),
    [...screenPaneModes.entries()].filter(([key]) => key.startsWith(`${screen.id}:`)),
  ]);
  if (screenRenderKey !== nextKey) {
    screenRenderKey = nextKey;
    ui.screenLayout.replaceChildren(renderLayoutNode(screen.layout, screen));
  }
  updateMobilePaneVisibility();
  updateScreenLive(screen);
}

function renderSession() {
  const agent = selectedAgent();
  if (!agent) {
    selectMonitor();
    return;
  }
  const status = statusOf(agent);
  const question = questionDetails(agent);
  const prompt = text(agent.hook?.prompt);
  ui.detailStatus.className = `status-chip ${status}`;
  ui.detailStatus.textContent = STATUS[status].label;
  ui.detailName.textContent = text(agent.name || agent.id);
  ui.detailMeta.textContent = `${projectName(agent)} · ${toolName(agent)}`;
  if (ui.sessionOffline) ui.sessionOffline.hidden = status !== "offline";
  ui.questionPanel.hidden = !question.text;
  ui.questionText.textContent = question.text;
  const optionFragment = document.createDocumentFragment();
  for (const option of question.options) {
    const button = make("button", "question-option", option);
    button.type = "button";
    button.addEventListener("click", () => {
      ui.messageInput.value = option;
      resizeComposerInput();
      ui.messageInput.focus();
    });
    optionFragment.appendChild(button);
  }
  ui.questionOptions.replaceChildren(optionFragment);
  ui.promptPanel.hidden = !prompt;
  ui.promptText.textContent = prompt;
  // The live xterm owns the terminal area; only feed the fallback <pre> when
  // xterm is unavailable (very old browser).
  if (!terminalSupported) {
    const output = recentOutput(agent) || "출력 대기 중…";
    const nearBottom = ui.outputText.scrollHeight - ui.outputText.scrollTop - ui.outputText.clientHeight < 48;
    if (ui.outputText.textContent !== output) {
      ui.outputText.textContent = output;
      if (nearBottom) requestAnimationFrame(() => { ui.outputText.scrollTop = ui.outputText.scrollHeight; });
    }
  }
  const canReturn = returnScreenId && screenGroups().some((screen) => screen.id === returnScreenId);
  ui.backToScreenButton.hidden = !canReturn;
}

function documentInlineMarkdown(value) {
  const tokens = [];
  const stash = (html) => {
    const token = `\u0000DOC${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };
  let source = String(value ?? "");
  source = source.replace(/`([^`\n]+)`/g, (_match, code) => stash(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, href) => {
    const target = String(href).trim();
    if (/^https?:\/\//i.test(target)) {
      return stash(`<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && /\.(?:md|markdown|html|htm)(?:[#?].*)?$/i.test(target)) {
      return stash(`<a href="#" data-document-link="${escapeHtml(target)}">${escapeHtml(label)}</a>`);
    }
    return match;
  });
  let output = escapeHtml(source)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
  output = output.replace(/\u0000DOC(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
  return output;
}

function markdownTableCells(line) {
  const trimmed = String(line).trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isMarkdownTableDivider(line) {
  const cells = markdownTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function documentMarkdownToHtml(value) {
  const lines = String(value ?? "").split(/\r?\n/);
  const output = [];
  let listType = null;
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };
  const startsBlock = (index) => {
    const line = lines[index] || "";
    const next = lines[index + 1] || "";
    return !line.trim()
      || /^(```|~~~)/.test(line.trim())
      || /^(#{1,6})\s+/.test(line)
      || /^\s*([-*+]|\d+\.)\s+/.test(line)
      || /^\s*>\s?/.test(line)
      || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
      || (line.includes("|") && isMarkdownTableDivider(next));
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^(```|~~~)\s*([^\s]*)/);
    if (fence) {
      closeList();
      const marker = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(marker)) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[2] ? ` data-language="${escapeHtml(fence[2])}"` : "";
      output.push(`<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${documentInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      output.push("<hr>");
      index += 1;
      continue;
    }

    if (line.includes("|") && isMarkdownTableDivider(lines[index + 1] || "")) {
      closeList();
      const headers = markdownTableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(markdownTableCells(lines[index]));
        index += 1;
      }
      output.push("<table><thead><tr>");
      for (const header of headers) output.push(`<th>${documentInlineMarkdown(header)}</th>`);
      output.push("</tr></thead><tbody>");
      for (const row of rows) {
        output.push("<tr>");
        for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) {
          output.push(`<td>${documentInlineMarkdown(row[cellIndex] || "")}</td>`);
        }
        output.push("</tr>");
      }
      output.push("</tbody></table>");
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (unordered || ordered) {
      const nextListType = unordered ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        output.push(`<${listType}>`);
      }
      let item = (unordered || ordered)[1];
      const task = item.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        item = `<input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}> ${documentInlineMarkdown(task[2])}`;
      } else {
        item = documentInlineMarkdown(item);
      }
      output.push(`<li>${item}</li>`);
      index += 1;
      continue;
    }

    closeList();
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${quote.map(documentInlineMarkdown).join("<br>")}</blockquote>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !startsBlock(index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${documentInlineMarkdown(paragraph.join(" "))}</p>`);
  }
  closeList();
  return output.join("");
}

async function apiError(response) {
  try {
    const body = await response.json();
    return body.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function documentKey(projectId, relativePath) {
  return `${projectId}\u0000${relativePath}`;
}

function expandedDocumentFolders(projectId) {
  if (!documentExpandedFolders.has(projectId)) {
    documentExpandedFolders.set(projectId, new Set());
  }
  return documentExpandedFolders.get(projectId);
}

function documentFolderAncestors(relativePath) {
  const parts = String(relativePath || "").split("/").filter(Boolean);
  parts.pop();
  const ancestors = [];
  for (let index = 1; index <= parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors;
}

function expandDocumentParents(projectId, relativePath) {
  const expanded = expandedDocumentFolders(projectId);
  for (const folder of documentFolderAncestors(relativePath)) expanded.add(folder);
}

function buildDocumentTree(documents) {
  const root = { name: "", path: "", folders: new Map(), files: [], count: 0 };
  for (const file of documents) {
    const parts = String(file.path || "").split("/").filter(Boolean);
    if (!parts.length) continue;
    const fileName = parts.pop();
    let node = root;
    node.count += 1;
    const folderParts = [];
    for (const folderName of parts) {
      folderParts.push(folderName);
      if (!node.folders.has(folderName)) {
        node.folders.set(folderName, {
          name: folderName,
          path: folderParts.join("/"),
          folders: new Map(),
          files: [],
          count: 0,
        });
      }
      node = node.folders.get(folderName);
      node.count += 1;
    }
    node.files.push({ ...file, name: file.name || fileName });
  }
  return root;
}

function sortedDocumentFolders(node) {
  return [...node.folders.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

function sortedDocumentFiles(node) {
  return [...node.files].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

function appendDocumentTree(container, node, projectId, query, depth = 0) {
  const expanded = expandedDocumentFolders(projectId);
  for (const folder of sortedDocumentFolders(node)) {
    const isExpanded = Boolean(query) || expanded.has(folder.path);
    const wrapper = make("div", "document-tree-folder");
    const button = make("button", "document-folder-row");
    button.type = "button";
    button.style.setProperty("--tree-indent", `${depth * 14}px`);
    button.setAttribute("role", "treeitem");
    button.setAttribute("aria-expanded", String(isExpanded));
    button.title = folder.path;
    button.append(
      make("span", "document-folder-caret", isExpanded ? "▾" : "▸"),
      make("span", "document-folder-icon", "▰"),
      make("strong", "document-folder-name", folder.name),
      make("span", "document-folder-count", String(folder.count)),
    );
    button.addEventListener("click", () => {
      if (expanded.has(folder.path)) expanded.delete(folder.path);
      else expanded.add(folder.path);
      documentListRenderKey = "";
      renderDocuments();
    });
    wrapper.appendChild(button);
    if (isExpanded) {
      const children = make("div", "document-tree-children");
      children.setAttribute("role", "group");
      appendDocumentTree(children, folder, projectId, query, depth + 1);
      wrapper.appendChild(children);
    }
    container.appendChild(wrapper);
  }

  for (const file of sortedDocumentFiles(node)) {
    const button = make("button", "document-row document-tree-file");
    button.type = "button";
    button.dataset.kind = file.kind;
    button.style.setProperty("--tree-indent", `${depth * 14}px`);
    button.setAttribute("role", "treeitem");
    button.setAttribute("aria-selected", String(file.path === selectedDocumentPath));
    button.classList.toggle("selected", file.path === selectedDocumentPath);
    button.title = file.path;
    const icon = make("span", "document-row-icon", file.kind === "html" ? "HTML" : "MD");
    const copy = make("span", "document-row-copy");
    copy.append(make("strong", "", file.name), make("small", "", file.path));
    button.append(icon, copy);
    button.addEventListener("click", () => {
      selectedDocumentPath = file.path;
      expandDocumentParents(projectId, file.path);
      documentContent = null;
      documentContentKey = "";
      documentContentError = "";
      renderDocuments();
      updateUrl();
      void loadDocument(projectId, file.path);
    });
    container.appendChild(button);
  }
}

async function loadDocumentList(projectId, { force = false } = {}) {
  if (!projectId || (!force && documentLists.has(projectId))) return;
  if (documentListLoads.has(projectId)) return documentListLoads.get(projectId);
  if (force) documentLists.delete(projectId);
  const promise = (async () => {
    try {
      const query = new URLSearchParams({ projectId });
      const response = await fetch(`/api/docs?${query}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(await apiError(response));
      const result = await response.json();
      documentLists.set(projectId, {
        documents: Array.isArray(result.documents) ? result.documents : [],
        truncated: Boolean(result.truncated),
        error: "",
      });
      if (selection.type === "documents" && selection.id === projectId) {
        const documents = documentLists.get(projectId).documents;
        if (!documents.some((document) => document.path === selectedDocumentPath)) {
          selectedDocumentPath = documents[0]?.path || null;
          documentContent = null;
          documentContentKey = "";
        }
        if (selectedDocumentPath) expandDocumentParents(projectId, selectedDocumentPath);
      }
    } catch (error) {
      documentLists.set(projectId, { documents: [], truncated: false, error: error.message });
    } finally {
      documentListLoads.delete(projectId);
      if (selection.type === "documents" && selection.id === projectId) {
        renderDocuments();
        updateUrl();
      }
    }
  })();
  documentListLoads.set(projectId, promise);
  renderDocuments();
  return promise;
}

async function loadDocument(projectId, relativePath, { force = false } = {}) {
  if (!projectId || !relativePath) return;
  const key = documentKey(projectId, relativePath);
  if (!force && documentContentKey === key && (documentContent || documentContentError || documentContentLoading)) return;
  documentContentKey = key;
  documentContentLoading = true;
  documentContentError = "";
  if (force || documentContent?.path !== relativePath) documentContent = null;
  renderDocumentPreview();
  try {
    const query = new URLSearchParams({ projectId, path: relativePath });
    const response = await fetch(`/api/docs/read?${query}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiError(response));
    const result = await response.json();
    if (documentContentKey !== key) return;
    documentContent = result;
  } catch (error) {
    if (documentContentKey !== key) return;
    documentContent = null;
    documentContentError = error.message;
  } finally {
    if (documentContentKey === key) {
      documentContentLoading = false;
      renderDocumentPreview();
    }
  }
}

function renderDocumentPreview() {
  const relativePath = selectedDocumentPath;
  const key = relativePath && selection.type === "documents"
    ? documentKey(selection.id, relativePath)
    : "";
  ui.documentMarkdown.hidden = true;
  ui.documentHtml.hidden = true;
  ui.documentKind.hidden = true;

  if (!relativePath) {
    ui.documentName.textContent = "문서를 선택하세요";
    ui.documentPath.textContent = "";
    ui.documentMessage.hidden = false;
    ui.documentMessage.textContent = "왼쪽 목록에서 Markdown 또는 HTML 파일을 선택하세요.";
    return;
  }
  ui.documentName.textContent = relativePath.split("/").pop() || relativePath;
  ui.documentPath.textContent = relativePath;
  if (documentContentKey !== key || documentContentLoading) {
    ui.documentMessage.hidden = false;
    ui.documentMessage.textContent = "문서를 불러오는 중…";
    return;
  }
  if (documentContentError) {
    ui.documentMessage.hidden = false;
    ui.documentMessage.textContent = `문서를 열지 못했습니다: ${documentContentError}`;
    return;
  }
  if (!documentContent) {
    ui.documentMessage.hidden = false;
    ui.documentMessage.textContent = "문서를 불러오지 못했습니다.";
    return;
  }

  ui.documentMessage.hidden = true;
  ui.documentKind.hidden = false;
  ui.documentKind.textContent = documentContent.kind === "html" ? "HTML · SANDBOX" : "MARKDOWN";
  const renderKey = `${key}\u0000${documentContent.modifiedAt || ""}\u0000${documentContent.size || 0}`;
  if (documentContent.kind === "html") {
    ui.documentHtml.hidden = false;
    if (ui.documentHtml.dataset.renderKey !== renderKey) {
      ui.documentHtml.dataset.renderKey = renderKey;
      ui.documentHtml.srcdoc = documentContent.content || "";
    }
  } else {
    ui.documentMarkdown.hidden = false;
    if (ui.documentMarkdown.dataset.renderKey !== renderKey) {
      ui.documentMarkdown.dataset.renderKey = renderKey;
      ui.documentMarkdown.innerHTML = documentMarkdownToHtml(documentContent.content || "");
      ui.documentMarkdown.scrollTop = 0;
    }
  }
}

function renderDocuments() {
  const projects = localDocumentProjects();
  const projectsRenderKey = JSON.stringify(projects.map((project) => [project.id, project.name]));
  if (documentProjectsRenderKey !== projectsRenderKey) {
    documentProjectsRenderKey = projectsRenderKey;
    const optionFragment = document.createDocumentFragment();
    for (const project of projects) {
      const option = make("option", "", text(project.name || project.id));
      option.value = project.id;
      optionFragment.appendChild(option);
    }
    ui.documentProjectSelect.replaceChildren(optionFragment);
  }
  if (selection.type === "documents") ui.documentProjectSelect.value = selection.id;
  ui.documentProjectSelect.disabled = projects.length === 0;
  ui.refreshDocumentsButton.disabled = projects.length === 0;

  const project = projects.find((candidate) => candidate.id === selection.id);
  if (!project) {
    ui.documentListTitle.textContent = "문서";
    ui.documentListCount.textContent = "0";
    if (documentListRenderKey !== "no-project") {
      documentListRenderKey = "no-project";
      ui.documentList.replaceChildren();
    }
    ui.documentEmptyState.hidden = false;
    ui.documentEmptyState.textContent = projects.length
      ? "프로젝트를 선택하세요."
      : "Remote에서 볼 수 있는 로컬 프로젝트가 없습니다.";
    selectedDocumentPath = null;
    renderDocumentPreview();
    return;
  }

  ui.documentListTitle.textContent = text(project.name || project.id);
  const cached = documentLists.get(project.id);
  if (!cached) {
    const loadingKey = `loading:${project.id}`;
    if (documentListRenderKey !== loadingKey) {
      documentListRenderKey = loadingKey;
      ui.documentList.replaceChildren();
    }
    ui.documentListCount.textContent = "…";
    ui.documentEmptyState.hidden = false;
    ui.documentEmptyState.textContent = "문서 목록을 불러오는 중…";
    void loadDocumentList(project.id);
    renderDocumentPreview();
    return;
  }

  const query = ui.documentSearchInput.value.trim().toLowerCase();
  const visible = cached.documents.filter((document) => !query || document.path.toLowerCase().includes(query));
  ui.documentListCount.textContent = cached.truncated
    ? `${visible.length}/${cached.documents.length}+`
    : String(visible.length);
  const listRenderKey = JSON.stringify([
    project.id,
    query,
    selectedDocumentPath,
    cached.error,
    [...expandedDocumentFolders(project.id)].sort(),
    visible.map((document) => [document.path, document.kind]),
  ]);
  if (documentListRenderKey !== listRenderKey) {
    documentListRenderKey = listRenderKey;
    const fragment = document.createDocumentFragment();
    appendDocumentTree(fragment, buildDocumentTree(visible), project.id, query);
    ui.documentList.replaceChildren(fragment);
  }
  ui.documentEmptyState.hidden = visible.length > 0 && !cached.error;
  ui.documentEmptyState.textContent = cached.error
    ? `문서 목록을 불러오지 못했습니다: ${cached.error}`
    : (query ? "검색된 문서가 없습니다." : "Markdown 또는 HTML 문서가 없습니다.");
  renderDocumentPreview();
  if (selectedDocumentPath && documentContentKey !== documentKey(project.id, selectedDocumentPath)) {
    void loadDocument(project.id, selectedDocumentPath);
  }
}

function clampUsage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

function usageRemaining(value) {
  return 100 - clampUsage(value);
}

function formatUsagePercent(value) {
  const percent = clampUsage(value);
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
}

function formatRemainingPercent(value) {
  const percent = usageRemaining(value);
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
}

function formatUsageWindow(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "사용 한도";
  if (value === 10_080) return "주간 한도";
  if (value % 1_440 === 0) return `${value / 1_440}일 한도`;
  if (value % 60 === 0) return `${value / 60}시간 한도`;
  return `${value}분 한도`;
}

function formatUsageReset(resetsAt) {
  const seconds = Number(resetsAt);
  if (!Number.isFinite(seconds) || seconds <= 0) return "초기화 시간 미확인";
  const value = new Date(seconds * 1000);
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getMonth() + 1}/${value.getDate()} ${pad(value.getHours())}:${pad(value.getMinutes())} 초기화`;
}

function formatUsageUpdated(updatedAt) {
  const timestamp = Number(updatedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "아직 갱신되지 않음";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "방금 갱신";
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function usageProviderMeta(limit) {
  const id = text(limit?.limitId).toLowerCase();
  if (id === "codex" || id.startsWith("codex")) {
    return { key: "codex", label: "Codex", icon: "⬢", color: "#10a37f" };
  }
  if (id === "claude" || id.startsWith("claude")) {
    return { key: "claude", label: "Claude", icon: "✻", color: "#cc785c" };
  }
  if (id === "gemini" || id.startsWith("gemini")) {
    return { key: "gemini", label: "Gemini", icon: "✦", color: "#4796e3" };
  }
  return {
    key: id || "unknown",
    label: text(limit?.limitName || limit?.limitId) || "기타",
    icon: "•",
    color: "#8b949e",
  };
}

function usageGroups() {
  const groups = [];
  const byKey = new Map();
  for (const limit of Array.isArray(usageSummary?.limits) ? usageSummary.limits : []) {
    const meta = usageProviderMeta(limit);
    let group = byKey.get(meta.key);
    if (!group) {
      group = { ...meta, limits: [] };
      byKey.set(meta.key, group);
      groups.push(group);
    }
    group.limits.push(limit);
  }
  return groups;
}

function usageToneClass(remaining) {
  if (remaining <= 10) return "critical";
  if (remaining <= 30) return "warning";
  return "healthy";
}

function usageLimitName(limit, providerLabel) {
  const label = text(limit?.limitName || limit?.limitId);
  if (!label || label.toLowerCase() === providerLabel.toLowerCase()) return "기본 한도";
  if (label.toLowerCase().startsWith(`${providerLabel.toLowerCase()} `)) {
    return label.slice(providerLabel.length + 1);
  }
  return label;
}

function usageWindowCard(window, index) {
  const remaining = usageRemaining(window.usedPercent);
  const tone = usageToneClass(remaining);
  const card = make("div", `usage-window usage-tone-${tone}`);
  const heading = make("div", "usage-window-heading");
  heading.append(
    make("span", "", formatUsageWindow(window.windowMinutes)),
    make("strong", "", `${formatRemainingPercent(window.usedPercent)} 남음`),
  );
  const progress = make("span", "usage-remaining-progress");
  const fill = make("span", "usage-remaining-fill");
  fill.style.width = `${remaining}%`;
  progress.appendChild(fill);
  const meta = make("div", "usage-window-meta");
  meta.append(
    make("span", "", `${formatUsagePercent(window.usedPercent)} 사용`),
    make("span", "", formatUsageReset(window.resetsAt)),
  );
  card.dataset.window = String(index);
  card.append(heading, progress, meta);
  return card;
}

function renderUsage() {
  const groups = usageGroups();
  const windows = groups.flatMap((group) => group.limits.flatMap((limit) => (
    [limit?.primary, limit?.secondary].filter((window) => (
      window && Number.isFinite(Number(window.usedPercent))
    ))
  )));
  const remaining = windows.length > 0
    ? Math.min(...windows.map((window) => usageRemaining(window.usedPercent)))
    : null;
  const updatedAt = Math.max(
    Number(usageSummary?.updatedAt) || 0,
    ...groups.flatMap((group) => group.limits.map((limit) => Number(limit?.updatedAt) || 0)),
  );
  ui.usageProviderCount.textContent = String(groups.length);
  ui.usageProviderSummary.textContent = String(groups.length);
  ui.usageRemainingSummary.textContent = remaining == null
    ? "—"
    : `${remaining >= 10 ? Math.round(remaining) : Math.round(remaining * 10) / 10}%`;
  ui.usageRemainingSummary.className = remaining == null
    ? ""
    : `usage-summary-${usageToneClass(remaining)}`;
  ui.usageUpdatedSummary.textContent = formatUsageUpdated(updatedAt);
  ui.refreshUsageButton.disabled = usageLoading;
  ui.refreshUsageButton.textContent = usageRefreshing ? "갱신 중…" : "새로고침";

  if (usageError) {
    ui.usageMessage.hidden = false;
    ui.usageMessage.dataset.state = "error";
    ui.usageMessage.textContent = `사용량을 불러오지 못했습니다: ${usageError}`;
  } else if (usageLoading && !usageSummary) {
    ui.usageMessage.hidden = false;
    ui.usageMessage.dataset.state = "loading";
    ui.usageMessage.textContent = "Codex·Claude 사용량을 확인하고 있습니다.";
  } else if (groups.length === 0) {
    ui.usageMessage.hidden = false;
    ui.usageMessage.dataset.state = "empty";
    ui.usageMessage.textContent = "사용량 정보가 아직 없습니다. Codex 또는 Claude 세션을 실행한 뒤 새로고침하세요.";
  } else {
    ui.usageMessage.hidden = true;
    delete ui.usageMessage.dataset.state;
  }

  const fragment = document.createDocumentFragment();
  for (const provider of groups) {
    const card = make("section", "usage-provider-card");
    card.dataset.provider = provider.key;
    const header = make("div", "usage-provider-heading");
    const identity = make("div", "usage-provider-identity");
    const icon = make("span", "usage-provider-icon", provider.icon);
    icon.style.color = provider.color;
    const title = make("div");
    title.append(make("strong", "", provider.label));
    const plan = provider.limits.find((limit) => text(limit?.planType))?.planType;
    if (plan) title.append(make("span", "", text(plan)));
    identity.append(icon, title);
    const providerUpdated = Math.max(
      ...provider.limits.map((limit) => Number(limit?.updatedAt) || 0),
    );
    header.append(identity, make("span", "usage-provider-updated", formatUsageUpdated(providerUpdated)));

    const limitList = make("div", "usage-limit-list");
    for (const limit of provider.limits) {
      const limitCard = make("article", "usage-limit-card");
      limitCard.appendChild(make("strong", "usage-limit-name", usageLimitName(limit, provider.label)));
      const limitWindows = [limit?.primary, limit?.secondary].filter((window) => (
        window && Number.isFinite(Number(window.usedPercent))
      ));
      const windowGrid = make("div", "usage-window-grid");
      limitWindows.forEach((window, index) => windowGrid.appendChild(usageWindowCard(window, index)));
      limitCard.appendChild(windowGrid);
      if (limit?.credits?.unlimited || limit?.credits?.hasCredits) {
        limitCard.appendChild(make(
          "p",
          "usage-credit",
          limit.credits.unlimited
            ? "추가 사용량 무제한"
            : `추가 사용량 ${text(limit.credits.balance) || "확인 가능"}`,
        ));
      }
      limitList.appendChild(limitCard);
    }
    card.append(header, limitList);
    fragment.appendChild(card);
  }
  ui.usageProviderGrid.replaceChildren(fragment);
}

async function loadUsage(refresh = false) {
  if (usageLoading) return;
  usageLoadAttempted = true;
  usageLoading = true;
  usageRefreshing = refresh;
  usageError = "";
  renderUsage();
  try {
    const response = await fetch(`/api/usage${refresh ? "?refresh=1" : ""}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 401 || response.status === 403) {
      location.reload();
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(text(result?.error) || `HTTP ${response.status}`);
    usageSummary = {
      updatedAt: Number(result?.updatedAt) || 0,
      limits: Array.isArray(result?.limits) ? result.limits : [],
    };
    usageLoadedAt = Date.now();
  } catch (error) {
    usageError = error instanceof Error ? error.message : String(error);
  } finally {
    usageLoading = false;
    usageRefreshing = false;
    renderUsage();
  }
}

function renderSelection() {
  ui.appShell.dataset.view = selection.type;
  document.documentElement.classList.toggle(
    "remote-workspace-locked",
    ["screen", "session", "documents", "usage"].includes(selection.type),
  );
  ui.monitorView.hidden = selection.type !== "monitor";
  ui.screenView.hidden = selection.type !== "screen";
  ui.documentsView.hidden = selection.type !== "documents";
  ui.usageView.hidden = selection.type !== "usage";
  ui.sessionView.hidden = selection.type !== "session";
  if (selection.type === "monitor") renderMonitor();
  if (selection.type === "screen") renderScreen();
  if (selection.type === "documents") renderDocuments();
  if (selection.type === "usage") {
    renderUsage();
    if (!usageLoadAttempted) void loadUsage(true);
  }
  if (selection.type === "session") renderSession();
  syncTerminal();
  syncSessionView();
  ui.overviewButton.classList.toggle("selected", selection.type === "monitor");
  ui.documentsButton.classList.toggle("selected", selection.type === "documents");
  ui.usageButton.classList.toggle("selected", selection.type === "usage");
  ui.mobileMonitorButton.classList.toggle("active", selection.type === "monitor");
  ui.mobileSessionsButton.classList.toggle("active", ["screen", "session"].includes(selection.type));
  ui.mobileDocumentsButton.classList.toggle("active", selection.type === "documents");
  ui.mobileUsageButton.classList.toggle("active", selection.type === "usage");
  for (const button of document.querySelectorAll(".mobile-nav button")) {
    if (button.classList.contains("active")) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function closeSidebar() {
  ui.navigationPane.classList.remove("open");
  ui.sidebarBackdrop.classList.remove("visible");
  updateSidebarToggleState();
}

function openSidebar(section) {
  ui.navigationPane.classList.add("open");
  ui.sidebarBackdrop.classList.add("visible");
  updateSidebarToggleState();
  requestAnimationFrame(() => section?.scrollIntoView({ block: "start" }));
}

function selectMonitor(filter = activeFilter) {
  setActiveFilter(filter);
  selection = defaultWorkspaceSelection();
  returnScreenId = selection.type === "screen" ? selection.id : null;
  mobilePaneId = null;
  screenRenderKey = "";
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
}

function selectScreen(id) {
  if (!screenGroups().some((screen) => screen.id === id)) return;
  selection = { type: "screen", id };
  returnScreenId = id;
  mobilePaneId = null;
  screenRenderKey = "";
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
}

function selectSession(id, fromScreenId = null) {
  if (!agentMap().has(id)) return;
  selection = { type: "session", id };
  returnScreenId = fromScreenId;
  if (!isMobile() && compactWorkspaceMedia.matches) applyNavCollapsed(true);
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
}

function selectDocuments(projectId = null) {
  const projects = localDocumentProjects();
  const id = projects.some((project) => project.id === projectId)
    ? projectId
    : projects[0]?.id;
  if (!id) {
    showToast("Remote에서 볼 수 있는 로컬 프로젝트가 없습니다.");
    return;
  }
  const projectChanged = selection.type !== "documents" || selection.id !== id;
  selection = { type: "documents", id };
  returnScreenId = null;
  if (projectChanged) {
    selectedDocumentPath = null;
    documentContent = null;
    documentContentKey = "";
    documentContentError = "";
  }
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
}

function selectUsage() {
  selection = { type: "usage", id: null };
  returnScreenId = null;
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
  if (!usageLoading && (!usageSummary || Date.now() - usageLoadedAt >= 60_000)) {
    void loadUsage(true);
  }
}

async function sendInput(agentId, message) {
  const text = message.trim();
  if (!agentId || !text) return false;
  // Type the text, then send Enter as a SEPARATE write. Claude/Codex TUIs treat
  // a "text\r" arriving in one chunk as a multi-line paste (newline inserted,
  // not submitted); a discrete \r a beat later registers as the Enter keypress.
  if (!(await sendRaw(agentId, text))) return false;
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (!(await sendRaw(agentId, "\r"))) return false;
  showToast("전송했습니다.");
  return true;
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const ACCEPTED_ATTACHMENT_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);
const ATTACHMENT_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/bmp", "bmp"],
]);

function currentAttachments() {
  const agent = selectedAgent();
  if (!agent) return [];
  if (!attachmentDrafts.has(agent.id)) attachmentDrafts.set(agent.id, []);
  return attachmentDrafts.get(agent.id);
}

function updateComposerSendState() {
  const agent = selectedAgent();
  const attachments = currentAttachments();
  const hasMessage = Boolean(ui.messageInput.value.trim());
  const hasReadyAttachment = attachments.some((attachment) => attachment.path && !attachment.error);
  const uploading = attachments.some((attachment) => attachment.uploading);
  const inactiveTerminal = Boolean(
    agent && ["offline", "recovering", "starting"].includes(statusOf(agent)) && sessionViewMode === "term"
  );
  const initializingTerminal = Boolean(
    agent && ["recovering", "starting"].includes(statusOf(agent)) && sessionViewMode === "term"
  );
  ui.messageInput.disabled = inactiveTerminal;
  ui.messageInput.placeholder = inactiveTerminal
    ? initializingTerminal
      ? "세션 초기화가 끝나면 입력할 수 있습니다"
      : "비활성 세션은 채팅 모드에서 활성화할 수 있습니다"
    : "메시지 입력";
  ui.sendButton.disabled = inactiveTerminal || uploading || (!hasMessage && !hasReadyAttachment);
  ui.attachmentButton.disabled = inactiveTerminal || !agent || Boolean(agent.sshHostId) || attachments.length >= MAX_ATTACHMENTS;
  ui.attachmentButton.title = agent?.sshHostId
    ? "SSH 세션은 이미지 첨부를 지원하지 않습니다"
    : inactiveTerminal
      ? initializingTerminal
        ? "세션 초기화가 끝나면 첨부할 수 있습니다"
        : "비활성 세션은 채팅 모드에서 활성화할 수 있습니다"
    : "이미지 첨부 · 클립보드 붙여넣기 · 드래그 앤 드롭 지원";
}

function resizeComposerInput() {
  const input = ui.messageInput;
  if (!input) return;
  input.style.height = "auto";
  const styles = getComputedStyle(input);
  const minHeight = Number.parseFloat(styles.minHeight) || 42;
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 700;
  const fallbackMaxHeight = isMobile()
    ? Math.min(180, viewportHeight * 0.32)
    : Math.min(220, viewportHeight * 0.34);
  const maxHeight = Number.parseFloat(styles.maxHeight) || fallbackMaxHeight;
  const borderHeight = (Number.parseFloat(styles.borderTopWidth) || 0)
    + (Number.parseFloat(styles.borderBottomWidth) || 0);
  const contentHeight = Math.max(input.scrollHeight + borderHeight, minHeight);
  const nextHeight = Math.min(contentHeight, maxHeight);
  input.style.height = `${Math.ceil(nextHeight)}px`;
  input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

function renderComposerAttachments() {
  const attachments = currentAttachments();
  ui.composerAttachments.replaceChildren();
  ui.composerAttachments.hidden = attachments.length === 0;
  attachments.forEach((attachment) => {
    const item = make("div", `composer-attachment${attachment.error ? " error" : ""}`);
    const image = document.createElement("img");
    if (attachment.preview) image.src = attachment.preview;
    else image.hidden = true;
    image.alt = "";
    const meta = make("span", "composer-attachment-name", attachment.uploading
      ? `${attachment.name} · 업로드 중`
      : attachment.error
        ? `${attachment.name} · 실패`
        : attachment.name);
    const remove = make("button", "composer-attachment-remove", "×");
    remove.type = "button";
    remove.title = "첨부 제거";
    remove.setAttribute("aria-label", `${attachment.name} 첨부 제거`);
    remove.addEventListener("click", () => {
      const draft = currentAttachments();
      const index = draft.findIndex((candidate) => candidate.token === attachment.token);
      if (index >= 0) {
        URL.revokeObjectURL(draft[index].preview);
        draft.splice(index, 1);
      }
      renderComposerAttachments();
    });
    item.append(image, meta, remove);
    ui.composerAttachments.appendChild(item);
  });
  updateComposerSendState();
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("파일을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

async function uploadAttachment(agentId, attachment, file) {
  try {
    const data = await readFileDataUrl(file);
    const response = await fetch("/api/attachment", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agentId, name: attachment.name, type: file.type, data }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    attachment.path = result.path;
    attachment.uploading = false;
  } catch (error) {
    attachment.uploading = false;
    attachment.error = error.message || "업로드하지 못했습니다.";
    showToast(`이미지 첨부 실패: ${attachment.error}`);
  }
  renderComposerAttachments();
}

function attachmentFileName(file, source, index) {
  const name = String(file?.name || "").trim();
  if (name) return name;
  const extension = ATTACHMENT_EXTENSIONS.get(file?.type) || "png";
  return source === "clipboard"
    ? `clipboard-image-${Date.now()}-${index + 1}.${extension}`
    : `image-${Date.now()}-${index + 1}.${extension}`;
}

function addAttachments(files, { source = "picker" } = {}) {
  const agent = selectedAgent();
  if (!agent) {
    showToast("세션을 먼저 선택하세요.");
    return 0;
  }
  if (agent.sshHostId) {
    showToast("SSH 세션에는 로컬 이미지를 첨부할 수 없습니다.");
    return 0;
  }
  if (
    sessionViewMode === "term" &&
    ["offline", "recovering", "starting"].includes(statusOf(agent))
  ) {
    showToast("세션이 활성화된 뒤 이미지를 첨부할 수 있습니다.");
    return 0;
  }
  const draft = currentAttachments();
  let added = 0;
  for (const [index, file] of files.entries()) {
    if (draft.length >= MAX_ATTACHMENTS) {
      showToast(`이미지는 최대 ${MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
      break;
    }
    if (!ACCEPTED_ATTACHMENT_TYPES.has(file.type)) {
      showToast(`${file.name}: 지원하지 않는 이미지 형식입니다.`);
      continue;
    }
    if (!file.size || file.size > MAX_ATTACHMENT_BYTES) {
      showToast(`${file.name}: 이미지는 8MB 이하여야 합니다.`);
      continue;
    }
    const attachment = {
      token: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: attachmentFileName(file, source, index),
      preview: URL.createObjectURL(file),
      path: "",
      uploading: true,
      error: "",
    };
    draft.push(attachment);
    added += 1;
    void uploadAttachment(agent.id, attachment, file);
  }
  renderComposerAttachments();
  return added;
}

function clipboardImageFiles(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return [];
  const itemFiles = Array.from(clipboard.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file && ACCEPTED_ATTACHMENT_TYPES.has(file.type));
  if (itemFiles.length) return itemFiles;
  return Array.from(clipboard.files || [])
    .filter((file) => ACCEPTED_ATTACHMENT_TYPES.has(file.type));
}

function handleComposerImagePaste(event) {
  const files = clipboardImageFiles(event);
  if (!files.length) return;
  event.preventDefault();
  const added = addAttachments(files, { source: "clipboard" });
  if (added > 0) showToast(`클립보드 이미지 ${added}개를 첨부했습니다.`);
}

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function clearComposerDragState() {
  ui.composerForm.classList.remove("drag-active");
}

function handleComposerImageDragEnter(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  ui.composerForm.classList.add("drag-active");
}

function handleComposerImageDragOver(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  ui.composerForm.classList.add("drag-active");
}

function handleComposerImageDragLeave(event) {
  if (!ui.composerForm.contains(event.relatedTarget)) clearComposerDragState();
}

function handleComposerImageDrop(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  clearComposerDragState();
  const added = addAttachments(files, { source: "drop" });
  if (added > 0) showToast(`드롭한 이미지 ${added}개를 첨부했습니다.`);
}

function attachmentMessage(message, attachments) {
  const paths = attachments
    .filter((attachment) => attachment.path && !attachment.error)
    .map((attachment) => `"${String(attachment.path).replaceAll('"', '\\"')}"`);
  return [message, paths.length ? `첨부 이미지:\n${paths.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

async function sendRaw(agentId, data) {
  if (!agentId || !data) return false;
  try {
    const response = await fetch("/api/input", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agentId, data }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    setTimeout(() => fetchState({ quiet: true }), 250);
    return true;
  } catch (error) {
    showToast(`전송 실패: ${error.message}`);
    return false;
  }
}

async function cancelSession(agentId) {
  if (!agentId) return false;
  try {
    const response = await fetch("/api/session/cancel", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agentId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    // The endpoint also emits a synthetic cancelled hook. Optimistically mark
    // the transcript idle so the composer queue is usable before the next
    // state/chat refresh reaches this client.
    if (selection.type === "session" && selection.id === agentId && lastChatData) {
      lastChatData = { ...lastChatData, lifecycle: "idle" };
      renderChat(lastChatData);
    }
    const cached = screenChatCache.get(agentId);
    if (cached) {
      screenChatCache.set(agentId, {
        ...cached,
        data: { ...cached.data, lifecycle: "idle" },
      });
    }
    showToast("작업을 취소하고 대기 상태로 전환했습니다.");
    await fetchState({ quiet: true });
    return true;
  } catch (error) {
    showToast(`취소 실패: ${error.message}`);
    return false;
  }
}

// ---- Message queue ----
// While the agent is working, composer sends are reserved in a queue and
// drained one at a time once it's ready for input (with a cooldown so a send
// doesn't fire during the brief lag before "working" registers). Items can be
// cancelled before they go out. The queue is tied to the selected agent.
const QUEUE_COOLDOWN_MS = 1200;
const SESSION_ACTIVATION_TIMEOUT_MS = 30_000;
const messageQueue = [];
let queueAgentId = null;
let lastSendAt = 0;
const sessionActivationDeadlines = new Map();

// Busy only when the hook says "working" AND the transcript's last turn isn't
// finished — so a stale/stuck "working" hook doesn't trap queued messages.
const agentBusy = (agent) => statusOf(agent) === "working" && lastChatData?.lifecycle !== "idle";
const agentInitializing = (agent) => ["recovering", "starting"].includes(statusOf(agent));
const agentReady = (agent) => !agentBusy(agent) && !agentInitializing(agent) && !["offline", "unreachable"].includes(statusOf(agent));

function renderComposerQueue() {
  const el = ui.composerQueue;
  if (!el) return;
  el.replaceChildren();
  if (!messageQueue.length) { el.hidden = true; return; }
  el.hidden = false;
  el.appendChild(make("div", "composer-queue-head", `예약 대기열 ${messageQueue.length} · 대기 상태가 되면 순서대로 전송`));
  messageQueue.forEach((message, index) => {
    const row = make("div", "composer-queue-item");
    row.appendChild(make("span", "composer-queue-text", message));
    const cancel = make("button", "composer-queue-cancel", "×");
    cancel.type = "button";
    cancel.title = "예약 취소";
    cancel.addEventListener("click", () => { messageQueue.splice(index, 1); renderComposerQueue(); });
    row.appendChild(cancel);
    el.appendChild(row);
  });
}

// Drop the queue when the selection moves to a different session.
function syncQueueAgent(agent) {
  if (queueAgentId && agent?.id !== queueAgentId) {
    sessionActivationDeadlines.delete(queueAgentId);
    messageQueue.length = 0;
    queueAgentId = agent?.id ?? null;
    renderComposerQueue();
  }
}

async function drainQueue() {
  if (!messageQueue.length) return;
  const agent = selectedAgent();
  if (!agent || agent.id !== queueAgentId) return;
  const activationDeadline = sessionActivationDeadlines.get(agent.id);
  if (activationDeadline && Date.now() >= activationDeadline) {
    sessionActivationDeadlines.delete(agent.id);
    messageQueue.length = 0;
    renderComposerQueue();
    showToast("세션을 활성화하지 못해 예약 메시지를 취소했습니다.");
    return;
  }
  if (statusOf(agent) === "offline") {
    return;
  }
  if (agentInitializing(agent)) return;
  if (agentBusy(agent) || !agentReady(agent)) return;
  if (Date.now() - lastSendAt < QUEUE_COOLDOWN_MS) return;
  const next = messageQueue[0];
  lastSendAt = Date.now();
  const sent = await sendInput(agent.id, next);
  if (!sent) return;
  messageQueue.shift();
  if (activationDeadline) sessionActivationDeadlines.delete(agent.id);
  renderComposerQueue();
  lastChatFetch = { id: null, at: 0 }; // pull the sent turn into the chat quickly
}

async function requestSessionActivation(agentId, { queuedMessage = false } = {}) {
  if (!agentId) return false;
  const existingDeadline = sessionActivationDeadlines.get(agentId);
  if (existingDeadline && existingDeadline > Date.now()) return true;
  try {
    const response = await fetch("/api/session/restart", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agentId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    sessionActivationDeadlines.set(agentId, Date.now() + SESSION_ACTIVATION_TIMEOUT_MS);
    showToast(queuedMessage
      ? "세션 활성화 중 — 준비되면 메시지를 자동 전송합니다."
      : "세션을 활성화하고 있습니다.");
    setTimeout(() => fetchState({ quiet: true }), 500);
    return true;
  } catch (error) {
    showToast(`세션 활성화 실패: ${error.message}`);
    return false;
  }
}

async function waitForSessionReady(agentId) {
  const deadline = sessionActivationDeadlines.get(agentId)
    || Date.now() + SESSION_ACTIVATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const agent = agentMap().get(agentId);
    const initializing = agent && agentInitializing(agent);
    if (agent && statusOf(agent) !== "offline" && !initializing) {
      sessionActivationDeadlines.delete(agentId);
      await new Promise((resolve) => setTimeout(resolve, 350));
      return true;
    }
    await fetchState({ quiet: true });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  sessionActivationDeadlines.delete(agentId);
  return false;
}

async function sendSelectedMessage() {
  const agent = selectedAgent();
  const message = ui.messageInput.value.trim();
  const attachments = currentAttachments();
  if (!agent || attachments.some((attachment) => attachment.uploading)) return;
  const outgoing = attachmentMessage(message, attachments);
  if (!outgoing) return;
  const inactive = statusOf(agent) === "offline";
  if (inactive && sessionViewMode !== "chat") {
    showToast("비활성 세션에는 채팅 모드에서만 메시지를 보낼 수 있습니다.");
    return;
  }
  if (inactive && !(await requestSessionActivation(agent.id, { queuedMessage: true }))) {
    return;
  }
  if (queueAgentId !== agent.id) { messageQueue.length = 0; queueAgentId = agent.id; }
  ui.messageInput.value = "";
  resizeComposerInput();
  attachments.forEach((attachment) => URL.revokeObjectURL(attachment.preview));
  attachmentDrafts.delete(agent.id);
  renderComposerAttachments();
  if (inactive) {
    messageQueue.push(outgoing);
    renderComposerQueue();
    return;
  }
  const cooled = Date.now() - lastSendAt >= QUEUE_COOLDOWN_MS;
  if (agentReady(agent) && !agentBusy(agent) && messageQueue.length === 0 && cooled) {
    ui.sendButton.disabled = true;
    lastSendAt = Date.now();
    await sendInput(agent.id, outgoing);
    lastChatFetch = { id: null, at: 0 };
    updateComposerSendState();
  } else {
    messageQueue.push(outgoing);
    renderComposerQueue();
    showToast("작업 중 — 대기열에 예약했습니다.");
  }
}

// ---- Live terminals (xterm) ----
// Each visible pane gets its own xterm mirroring the desktop terminal: raw PTY
// output streams in over SSE and every keystroke goes straight back to the PTY.
// The PTY size is authoritative — we never resize it, since the desktop views
// the same session. The single session view has one terminal; desktop Screen
// mode runs one per pane, while mobile streams only its selected pane.
const terminalSupported = typeof window.Terminal === "function";
const mobileMedia = window.matchMedia("(max-width: 800px)");
const isMobile = () => mobileMedia.matches;
// container element -> { term, stream, agentId }
const terminals = new Map();

// Show the live terminal when xterm is available; otherwise keep the plain text
// fallback so old browsers still see (sanitized) output.
if (ui.outputText) ui.outputText.hidden = terminalSupported;
if (ui.terminalMount) ui.terminalMount.hidden = !terminalSupported;

// ---- Terminal hyperlinks (OSC 8 + visible URLs) ----
// xterm renders OSC 8 hyperlinks natively; linkHandler opens them. But Codex's
// TUI turns on mouse tracking, so plain clicks get reported to the app and the
// link never activates. To match a real terminal we also hit-test the URL under
// the pointer ourselves (reconstructing wrapped logical lines) and open it in a
// capture-phase handler that stops the click before mouse reporting eats it.
const CJK_URL_STOP =
  "\\u1100-\\u11FF\\u2E80-\\uA4CF\\uAC00-\\uD7A3\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFFEF\\u3000-\\u303F\\u3040-\\u30FF";
const URL_RE = new RegExp(
  `(https?):\\/\\/[^\\s"'!*(){}|\\\\^<>\`${CJK_URL_STOP}]*[^\\s"':,.!?{}|\\\\^~\\[\\]\`()<>${CJK_URL_STOP}]`,
  "gi"
);

function openExternalUrl(uri) {
  const target = String(uri || "").trim();
  if (!target) return;
  window.open(target, "_blank", "noopener,noreferrer");
}

function logicalLineAt(term, rowIndex) {
  const buffer = term.buffer.active;
  if (!buffer.getLine(rowIndex)) return null;
  let start = rowIndex;
  let guard = 0;
  while (start > 0 && guard < 512 && buffer.getLine(start)?.isWrapped) { start -= 1; guard += 1; }
  const cols = term.cols;
  let text = "";
  const cellMap = [];
  guard = 0;
  for (let r = start; r < buffer.length && guard < 512; r += 1, guard += 1) {
    const line = buffer.getLine(r);
    if (!line) break;
    if (r !== start && !line.isWrapped) break;
    for (let c = 0; c < cols; c += 1) {
      const cell = line.getCell(c);
      if (!cell) continue;
      const width = cell.getWidth();
      if (width === 0) continue;
      const chars = cell.getChars() || " ";
      for (let i = 0; i < chars.length; i += 1) cellMap.push({ row: r, col: c, width });
      text += chars;
    }
  }
  return { text: text.replace(/\s+$/, ""), cellMap };
}

function cellFromEvent(term, event) {
  const screen = term.element?.querySelector(".xterm-screen");
  if (!screen || term.cols < 1 || term.rows < 1) return null;
  const rect = screen.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const style = window.getComputedStyle(screen);
  const padL = parseInt(style.paddingLeft, 10) || 0;
  const padT = parseInt(style.paddingTop, 10) || 0;
  const cw = rect.width - padL - (parseInt(style.paddingRight, 10) || 0);
  const ch = rect.height - padT - (parseInt(style.paddingBottom, 10) || 0);
  if (cw <= 0 || ch <= 0) return null;
  const x = event.clientX - rect.left - padL;
  const y = event.clientY - rect.top - padT;
  if (x < 0 || y < 0 || x > cw || y > ch) return null;
  const col = Math.min(term.cols - 1, Math.max(0, Math.ceil(x / (cw / term.cols)) - 1));
  const vrow = Math.min(term.rows - 1, Math.max(0, Math.ceil(y / (ch / term.rows)) - 1));
  return { row: term.buffer.active.viewportY + vrow, col };
}

function urlAtEvent(term, event) {
  const hit = cellFromEvent(term, event);
  if (!hit) return null;
  const logical = logicalLineAt(term, hit.row);
  if (!logical) return null;
  const { text, cellMap } = logical;
  URL_RE.lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(text))) {
    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      const ref = cellMap[i];
      if (ref && ref.row === hit.row && hit.col >= ref.col && hit.col < ref.col + ref.width) {
        return match[0];
      }
    }
  }
  return null;
}

function buildTerminal(container, fontSize) {
  const term = new window.Terminal({
    cursorBlink: true,
    fontFamily: '"Cascadia Mono", "Consolas", ui-monospace, monospace',
    fontSize,
    scrollback: 6000,
    convertEol: false,
    theme: { background: "#050d14", foreground: "#cbd8e2", cursor: "#50dfd0" },
    // Opens OSC 8 hyperlinks (label-style links whose URL is hidden in the
    // escape sequence) that xterm detects natively.
    linkHandler: { activate: (_event, uri) => openExternalUrl(uri), allowNonHttpProtocols: false },
  });
  term.open(container);
  const instance = {
    term,
    stream: null,
    agentId: null,
    disposeTouchScroll: null,
  };
  term.onData((data) => {
    if (!instance.agentId) return;
    const agent = agentMap().get(instance.agentId);
    if (!agent || ["offline", "recovering", "starting"].includes(statusOf(agent))) return;
    void sendRaw(instance.agentId, data);
  });
  instance.disposeTouchScroll =
    globalThis.MultiAgentTerminalTouch?.install(container, instance, sendRaw) ||
    null;

  // Visible-URL links: intercept before xterm's mouse reporting so a tap/click
  // on a URL opens it even while Codex has mouse tracking on. mousedown/mouseup
  // stop the report; the actual open happens on mouseup (a real click, not a drag).
  const stopEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  let pendingUrl = null;
  container.addEventListener("mousedown", (event) => {
    pendingUrl = null;
    if (event.button !== 0 || event.detail > 1 || event.shiftKey) return;
    const url = urlAtEvent(term, event);
    if (!url) return;
    pendingUrl = url;
    stopEvent(event);
  }, { capture: true });
  container.addEventListener("mouseup", (event) => {
    if (!pendingUrl) return;
    const url = pendingUrl;
    pendingUrl = null;
    stopEvent(event);
    if (urlAtEvent(term, event) === url) openExternalUrl(url);
  }, { capture: true });
  container.addEventListener("click", (event) => {
    if (urlAtEvent(term, event)) stopEvent(event);
  }, { capture: true });

  terminals.set(container, instance);
  return instance;
}

function closeStream(instance) {
  if (instance.stream) { instance.stream.close(); instance.stream = null; }
  instance.agentId = null;
}

function attachTerminal(container, agentId, fontSize = 13) {
  if (!terminalSupported || !container || !agentId) return null;
  const instance = terminals.get(container) || buildTerminal(container, fontSize);
  if (instance.agentId === agentId && instance.stream && instance.stream.readyState !== EventSource.CLOSED) {
    return instance;
  }
  closeStream(instance);
  instance.agentId = agentId;
  const stream = new EventSource(`/api/stream?id=${encodeURIComponent(agentId)}`);
  instance.stream = stream;
  stream.addEventListener("reset", (event) => {
    if (instance.stream !== stream) return;
    const payload = JSON.parse(event.data);
    instance.term.reset();
    if (payload.cols && payload.rows) {
      try { instance.term.resize(payload.cols, payload.rows); } catch { /* keep default size */ }
    }
    if (payload.data) instance.term.write(payload.data);
    requestAnimationFrame(() => refitTerminal(instance, container));
  });
  stream.onmessage = (event) => {
    if (instance.stream !== stream) return;
    const payload = JSON.parse(event.data);
    if (payload.data) instance.term.write(payload.data);
  };
  stream.addEventListener("exit", () => {
    if (instance.stream !== stream) return;
    instance.term.write("\r\n\x1b[2m— 세션이 종료되었습니다 —\x1b[0m\r\n");
  });
  // EventSource auto-reconnects on transient errors; the server replays a fresh
  // reset on each new connection, so the terminal re-syncs without extra code.
  return instance;
}

function releaseTerminal(container) {
  const instance = terminals.get(container);
  if (!instance) return;
  closeStream(instance);
  instance.disposeTouchScroll?.();
  try { instance.term.dispose(); } catch { /* already disposed */ }
  terminals.delete(container);
}

function terminalBufferText(instance) {
  if (!instance?.term) return "";
  const buffer = instance.term.buffer.active;
  const lines = [];
  for (let i = 0; i < buffer.length; i += 1) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
  }
  return lines.join("\n").replace(/\s+$/, "");
}

// The terminal mirrors the desktop PTY's rows and columns, which are wider and
// taller than a phone viewport. Fit both axes so mobile starts at the top-left
// but still includes the bottom row; pinch to zoom for detail. PC panes large
// enough for the PTY keep the natural 1:1 render.
function refitTerminal(instance, container) {
  const element = instance?.term?.element;
  if (!element || !container) return;
  element.style.transformOrigin = "top left";
  element.style.transform = "";
  container.style.height = "";
  const screen = element.querySelector(".xterm-screen");
  const naturalWidth = screen?.offsetWidth || element.offsetWidth;
  const naturalHeight = screen?.offsetHeight || element.offsetHeight;
  const availableWidth = container.clientWidth;
  const availableHeight = container.clientHeight;
  if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) return;
  const scale = Math.min(
    1,
    availableWidth / naturalWidth,
    availableHeight / naturalHeight
  );
  if (scale < 1) {
    element.style.transform = `scale(${scale})`;
  }
}

function refitAllTerminals() {
  for (const [container, instance] of terminals) {
    requestAnimationFrame(() => refitTerminal(instance, container));
  }
}

// Some Android Chrome/WebView versions leave dvh unchanged while the software
// keyboard overlays the page. Mirror the visual viewport into CSS so the
// terminal/chat flex area yields space to the composer. The bottom navigation
// is hidden only while a text editor is focused and the viewport contracted.
let largestVisualViewportHeight = 0;
let lastVisualViewportWidth = 0;
let viewportLayoutTimer = null;

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const width = Math.round(viewport?.width || window.innerWidth || 0);
  const height = Math.round(viewport?.height || window.innerHeight || 0);
  if (!height) return;

  if (!lastVisualViewportWidth || Math.abs(width - lastVisualViewportWidth) > 80) {
    largestVisualViewportHeight = height;
  } else {
    largestVisualViewportHeight = Math.max(largestVisualViewportHeight, height);
  }
  lastVisualViewportWidth = width;

  const focused = document.activeElement;
  const acceptsText = Boolean(focused?.matches?.('input, textarea, [contenteditable="true"], .xterm-helper-textarea'));
  const keyboardThreshold = Math.max(100, largestVisualViewportHeight * 0.18);
  const keyboardVisible = isMobile()
    && acceptsText
    && largestVisualViewportHeight - height > keyboardThreshold;

  document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
  document.documentElement.classList.toggle("keyboard-visible", keyboardVisible);

  clearTimeout(viewportLayoutTimer);
  viewportLayoutTimer = setTimeout(() => {
    refitAllTerminals();
    resizeComposerInput();
    if (keyboardVisible && focused === ui.messageInput) {
      ui.messageInput.scrollIntoView({ block: "nearest" });
    }
  }, 60);
}

// Attach terminals to exactly the mounts of the active view; release the rest.
// Called after every render, so switching views or rebuilding a Screen layout
// tears down the terminals (and their SSE streams) that are no longer visible.
function syncTerminal() {
  if (!terminalSupported) return;
  const keep = new Set();
  if (selection.type === "session" && sessionViewMode === "term") {
    const agent = selectedAgent();
    if (agent && ui.terminalMount) {
      attachTerminal(ui.terminalMount, agent.id);
      keep.add(ui.terminalMount);
    }
    if (ui.terminalLive) ui.terminalLive.hidden = !agent;
  } else if (selection.type === "screen") {
    for (const mount of ui.screenLayout.querySelectorAll("[data-terminal-mount]")) {
      if (isMobile() && !mount.closest(".screen-leaf")?.classList.contains("mobile-pane-active")) {
        continue;
      }
      const agentId = mount.dataset.terminalMount;
      if (agentId) { attachTerminal(mount, agentId, 12); keep.add(mount); }
    }
  }
  for (const container of [...terminals.keys()]) {
    if (!keep.has(container)) releaseTerminal(container);
  }
}

// ---- Conversation (chat) view ----
// Renders an agent's own transcript (via /api/chat) as a chat instead of the
// width-constrained terminal. Default on; the session view toggles chat/term.
let sessionViewMode = localStorage.getItem("multiagent.remote.sessionMode") === "term" ? "term" : "chat";
let chatRequestSeq = 0;

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function inlineMd(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}
function mdToHtml(text) {
  const lines = String(text).split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) { closeList(); html += `<h4>${inlineMd(heading[2])}</h4>`; }
    else if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inlineMd(bullet[1])}</li>`; }
    else if (!line.trim()) { closeList(); }
    else { closeList(); html += `<p>${inlineMd(line)}</p>`; }
  }
  closeList();
  return html;
}
function toolLabel(tool) {
  let arg = tool.summary || "";
  if (!arg) {
    const input = tool.input;
    if (typeof input === "string") arg = input;
    else if (input && typeof input === "object") {
      arg = input.command || input.cmd || input.file_path || input.path || input.pattern || JSON.stringify(input);
    }
  }
  return { name: tool.name || "tool", arg: String(arg).replace(/\s+/g, " ").slice(0, 110) };
}

// Render a diff (from an edit tool call or diff-like output) as colored lines.
function renderDiff(diff) {
  const box = make("div", "chat-diff");
  for (const line of diff) {
    const row = make("div", `chat-diff-line ${line.type}`);
    const gutter = make("span", "chat-diff-gutter", line.type === "add" ? "+" : line.type === "del" ? "-" : " ");
    row.append(gutter, document.createTextNode(line.text || " "));
    box.appendChild(row);
  }
  return box;
}

function renderAssistantTurn(run) {
  const turn = make("div", "chat-turn");
  const role = make("div", "chat-role");
  role.append(make("span", "av", "✦"), document.createTextNode("Assistant"));
  turn.appendChild(role);

  const tools = [];
  let pendingCall = null;
  const bodyNodes = [];
  for (const block of run) {
    if (block.kind === "tool-call") {
      pendingCall = { name: block.name, input: block.input, summary: block.summary, diff: block.diff || null, output: null, isError: false };
      tools.push(pendingCall);
    } else if (block.kind === "tool-result") {
      if (pendingCall && pendingCall.output === null) {
        pendingCall.output = block.output; pendingCall.isError = block.isError;
        if (!pendingCall.diff && block.diff) pendingCall.diff = block.diff;
        pendingCall = null;
      } else {
        tools.push({ name: "result", input: null, output: block.output, isError: block.isError, diff: block.diff || null });
      }
    } else if (block.kind === "reasoning") {
      const d = make("details", "chat-work");
      d.append(make("summary", "", "추론"));
      const wrap = make("div", "chat-tools");
      const pre = make("pre", "", block.text);
      wrap.appendChild(pre);
      d.appendChild(wrap);
      bodyNodes.push(d);
    } else if (block.kind === "text") {
      const md = make("div", "chat-md");
      md.innerHTML = mdToHtml(block.text);
      bodyNodes.push(md);
    } else if (block.kind === "image") {
      bodyNodes.push(make("div", "chat-md", "🖼 이미지"));
    }
  }

  if (tools.length) {
    const group = make("details", "chat-work");
    group.append(make("summary", "", `작업 · 툴 ${tools.length}개`));
    const list = make("div", "chat-tools");
    for (const tool of tools) {
      const label = toolLabel(tool);
      const item = make("details", "chat-tool");
      const summary = make("summary", "");
      summary.append(make("span", "k", "$"), make("span", "cmd", label.arg ? `${label.name} · ${label.arg}` : label.name));
      item.appendChild(summary);
      if (tool.diff) item.appendChild(renderDiff(tool.diff));
      if (tool.output !== undefined && tool.output !== null || !tool.diff) {
        item.appendChild(make("pre", tool.isError ? "err" : "", tool.output ?? "(출력 없음)"));
      }
      list.appendChild(item);
    }
    group.appendChild(list);
    turn.appendChild(group);
  }
  for (const node of bodyNodes) turn.appendChild(node);
  return turn;
}

const CHAT_PAGE = 10;
let chatVisible = CHAT_PAGE;
let lastChatData = null;
let chatHiddenCount = 0;
let chatAutoLoading = false;

// Auto-reveal older turns when the user scrolls to the top of the chat (the
// "이전 대화 더 보기" button stays as an explicit affordance). Prepending grows
// content above, so shift scrollTop by the added height to avoid a jump.
function bindChatAutoLoad() {
  const el = ui.chatView;
  if (!el || el.dataset.autoload === "1") return;
  el.dataset.autoload = "1";
  el.addEventListener("scroll", () => {
    if (chatAutoLoading || chatHiddenCount <= 0 || el.scrollTop >= 80) return;
    chatAutoLoading = true;
    const prevHeight = el.scrollHeight;
    chatVisible += CHAT_PAGE * 2;
    if (lastChatData) renderChat(lastChatData);
    el.scrollTop += el.scrollHeight - prevHeight;
    chatAutoLoading = false;
  });
}

function renderChat(data) {
  const el = ui.chatView;
  if (!el) return;
  bindChatAutoLoad();
  lastChatData = data;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  const frag = document.createDocumentFragment();
  if (data?.unsupported) {
    frag.appendChild(make("div", "chat-empty", "이 세션은 대화 보기를 지원하지 않습니다 (codex/claude)."));
  } else if (data?.error) {
    const error = make("div", "chat-error");
    error.append(
      make("strong", "", "대화를 불러오지 못했습니다"),
      make("span", "", "터미널은 계속 사용할 수 있습니다. 잠시 후 다시 시도해 주세요."),
    );
    const actions = make("div", "chat-error-actions");
    const retry = make("button", "", "다시 시도");
    retry.type = "button";
    retry.addEventListener("click", () => {
      const agent = selectedAgent();
      if (!agent) return;
      lastChatFetch = { id: null, at: 0 };
      void fetchChat(agent.id);
    });
    const terminal = make("button", "", "터미널 보기");
    terminal.type = "button";
    terminal.addEventListener("click", () => setSessionViewMode("term"));
    actions.append(retry, terminal);
    error.appendChild(actions);
    frag.appendChild(error);
  } else if (!blocks.length) {
    frag.appendChild(make("div", "chat-empty", data?.missing ? "아직 대화 기록이 없습니다." : "대화를 불러오는 중…"));
  } else {
    // Group blocks into turns as [start, end) ranges. A new turn begins at a
    // user *text* block; everything else — assistant text/reasoning/tools, and
    // user images (role:"user", kind:"image") — folds into the preceding run.
    // The `do…while` always advances `i`: a user block whose kind isn't "text"
    // MUST be consumed here or the loop spins forever, building turns without
    // bound (this was the runaway-memory freeze).
    const ranges = [];
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      if (b.role === "user" && b.kind === "text") {
        ranges.push({ user: true, start: i, end: i + 1 });
        i += 1;
      } else {
        const start = i;
        do { i += 1; }
        while (i < blocks.length && !(blocks[i].role === "user" && blocks[i].kind === "text"));
        ranges.push({ user: false, start, end: i });
      }
    }
    // Build DOM only for the most recent `chatVisible` turns so a long session
    // paints fast; the button reveals older turns on demand.
    const hidden = Math.max(0, ranges.length - chatVisible);
    chatHiddenCount = hidden; // drives scroll-to-top auto-load
    if (hidden > 0) {
      const more = make("button", "chat-more", `▲ 이전 대화 더 보기 (${hidden})`);
      more.type = "button";
      more.addEventListener("click", () => {
        const prevHeight = el.scrollHeight;
        chatVisible += CHAT_PAGE * 2;
        if (lastChatData) renderChat(lastChatData);
        el.scrollTop += el.scrollHeight - prevHeight;
      });
      frag.appendChild(more);
    }
    for (const range of ranges.slice(hidden)) {
      if (range.user) {
        const turn = make("div", "chat-turn user");
        turn.appendChild(make("div", "chat-user", blocks[range.start].text));
        frag.appendChild(turn);
      } else {
        frag.appendChild(renderAssistantTurn(blocks.slice(range.start, range.end)));
      }
    }
  }
  // "작업 중…" indicator while the selected agent is working (like Codex's 생각 중).
  // Suppress it when the transcript says the turn finished (stale hook status).
  if (!data?.unsupported) {
    const agent = selectedAgent();
    const chatStatus = agent ? statusOf(agent) : "offline";
    if (agent && chatStatus === "working" && data?.lifecycle !== "idle") {
      const think = make("div", "chat-thinking");
      const dots = make("span", "chat-thinking-dots");
      dots.append(make("i", ""), make("i", ""), make("i", ""));
      think.append(dots, document.createTextNode("작업 중…"));
      const stop = make("button", "chat-stop", "■ 중단");
      stop.type = "button";
      stop.title = "진행 취소 (Esc)";
      stop.addEventListener("click", () => { void cancelSession(agent.id); });
      think.appendChild(stop);
      frag.appendChild(think);
    } else if (agent && ["recovering", "starting"].includes(chatStatus)) {
      const think = make("div", "chat-thinking");
      const dots = make("span", "chat-thinking-dots");
      dots.append(make("i", ""), make("i", ""), make("i", ""));
      think.append(
        dots,
        document.createTextNode(chatStatus === "recovering" ? "세션 복구 중…" : "세션 시작 중…"),
      );
      frag.appendChild(think);
    }
    // Inline prompt card (question / permission) — hidden once answered.
    const prompt = agent ? promptFor(agent) : null;
    if (prompt && promptSignature(prompt) !== answeredPromptSig) {
      const card = make("div", `chat-prompt ${prompt.kind}`);
      card.appendChild(make("div", "chat-prompt-text", `${prompt.kind === "permission" ? "🔒 " : "❓ "}${prompt.text}`));
      const opts = make("div", "chat-prompt-options");
      for (const option of prompt.options) {
        const button = make("button", "chat-prompt-option", option.label);
        button.type = "button";
        button.addEventListener("click", () => { void respondPrompt(agent.id, prompt, option); });
        opts.appendChild(button);
      }
      card.appendChild(opts);
      frag.appendChild(card);
    }
  }
  el.replaceChildren(frag);
  if (nearBottom) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

let lastChatKey = "";
let lastChatFetch = { id: null, at: 0 };
let chatAgent = null;
async function fetchChat(agentId) {
  if (!agentId) return;
  if (agentId !== chatAgent) {
    chatAgent = agentId;
    chatVisible = CHAT_PAGE; // reset pagination when switching sessions
  }
  const seq = ++chatRequestSeq;
  try {
    const response = await fetch(`/api/chat?id=${encodeURIComponent(agentId)}`, { credentials: "same-origin" });
    let data = await response.json().catch(() => ({ blocks: [] }));
    if (!response.ok) data = { blocks: [], error: true };
    if (seq !== chatRequestSeq) return; // a newer request superseded this one
    const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
    const last = blocks[blocks.length - 1];
    // Skip re-render when nothing changed so opened tool/▸ details stay open.
    const key = `${agentId}|${blocks.length}|${String(last?.text ?? last?.output ?? "").length}|${data?.unsupported ? 1 : 0}|${data?.missing ? 1 : 0}|${data?.error ? 1 : 0}`;
    if (key === lastChatKey) return;
    lastChatKey = key;
    renderChat(data);
  } catch {
    // Keep the last rendered conversation on a transient error.
  }
}

// Show chat or terminal for the session view; refresh the active one.
function syncSessionView() {
  if (selection.type !== "session") return;
  const agent = selectedAgent();
  syncQueueAgent(agent);
  renderComposerAttachments();
  const chat = sessionViewMode === "chat";
  ui.appShell.dataset.sessionMode = sessionViewMode;
  if (ui.chatView) ui.chatView.hidden = !chat;
  if (ui.outputPanel) ui.outputPanel.hidden = chat;
  if (ui.sessionMode) {
    for (const button of ui.sessionMode.children) {
      button.classList.toggle("on", button.dataset.mode === sessionViewMode);
    }
  }
  // Throttle: renderSelection runs on every state poll, but a chat fetch scans
  // and parses the transcript server-side — refetch immediately on session/mode
  // change, otherwise at most every few seconds.
  if (chat && agent) {
    const now = Date.now();
    if (agent.id !== lastChatFetch.id || now - lastChatFetch.at > 3000) {
      lastChatFetch = { id: agent.id, at: now };
      fetchChat(agent.id);
    }
    // Re-render promptly when the busy state or the inline prompt changes, even
    // if the transcript itself didn't change this poll.
    const prompt = promptFor(agent);
    const sig = `${statusOf(agent)}|${prompt ? `${prompt.kind}:${prompt.options.length}:${prompt.text}` : ""}`;
    if (sig !== lastChatStatusSig) {
      lastChatStatusSig = sig;
      if (lastChatData) renderChat(lastChatData);
    }
  }
}
let lastChatStatusSig = "";

function setSessionViewMode(mode) {
  sessionViewMode = mode === "term" ? "term" : "chat";
  localStorage.setItem("multiagent.remote.sessionMode", sessionViewMode);
  lastChatFetch = { id: null, at: 0 };
  syncTerminal();
  syncSessionView();
  updateComposerSendState();
}

// Mobile Screen mode renders one pane at a time and keeps the same navigation
// entry as desktop. Refit the selected terminal after a viewport transition.
function applyScreenAvailability() {
  if (ui.screensSection) ui.screensSection.hidden = false;
}

async function showNotification(title, body, tag, agentId) {
  if (!("Notification" in window)
    || localStorage.getItem("multiagent.remote.notifications") !== "on"
    || window.Notification.permission !== "granted"
    || (backgroundPushEnabled && String(tag).startsWith("done:"))) return;
  const options = { body, tag, renotify: true, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { agentId } };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) await registration.showNotification(title, options);
    else new window.Notification(title, options);
  } catch {}
}

function processActivityNotifications(agents) {
  const next = new Map();
  for (const agent of agents) {
    const status = statusOf(agent);
    const question = questionOf(agent);
    const questionKey = question ? `${agent.hook?.received_at || ""}:${question}` : "";
    const previous = previousActivity.get(agent.id);
    next.set(agent.id, { status, questionKey });
    if (firstSnapshot || !previous) continue;
    const title = `${projectName(agent)} / ${text(agent.name || agent.id)}`;
    if (questionKey && questionKey !== previous.questionKey) {
      void showNotification(title, question.split("\n")[0], `question:${agent.id}`, agent.id);
    } else if (status === "done" && ["working", "attention"].includes(previous.status)) {
      void showNotification(title, "작업이 완료되었습니다.", `done:${agent.id}`, agent.id);
    }
  }
  previousActivity = next;
  firstSnapshot = false;
}

function defaultWorkspaceSelection() {
  const screen = screenGroups()[0];
  if (screen) return { type: "screen", id: screen.id };
  const agents = allAgents();
  const agent = agents.find((candidate) => statusOf(candidate) !== "offline") || agents[0];
  if (agent) return { type: "session", id: agent.id };
  const project = localDocumentProjects()[0];
  if (project) return { type: "documents", id: project.id };
  return { type: "usage", id: null };
}

function validateSelection() {
  if (selection.type === "monitor") selection = defaultWorkspaceSelection();
  if (selection.type === "session" && !agentMap().has(selection.id)) selection = defaultWorkspaceSelection();
  if (selection.type === "screen" && !screenGroups().some((screen) => screen.id === selection.id)) selection = defaultWorkspaceSelection();
  if (selection.type === "documents" && !localDocumentProjects().some((project) => project.id === selection.id)) {
    const fallback = localDocumentProjects()[0];
    selection = fallback ? { type: "documents", id: fallback.id } : defaultWorkspaceSelection();
    selectedDocumentPath = null;
  }
  returnScreenId = selection.type === "screen" ? selection.id : returnScreenId;
}

function syncMobileAppDownload(info) {
  if (!ui.androidDownloadButton) return;
  const downloadUrl = text(info?.downloadUrl);
  const available = Boolean(info?.available && downloadUrl.startsWith("/downloads/"));
  ui.androidDownloadButton.hidden = !available;
  if (!available) return;
  ui.androidDownloadButton.href = downloadUrl;
  const size = Number(info?.size);
  const sizeLabel = Number.isFinite(size) && size > 0
    ? ` · ${(size / (1024 * 1024)).toFixed(1)} MB`
    : "";
  ui.androidDownloadButton.title = `Android APK 다운로드${sizeLabel}`;
  ui.androidDownloadButton.setAttribute(
    "aria-label",
    `Android APK 다운로드${sizeLabel}`,
  );
}

async function fetchState({ quiet = false } = {}) {
  try {
    const response = await fetch("/api/state", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      location.reload();
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    remoteState = {
      ...state,
      agents: Array.isArray(state.agents) ? state.agents : [],
      view: state.view && typeof state.view === "object"
        ? {
            ...state.view,
            projects: Array.isArray(state.view.projects) ? state.view.projects : [],
            agents: Array.isArray(state.view.agents) ? state.view.agents : [],
            groups: Array.isArray(state.view.groups) ? state.view.groups : [],
          }
        : { projects: [], agents: [], groups: [] },
    };
    syncMobileAppDownload(remoteState.mobileApp);
    validateSelection();
    processActivityNotifications(allAgents());
    renderSummary();
    renderNavigation();
    renderSelection();
    updateUrl();
    setConnection("online", "연결됨");
    ui.updated.textContent = `마지막 동기화 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch (error) {
    setConnection("offline", "연결 끊김");
    ui.updated.textContent = navigator.onLine ? "PC에 연결할 수 없습니다" : "네트워크가 오프라인입니다";
    if (!quiet) showToast("Remote 서버에 연결할 수 없습니다.");
  }
}

function schedulePoll(delay = 1600) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await fetchState({ quiet: true });
    schedulePoll(document.hidden ? 5000 : 1600);
  }, delay);
}

function pushKeyBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function samePushKey(subscription, expected) {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

async function ensureBackgroundPush(registration) {
  if (!registration?.pushManager) return false;
  try {
    const keyResponse = await fetch("/api/push/public-key", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!keyResponse.ok) return false;
    const key = pushKeyBytes(text((await keyResponse.json()).publicKey));
    if (key.length === 0) return false;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !samePushKey(subscription, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const response = await fetch("/api/push/subscription", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    backgroundPushEnabled = response.ok;
    return backgroundPushEnabled;
  } catch {
    backgroundPushEnabled = false;
    return false;
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("이 브라우저는 알림을 지원하지 않습니다.");
    return;
  }
  if (Notification.permission === "denied") {
    showToast("브라우저 사이트 설정에서 알림 권한을 허용해 주세요.");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    localStorage.setItem("multiagent.remote.notifications", "on");
    ui.notifyButton.classList.add("enabled");
    const registration = await registerServiceWorker();
    const background = await ensureBackgroundPush(registration);
    ui.notifyButton.title = background ? "백그라운드 알림 켜짐" : "알림 켜짐";
    showToast(background
      ? "앱을 닫아도 작업 완료 알림을 받습니다."
      : "PWA 실행 중 완료와 질문 알림을 받습니다.");
  }
}

async function installPwa() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    ui.installButton.hidden = true;
    return;
  }
  showToast("브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해 주세요.");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function initializeNotifications() {
  const registration = await registerServiceWorker();
  if (
    localStorage.getItem("multiagent.remote.notifications") === "on" &&
    window.Notification?.permission === "granted"
  ) {
    ui.notifyButton.classList.add("enabled");
    const background = await ensureBackgroundPush(registration);
    ui.notifyButton.title = background ? "백그라운드 알림 켜짐" : "알림 켜짐";
  }
}

ui.overviewButton.addEventListener("click", () => selectMonitor("all"));
ui.documentsButton.addEventListener("click", () => selectDocuments(selection.type === "documents" ? selection.id : null));
ui.usageButton.addEventListener("click", selectUsage);
ui.refreshUsageButton.addEventListener("click", () => { void loadUsage(true); });
ui.summaryGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-summary-filter]");
  if (card) selectMonitor(card.dataset.summaryFilter);
});
ui.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  setActiveFilter(button.dataset.filter);
  renderNavigation();
  if (selection.type === "monitor") renderMonitor();
});
ui.searchInput.addEventListener("input", () => {
  renderNavigation();
  if (selection.type === "monitor") renderMonitor();
});
ui.documentProjectSelect.addEventListener("change", () => selectDocuments(ui.documentProjectSelect.value));
ui.documentSearchInput.addEventListener("input", () => {
  if (selection.type === "documents") renderDocuments();
});
ui.refreshDocumentsButton.addEventListener("click", async () => {
  if (selection.type !== "documents") return;
  const projectId = selection.id;
  const previousPath = selectedDocumentPath;
  ui.refreshDocumentsButton.disabled = true;
  try {
    await loadDocumentList(projectId, { force: true });
    const documents = documentLists.get(projectId)?.documents || [];
    const nextPath = documents.some((document) => document.path === previousPath)
      ? previousPath
      : documents[0]?.path;
    selectedDocumentPath = nextPath || null;
    if (selectedDocumentPath) await loadDocument(projectId, selectedDocumentPath, { force: true });
    else renderDocuments();
    updateUrl();
  } finally {
    ui.refreshDocumentsButton.disabled = false;
  }
});
ui.documentMarkdown.addEventListener("click", (event) => {
  const link = event.target.closest("[data-document-link]");
  if (!link || selection.type !== "documents" || !selectedDocumentPath) return;
  event.preventDefault();
  let target = String(link.dataset.documentLink || "").replaceAll("\\", "/").split(/[?#]/)[0];
  try { target = decodeURIComponent(target); } catch {}
  if (!target || target.startsWith("/") || /^[a-z]:/i.test(target)) {
    showToast("프로젝트 안의 상대 문서 링크만 열 수 있습니다.");
    return;
  }
  const parts = selectedDocumentPath.split("/");
  parts.pop();
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) {
        showToast("프로젝트 밖의 문서는 열 수 없습니다.");
        return;
      }
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  const resolved = parts.join("/");
  const match = (documentLists.get(selection.id)?.documents || [])
    .find((document) => document.path.toLowerCase() === resolved.toLowerCase());
  if (!match) {
    showToast("링크된 문서를 목록에서 찾을 수 없습니다.");
    return;
  }
    selectedDocumentPath = match.path;
    expandDocumentParents(selection.id, match.path);
  documentContent = null;
  documentContentKey = "";
  documentContentError = "";
  renderDocuments();
  updateUrl();
  void loadDocument(selection.id, match.path);
});
ui.sidebarToggle.addEventListener("click", () => {
  // Mobile: open/close the drawer. Tablet/desktop: collapse the fixed sidebar.
  if (isMobile()) {
    if (ui.navigationPane.classList.contains("open")) closeSidebar();
    else openSidebar();
  } else {
    toggleNavCollapsed();
  }
});
ui.sessionNavButton.addEventListener("click", () => {
  if (isMobile()) {
    if (ui.navigationPane.classList.contains("open")) closeSidebar();
    else openSidebar(ui.filters);
  } else {
    toggleNavCollapsed();
  }
});
ui.sidebarBackdrop.addEventListener("click", closeSidebar);
ui.screenOpenSession.addEventListener("click", () => {
  const id = ui.screenOpenSession.dataset.agentId;
  if (id && selectedScreen()) selectSession(id, selectedScreen().id);
});
ui.backToScreenButton.addEventListener("click", () => {
  if (returnScreenId) selectScreen(returnScreenId);
});
ui.refreshButton.addEventListener("click", () => fetchState());
ui.focusAnswerButton.addEventListener("click", () => ui.messageInput.focus());
ui.restartSessionButton?.addEventListener("click", async () => {
  const agent = selectedAgent();
  if (!agent) return;
  ui.restartSessionButton.disabled = true;
  await requestSessionActivation(agent.id);
  ui.restartSessionButton.disabled = false;
});
ui.sessionMode?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  setSessionViewMode(button.dataset.mode);
});
ui.composerForm.addEventListener("submit", (event) => { event.preventDefault(); void sendSelectedMessage(); });
ui.attachmentButton.addEventListener("click", () => ui.attachmentInput.click());
ui.attachmentInput.addEventListener("change", () => {
  addAttachments([...ui.attachmentInput.files]);
  ui.attachmentInput.value = "";
});
ui.messageInput.addEventListener("paste", handleComposerImagePaste);
ui.composerForm.addEventListener("dragenter", handleComposerImageDragEnter);
ui.composerForm.addEventListener("dragover", handleComposerImageDragOver);
ui.composerForm.addEventListener("dragleave", handleComposerImageDragLeave);
ui.composerForm.addEventListener("drop", handleComposerImageDrop);
window.addEventListener("dragend", clearComposerDragState);
setInterval(() => { void drainQueue(); }, 500);
// ---- Slash-command autocomplete (composer) ----
const SLASH_CLAUDE = [["clear","대화 컨텍스트 지우기"],["compact","대화 요약·압축"],["model","모델 변경"],["review","코드 리뷰"],["init","CLAUDE.md 생성"],["agents","서브에이전트"],["cost","토큰/비용"],["config","설정"],["memory","메모리"],["status","상태"],["resume","세션 재개"],["export","내보내기"],["help","도움말"]];
const SLASH_CODEX = [["clear","대화 지우기"],["compact","요약·압축"],["model","모델 변경"],["approvals","승인 정책"],["new","새 대화"],["diff","변경 diff"],["status","상태"],["init","AGENTS.md 생성"],["quit","종료"],["help","도움말"]];
let acItems = [];
let acIndex = 0;
let acTrigger = null;

function slashCatalog() {
  return selectedAgent()?.aiToolId === "codex" ? SLASH_CODEX : SLASH_CLAUDE;
}
function renderComposerAc() {
  const el = ui.composerAc;
  if (!el) return;
  el.replaceChildren();
  if (!acItems.length) { el.hidden = true; return; }
  el.hidden = false;
  acItems.forEach(([name, desc], i) => {
    const item = make("button", `composer-ac-item ${i === acIndex ? "on" : ""}`);
    item.type = "button";
    item.append(make("span", "composer-ac-label", `/${name}`), make("span", "composer-ac-desc", desc || ""));
    item.addEventListener("mousedown", (e) => { e.preventDefault(); acceptComposerAc(i); });
    el.appendChild(item);
  });
}
function refreshComposerAc() {
  const value = ui.messageInput.value;
  const caret = ui.messageInput.selectionStart ?? value.length;
  const m = value.slice(0, caret).match(/(?:^|\n)\/([^\s/]*)$/);
  if (!m) { acTrigger = null; acItems = []; renderComposerAc(); return; }
  const q = m[1].toLowerCase();
  acTrigger = { start: caret - m[1].length - 1, end: caret };
  acItems = slashCatalog().filter(([n]) => n.toLowerCase().startsWith(q)).slice(0, 10);
  acIndex = 0;
  renderComposerAc();
}
function acceptComposerAc(i) {
  const pick = acItems[i];
  if (!pick || !acTrigger) return;
  const value = ui.messageInput.value;
  const insert = `/${pick[0]} `;
  ui.messageInput.value = value.slice(0, acTrigger.start) + insert + value.slice(acTrigger.end);
  const caret = acTrigger.start + insert.length;
  ui.messageInput.setSelectionRange(caret, caret);
  acTrigger = null; acItems = [];
  renderComposerAc();
  resizeComposerInput();
  ui.messageInput.focus();
}
ui.messageInput.addEventListener("input", () => {
  resizeComposerInput();
  refreshComposerAc();
  updateComposerSendState();
});
ui.messageInput.addEventListener("blur", () => setTimeout(() => { acItems = []; renderComposerAc(); }, 120));
ui.messageInput.addEventListener("keydown", (event) => {
  // Autocomplete popup takes priority.
  if (acItems.length) {
    if (event.key === "ArrowDown") { event.preventDefault(); acIndex = (acIndex + 1) % acItems.length; renderComposerAc(); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; renderComposerAc(); return; }
    if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); acceptComposerAc(acIndex); return; }
    if (event.key === "Escape") { event.preventDefault(); acItems = []; renderComposerAc(); return; }
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void sendSelectedMessage();
    return;
  }
  // Esc cancels the in-progress turn while the agent is working.
  if (event.key === "Escape") {
    const agent = selectedAgent();
    if (agent && statusOf(agent) === "working") {
      event.preventDefault();
      void cancelSession(agent.id);
    }
  }
});
ui.copyOutputButton.addEventListener("click", async () => {
  const instance = terminals.get(ui.terminalMount);
  const content = terminalSupported && instance
    ? (instance.term.getSelection() || terminalBufferText(instance))
    : (ui.outputText.textContent || "");
  try {
    await navigator.clipboard.writeText(content);
    showToast("터미널 내용을 복사했습니다.");
  } catch { showToast("복사하지 못했습니다."); }
});
ui.notifyButton.addEventListener("click", enableNotifications);
ui.installButton.addEventListener("click", installPwa);
ui.logoutButton.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  location.reload();
});
ui.mobileMonitorButton.addEventListener("click", () => selectMonitor("all"));
ui.mobileSessionsButton.addEventListener("click", () => openSidebar());
ui.mobileDocumentsButton.addEventListener("click", () => selectDocuments(selection.type === "documents" ? selection.id : null));
ui.mobileUsageButton.addEventListener("click", selectUsage);

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ui.installButton.hidden = false;
});
addEventListener("appinstalled", () => { ui.installButton.hidden = true; showToast("MultiAgent Remote를 설치했습니다."); });
addEventListener("online", () => { void fetchState(); });
addEventListener("offline", () => { setConnection("offline", "오프라인"); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) void fetchState({ quiet: true }); });
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "open-agent" && event.data.agentId) selectSession(event.data.agentId);
});

// Collapsible sidebar (tablet/desktop) — persisted across sessions.
const NAV_COLLAPSE_KEY = "multiagent.remote.navCollapsed";
const appShell = document.querySelector(".app-shell");
const compactWorkspaceMedia = window.matchMedia("(max-width: 1180px)");
function updateSidebarToggleState() {
  const expanded = isMobile()
    ? ui.navigationPane.classList.contains("open")
    : !appShell?.classList.contains("nav-collapsed");
  ui.sidebarToggle.setAttribute("aria-expanded", String(expanded));
  ui.sidebarToggle.setAttribute("aria-label", expanded ? "탐색 메뉴 접기" : "탐색 메뉴 열기");
  ui.sidebarToggle.title = expanded ? "좌측 목록 접기" : "좌측 목록 열기";
  ui.sessionNavButton.setAttribute("aria-expanded", String(expanded));
  ui.sessionNavButton.setAttribute("aria-label", expanded ? "세션 목록 접기" : "세션 목록 열기");
  ui.sessionNavButton.title = expanded ? "좌측 세션 목록 접기" : "좌측 세션 목록 열기";
  ui.sessionNavButton.textContent = isMobile() && expanded ? "×" : expanded ? "‹" : "☰";
}
function applyNavCollapsed(collapsed) {
  appShell?.classList.toggle("nav-collapsed", collapsed);
  updateSidebarToggleState();
  requestAnimationFrame(refitAllTerminals);
}
function toggleNavCollapsed() {
  const collapsed = !appShell?.classList.contains("nav-collapsed");
  localStorage.setItem(NAV_COLLAPSE_KEY, collapsed ? "1" : "0");
  applyNavCollapsed(collapsed);
}

// React to viewport changes: enable/disable Screen mode and re-fit terminals.
mobileMedia.addEventListener("change", () => {
  applyScreenAvailability();
  renderNavigation();
  syncTerminal();
  updateSidebarToggleState();
  refitAllTerminals();
});
let resizeTimer = null;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    syncVisualViewport();
    refitAllTerminals();
  }, 150);
});
window.visualViewport?.addEventListener("resize", syncVisualViewport);
window.visualViewport?.addEventListener("scroll", syncVisualViewport);
document.addEventListener("focusin", () => setTimeout(syncVisualViewport, 0));
document.addEventListener("focusout", () => setTimeout(syncVisualViewport, 80));

if (localStorage.getItem("multiagent.remote.notifications") === "on" && window.Notification?.permission === "granted") {
  ui.notifyButton.classList.add("enabled");
  ui.notifyButton.title = "알림 켜짐";
}
applyNavCollapsed(
  localStorage.getItem(NAV_COLLAPSE_KEY) === "1"
  || (selection.type === "session" && compactWorkspaceMedia.matches),
);
syncVisualViewport();
resizeComposerInput();
applyScreenAvailability();
updateComposerSendState();
setActiveFilter(activeFilter);
void initializeNotifications();
void fetchState();
schedulePoll();
