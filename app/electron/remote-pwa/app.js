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
  newSessionButton: $("#newSessionButton"),
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
  documentSidebar: $("#documentSidebar"),
  documentSidebarToggle: $("#documentSidebarToggle"),
  documentSidebarClose: $("#documentSidebarClose"),
  documentSidebarBackdrop: $("#documentSidebarBackdrop"),
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
  documentHtmlLaunch: $("#documentHtmlLaunch"),
  documentOpenHtmlButton: $("#documentOpenHtmlButton"),
  filePreviewOverlay: $("#filePreviewOverlay"),
  filePreviewTitle: $("#filePreviewTitle"),
  filePreviewPath: $("#filePreviewPath"),
  filePreviewKind: $("#filePreviewKind"),
  filePreviewClose: $("#filePreviewClose"),
  filePreviewMessage: $("#filePreviewMessage"),
  filePreviewMarkdown: $("#filePreviewMarkdown"),
  filePreviewImageWrap: $("#filePreviewImageWrap"),
  filePreviewImage: $("#filePreviewImage"),
  sessionEditorOverlay: $("#sessionEditorOverlay"),
  sessionEditorForm: $("#sessionEditorForm"),
  sessionEditorTitle: $("#sessionEditorTitle"),
  sessionEditorClose: $("#sessionEditorClose"),
  sessionEditorProjectField: $("#sessionEditorProjectField"),
  sessionEditorProject: $("#sessionEditorProject"),
  sessionEditorName: $("#sessionEditorName"),
  sessionEditorToolField: $("#sessionEditorToolField"),
  sessionEditorTool: $("#sessionEditorTool"),
  sessionEditorDangerousField: $("#sessionEditorDangerousField"),
  sessionEditorDangerous: $("#sessionEditorDangerous"),
  sessionEditorMessage: $("#sessionEditorMessage"),
  sessionEditorCancel: $("#sessionEditorCancel"),
  sessionEditorSubmit: $("#sessionEditorSubmit"),
  usageView: $("#usageView"),
  refreshUsageButton: $("#refreshUsageButton"),
  usageTokenEvents: $("#usageTokenEvents"),
  usageTotalTokens: $("#usageTotalTokens"),
  usageInputTokens: $("#usageInputTokens"),
  usageOutputTokens: $("#usageOutputTokens"),
  usageCacheReadTokens: $("#usageCacheReadTokens"),
  usageCacheWriteTokens: $("#usageCacheWriteTokens"),
  usageReasoningTokens: $("#usageReasoningTokens"),
  usageHistoryMode: $("#usageHistoryMode"),
  usageHistoryTitle: $("#usageHistoryTitle"),
  usageHistoryDescription: $("#usageHistoryDescription"),
  usagePreviousPeriod: $("#usagePreviousPeriod"),
  usageYearSelect: $("#usageYearSelect"),
  usageMonthSelect: $("#usageMonthSelect"),
  usageWeekSelect: $("#usageWeekSelect"),
  usageCurrentPeriod: $("#usageCurrentPeriod"),
  usageNextPeriod: $("#usageNextPeriod"),
  usageHistoryRange: $("#usageHistoryRange"),
  usageHistoryQuick: $("#usageHistoryQuick"),
  usageSelectedLabel: $("#usageSelectedLabel"),
  usageSelectedTotal: $("#usageSelectedTotal"),
  usageSelectedMeta: $("#usageSelectedMeta"),
  usageComparisonLabel: $("#usageComparisonLabel"),
  usageComparisonValue: $("#usageComparisonValue"),
  usageComparisonMeta: $("#usageComparisonMeta"),
  usageAverageLabel: $("#usageAverageLabel"),
  usageAverageValue: $("#usageAverageValue"),
  usageAverageMeta: $("#usageAverageMeta"),
  usagePeakLabel: $("#usagePeakLabel"),
  usagePeakValue: $("#usagePeakValue"),
  usagePeakMeta: $("#usagePeakMeta"),
  usageChartTitle: $("#usageChartTitle"),
  usageChartDescription: $("#usageChartDescription"),
  usageChart: $("#usageChart"),
  usageChartSummary: $("#usageChartSummary"),
  usageChartEmpty: $("#usageChartEmpty"),
  usageBreakdownTitle: $("#usageBreakdownTitle"),
  usageRemainingSummary: $("#usageRemainingSummary"),
  usageProviderSummary: $("#usageProviderSummary"),
  usageUpdatedSummary: $("#usageUpdatedSummary"),
  usageMessage: $("#usageMessage"),
  usageProviderGrid: $("#usageProviderGrid"),
  sessionView: $("#sessionView"),
  detailStatus: $("#detailStatus"),
  detailName: $("#detailName"),
  detailMeta: $("#detailMeta"),
  renameSessionButton: $("#renameSessionButton"),
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
  browserPanel: $("#browserPanel"),
  browserBackButton: $("#browserBackButton"),
  browserForwardButton: $("#browserForwardButton"),
  browserReloadButton: $("#browserReloadButton"),
  browserNewTabButton: $("#browserNewTabButton"),
  browserTabSelect: $("#browserTabSelect"),
  browserAddressForm: $("#browserAddressForm"),
  browserAddressInput: $("#browserAddressInput"),
  browserViewport: $("#browserViewport"),
  browserFrame: $("#browserFrame"),
  browserMessage: $("#browserMessage"),
  browserInputForm: $("#browserInputForm"),
  browserTextInput: $("#browserTextInput"),
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
let documentSidebarOpen = selection.type === "documents" && !selectedDocumentPath;
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
const remoteBrowser = {
  agentId: "",
  tabs: [],
  activeTabId: "",
  statusAt: 0,
  statusLoading: false,
  frameLoading: false,
  frameTimer: null,
  frameAbort: null,
  frameObjectUrl: "",
  frameWidth: 0,
  frameHeight: 0,
  sourceWidth: 0,
  sourceHeight: 0,
  pointer: null,
};
let documentContent = null;
let documentContentKey = "";
let documentContentLoading = false;
let documentContentError = "";
let documentProjectsRenderKey = "";
let documentListRenderKey = "";
let filePreviewRequest = 0;
let filePreviewObjectUrl = "";
let filePreviewPreviousFocus = null;
let filePreviewContext = null;
let sessionEditorMode = null;
let sessionEditorAgentId = null;
let sessionEditorPreviousFocus = null;
let usageSummary = null;
let usageLoading = false;
let usageRefreshing = false;
let usageError = "";
let usageLoadedAt = 0;
let usageLoadAttempted = false;
const usageNow = new Date();
let usageSelection = {
  mode: "month",
  year: usageNow.getFullYear(),
  month: usageNow.getMonth() + 1,
  week: null,
};
let usageRequestSerial = 0;
let usageQuickRenderKey = "";
let usageRefreshPollTimer = 0;

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

function syncDocumentSidebar() {
  const mobile = isMobile();
  const open = selection.type === "documents" && mobile && documentSidebarOpen;
  if (!open && mobile && ui.documentSidebar.contains(document.activeElement)) {
    ui.documentSidebarToggle.focus({ preventScroll: true });
  }
  ui.documentsView.classList.toggle("document-sidebar-open", open);
  ui.documentSidebarToggle.setAttribute("aria-expanded", String(open));
  ui.documentSidebarToggle.setAttribute("aria-label", open ? "문서 목록 닫기" : "문서 목록 열기");
  ui.documentSidebar.toggleAttribute("inert", mobile && !open);
  ui.documentSidebar.setAttribute("aria-hidden", String(mobile && !open));
}

function setDocumentSidebarOpen(open) {
  documentSidebarOpen = Boolean(open);
  syncDocumentSidebar();
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
        turn.appendChild(renderChatUser(blocks[range.start].text, agent));
        fragment.appendChild(turn);
      } else {
        fragment.appendChild(renderAssistantTurn(blocks.slice(range.start, range.end), agent));
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
  const canReturn = !isMobile() && returnScreenId && screenGroups().some((screen) => screen.id === returnScreenId);
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
  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, href) => {
    const target = String(href).trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && chatFileKind(target) === "image") {
      return stash(`<button type="button" class="document-inline-file" data-document-link="${escapeHtml(target)}">🖼 ${escapeHtml(label || target)}</button>`);
    }
    return match;
  });
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, href) => {
    const target = String(href).trim();
    if (/^https?:\/\//i.test(target)) {
      return stash(`<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && chatFileKind(target)) {
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
      if (isMobile()) setDocumentSidebarOpen(false);
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
          // On mobile the document drawer is the initial selection surface.
          // Do not render an arbitrary first HTML iframe behind that drawer.
          selectedDocumentPath = isMobile() ? null : (documents[0]?.path || null);
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
  if (/\.html?$/i.test(relativePath)) {
    documentContent = {
      kind: "html",
      name: relativePath.split("/").pop() || relativePath,
      path: relativePath,
    };
    documentContentLoading = false;
    renderDocumentPreview();
    return;
  }
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
  ui.documentHtmlLaunch.hidden = true;
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
  if (documentContent.kind === "html") {
    ui.documentHtmlLaunch.hidden = false;
  } else {
    const renderKey = `${key}\u0000${documentContent.modifiedAt || ""}\u0000${documentContent.size || 0}`;
    ui.documentMarkdown.hidden = false;
    if (ui.documentMarkdown.dataset.renderKey !== renderKey) {
      ui.documentMarkdown.dataset.renderKey = renderKey;
      ui.documentMarkdown.innerHTML = documentMarkdownToHtml(documentContent.content || "");
      ui.documentMarkdown.scrollTop = 0;
    }
  }
}

function isLocalPreviewAssetRef(value) {
  const ref = String(value ?? "").trim();
  if (!ref || ref.startsWith("#") || ref.startsWith("//")) return false;
  if (/^[a-z]:[\\/]/i.test(ref)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

function resolveRelativePreviewPath(containerPath, rawTarget) {
  let target = cleanChatFilePath(rawTarget).replaceAll("\\", "/");
  if (!target || !isLocalPreviewAssetRef(target)) return null;
  if (/^[a-z]:\//i.test(target) || target.startsWith("/")) return target;
  const parts = String(containerPath || "").replaceAll("\\", "/").split("/");
  parts.pop();
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function remoteFileQuery(projectId, relativePath, agentId = "") {
  const values = { projectId, path: relativePath };
  if (agentId) values.agentId = agentId;
  return new URLSearchParams(values);
}

async function openRemoteHtmlPreview(projectId, relativePath, agentId = "") {
  if (!projectId || !relativePath) return;
  const query = remoteFileQuery(projectId, relativePath, agentId);
  if (window.__MULTIAGENT_NATIVE_EXTERNAL_PREVIEW__ && window.ReactNativeWebView?.postMessage) {
    query.set("format", "json");
    try {
      const response = await fetch(`/api/docs/preview?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await apiError(response));
      const result = await response.json();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "multiagent:open-external-preview",
        url: new URL(result.url, window.location.origin).href,
      }));
    } catch (error) {
      showToast(`HTML을 열지 못했습니다: ${error.message || error}`);
    }
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = `/api/docs/preview?${query}`;
  anchor.target = window.__MULTIAGENT_NATIVE_APP__ ? "_self" : "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function resetFilePreviewContent() {
  if (filePreviewObjectUrl) {
    URL.revokeObjectURL(filePreviewObjectUrl);
    filePreviewObjectUrl = "";
  }
  ui.filePreviewImage.removeAttribute("src");
  ui.filePreviewImage.alt = "";
  ui.filePreviewMarkdown.replaceChildren();
  ui.filePreviewMarkdown.hidden = true;
  ui.filePreviewImageWrap.hidden = true;
  ui.filePreviewMessage.hidden = false;
}

function closeFilePreview() {
  filePreviewRequest += 1;
  resetFilePreviewContent();
  filePreviewContext = null;
  ui.filePreviewOverlay.hidden = true;
  document.documentElement.classList.remove("file-preview-open");
  const previousFocus = filePreviewPreviousFocus;
  filePreviewPreviousFocus = null;
  previousFocus?.focus?.();
}

async function openChatHtmlDocument(agentId, projectId, rawPath) {
  const path = cleanChatFilePath(rawPath);
  if (!projectId || !path) return;
  try {
    const query = remoteFileQuery(projectId, path, agentId);
    const response = await fetch(`/api/docs/read?${query}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiError(response));
    const result = await response.json();
    if (result.kind !== "html") throw new Error("HTML 문서가 아닙니다.");
    const resolvedProjectId = text(result.project?.id) || projectId;
    const resolvedPath = text(result.path);
    if (!resolvedPath || !localDocumentProjects().some((project) => project.id === resolvedProjectId)) {
      throw new Error("Documents에서 열 수 있는 프로젝트를 찾지 못했습니다.");
    }

    if (!ui.filePreviewOverlay.hidden) closeFilePreview();
    selectDocuments(resolvedProjectId);
    await loadDocumentList(resolvedProjectId);
    selectedDocumentPath = resolvedPath;
    expandDocumentParents(resolvedProjectId, resolvedPath);
    documentContent = null;
    documentContentKey = "";
    documentContentError = "";
    documentSidebarOpen = !isMobile();
    documentListRenderKey = "";
    renderDocuments();
    updateUrl();
    if (isMobile()) setDocumentSidebarOpen(false);
    void loadDocument(resolvedProjectId, resolvedPath);
  } catch (error) {
    showToast(`HTML 문서를 열지 못했습니다: ${error.message || error}`);
  }
}

async function openChatFilePreview(agentId, projectId, rawPath, kind) {
  if (kind === "html") {
    await openChatHtmlDocument(agentId, projectId, rawPath);
    return;
  }
  const path = cleanChatFilePath(rawPath);
  if (!projectId || !path || !["markdown", "image"].includes(kind)) return;
  const requestId = ++filePreviewRequest;
  if (ui.filePreviewOverlay.hidden) filePreviewPreviousFocus = document.activeElement;
  resetFilePreviewContent();
  ui.filePreviewOverlay.hidden = false;
  document.documentElement.classList.add("file-preview-open");
  ui.filePreviewTitle.textContent = path.split(/[\\/]/).pop() || path;
  ui.filePreviewPath.textContent = path;
  ui.filePreviewKind.textContent = kind === "markdown" ? "MARKDOWN" : "IMAGE";
  ui.filePreviewMessage.textContent = "파일을 불러오는 중…";
  ui.filePreviewClose.focus();

  try {
    const query = remoteFileQuery(projectId, path, agentId);
    if (kind === "markdown") {
      const response = await fetch(`/api/docs/read?${query}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(await apiError(response));
      const result = await response.json();
      if (requestId !== filePreviewRequest) return;
      ui.filePreviewTitle.textContent = result.name || ui.filePreviewTitle.textContent;
      ui.filePreviewPath.textContent = result.path || path;
      const resolvedProjectId = text(result.project?.id) || projectId;
      const context = {
        // Absolute paths are returned project-relative by the server. Resolve
        // their assets from that project root, not the originating session cwd.
        agentId: resolvedProjectId === projectId && !isAbsoluteChatFilePath(path) ? agentId : "",
        projectId: resolvedProjectId,
        path: result.basePath || path,
        displayPath: result.path || path,
        kind: result.kind || kind,
      };
      filePreviewContext = context;
      ui.filePreviewMarkdown.innerHTML = documentMarkdownToHtml(result.content || "");
      ui.filePreviewMessage.hidden = true;
      ui.filePreviewMarkdown.hidden = false;
      ui.filePreviewMarkdown.scrollTop = 0;
      return;
    }

    const response = await fetch(`/api/files/image?${query}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(await apiError(response));
    const blob = await response.blob();
    if (requestId !== filePreviewRequest) return;
    filePreviewContext = { agentId, projectId, path, displayPath: path, kind };
    filePreviewObjectUrl = URL.createObjectURL(blob);
    ui.filePreviewImage.src = filePreviewObjectUrl;
    ui.filePreviewImage.alt = ui.filePreviewTitle.textContent;
    ui.filePreviewMessage.hidden = true;
    ui.filePreviewImageWrap.hidden = false;
  } catch (error) {
    if (requestId !== filePreviewRequest) return;
    ui.filePreviewMessage.hidden = false;
    ui.filePreviewMessage.textContent = `파일을 열지 못했습니다: ${error.message || error}`;
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

function tokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function formatTokenCount(value) {
  return new Intl.NumberFormat("ko-KR").format(tokenCount(value));
}

function formatCompactTokenCount(value) {
  return new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(tokenCount(value));
}

function usagePeriodMeta(period) {
  return `${formatTokenCount(period?.events)}개 기록`;
}

function usageDateLabel(value) {
  const [, month = "", day = ""] = text(value).split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : text(value);
}

function usageSvgNode(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function renderUsageChart() {
  const history = usageSummary?.history || {};
  const timeline = Array.isArray(history.buckets) ? history.buckets : [];
  const total = tokenCount(history?.totals?.totalTokens);
  const maximum = Math.max(0, ...timeline.map((bucket) => tokenCount(bucket?.totalTokens)));
  ui.usageChartEmpty.hidden = maximum > 0;
  ui.usageChart.hidden = maximum <= 0;
  ui.usageChart.replaceChildren();
  if (maximum <= 0 || timeline.length === 0) return;

  const width = Math.max(360, Math.round(ui.usageChart.clientWidth || 920));
  const height = width < 600 ? 210 : 250;
  const margin = { top: 16, right: 12, bottom: 34, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const slotWidth = plotWidth / timeline.length;
  const barWidth = Math.max(4, Math.min(24, slotWidth * 0.56));
  const labelEvery = timeline.length > 20 ? 7 : 1;
  const currentKey = text(history?.range?.endDate);
  const svg = usageSvgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet",
    width: "100%",
    height,
    "aria-hidden": "true",
    focusable: "false",
  });

  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = margin.top + plotHeight * ratio;
    const value = Math.round(maximum * (1 - ratio));
    svg.appendChild(usageSvgNode("line", {
      class: "usage-chart-grid-line",
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
    }));
    const label = usageSvgNode("text", {
      class: "usage-chart-axis-label",
      x: margin.left - 8,
      y: y + 3,
      "text-anchor": "end",
    });
    label.textContent = formatCompactTokenCount(value);
    svg.appendChild(label);
  }

  timeline.forEach((bucket, index) => {
    const value = tokenCount(bucket?.totalTokens);
    const barHeight = value > 0 ? Math.max(2, (value / maximum) * plotHeight) : 0;
    const x = margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
    const y = margin.top + plotHeight - barHeight;
    const bucketKey = text(bucket?.key || bucket?.date);
    const selectedCurrent = bucketKey === currentKey
      || (history?.selection?.mode === "year" && bucketKey === currentKey.slice(0, 7));
    const bar = usageSvgNode("rect", {
      class: `usage-chart-bar${selectedCurrent ? " today" : ""}`,
      x,
      y,
      width: barWidth,
      height: barHeight,
      rx: Math.min(4, barWidth / 2),
    });
    const title = usageSvgNode("title");
    title.textContent = `${text(bucket?.label) || usageDateLabel(bucketKey)} · ${formatTokenCount(value)} 토큰 · ${formatTokenCount(bucket?.events)}개 기록`;
    bar.appendChild(title);
    svg.appendChild(bar);

    if (index === 0 || index === timeline.length - 1 || (index + 1) % labelEvery === 0) {
      const label = usageSvgNode("text", {
        class: "usage-chart-axis-label usage-chart-date-label",
        x: margin.left + index * slotWidth + slotWidth / 2,
        y: height - 9,
        "text-anchor": "middle",
      });
      label.textContent = text(bucket?.label) || usageDateLabel(bucketKey);
      svg.appendChild(label);
    }
  });

  ui.usageChart.setAttribute(
    "aria-label",
    `선택 기간 토큰 사용량 그래프. 합계 ${formatTokenCount(total)} 토큰, 최고 구간 ${formatTokenCount(maximum)} 토큰`,
  );
  ui.usageChart.appendChild(svg);
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

function usageHistoryCopy(mode) {
  if (mode === "week") return {
    heading: "주간 토큰 사용량",
    description: "연도와 주차를 선택하면 7일 사용량을 조회합니다.",
    unit: "주",
    previous: "전주",
    previousButton: "이전 주",
    currentButton: "이번 주",
    nextButton: "다음 주",
    average: "하루",
    peak: "일",
  };
  if (mode === "year") return {
    heading: "연간 토큰 사용량",
    description: "연도를 선택하면 12개월 사용량을 비교합니다.",
    unit: "연도",
    previous: "전년",
    previousButton: "이전 연도",
    currentButton: "올해",
    nextButton: "다음 연도",
    average: "월",
    peak: "월",
  };
  return {
    heading: "월간 토큰 사용량",
    description: "연도와 월을 선택하면 일별 사용량을 조회합니다.",
    unit: "달",
    previous: "전월",
    previousButton: "이전 달",
    currentButton: "이번 달",
    nextButton: "다음 달",
    average: "하루",
    peak: "일",
  };
}

function usageWeeksInYear(year) {
  const date = new Date(year, 11, 28);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - start) / 86_400_000) + 1) / 7);
}

function adjacentUsageSelection(direction, selection = usageSelection) {
  const next = { ...selection };
  if (next.mode === "year") next.year += direction;
  if (next.mode === "month") {
    next.month += direction;
    if (next.month < 1) { next.month = 12; next.year -= 1; }
    if (next.month > 12) { next.month = 1; next.year += 1; }
  }
  if (next.mode === "week") {
    next.week += direction;
    if (next.week < 1) {
      next.year -= 1;
      next.week = usageWeeksInYear(next.year);
    } else if (next.week > usageWeeksInYear(next.year)) {
      next.year += 1;
      next.week = 1;
    }
  }
  return next;
}

function canSelectUsagePeriod(selection, history = usageSummary?.history) {
  const current = history?.current || {};
  const availableYears = Array.isArray(history?.availableYears) ? history.availableYears : [];
  const latestYear = selection.mode === "week"
    ? Number(current.weekYear ?? current.year)
    : Number(current.year);
  const earliestYear = availableYears.length > 0 ? Math.min(...availableYears) : latestYear || usageNow.getFullYear();
  if (selection.year < earliestYear || selection.year > latestYear) return false;
  if (selection.year < latestYear) return true;
  if (selection.mode === "year") return true;
  if (selection.mode === "week") return selection.week <= Number(current.week);
  return selection.month <= Number(current.month);
}

function replaceSelectOptions(select, values, selectedValue, label) {
  const signature = JSON.stringify(values);
  if (select.dataset.options !== signature) {
    select.dataset.options = signature;
    select.replaceChildren(...values.map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label(value);
      return option;
    }));
  }
  select.value = String(selectedValue);
}

function renderUsageHistory() {
  const history = usageSummary?.history;
  if (!history?.selection) return;
  const copy = usageHistoryCopy(usageSelection.mode);
  const totals = history.totals || {};
  const previousTotals = history.previous?.totals || {};
  const buckets = Array.isArray(history.buckets) ? history.buckets : [];
  const quickBuckets = Array.isArray(history.quickBuckets) ? history.quickBuckets : [];
  const total = tokenCount(totals.totalTokens);
  const previousTotal = tokenCount(previousTotals.totalTokens);
  const delta = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const visibleEnd = text(history.range?.endDate);
  const visibleBuckets = buckets.filter((bucket) => {
    const key = text(bucket?.key);
    return usageSelection.mode === "year" ? key <= visibleEnd.slice(0, 7) : key <= visibleEnd;
  });
  const averageDivisor = Math.max(1, visibleBuckets.length);
  const peak = visibleBuckets.reduce((best, bucket) => (
    tokenCount(bucket?.totalTokens) > tokenCount(best?.totalTokens) ? bucket : best
  ), null);

  ui.usageHistoryTitle.textContent = copy.heading;
  ui.usageHistoryDescription.textContent = copy.description;
  ui.usageHistoryRange.textContent = `${text(history.range?.startDate)} — ${visibleEnd}`;
  ui.usagePreviousPeriod.textContent = copy.previousButton;
  ui.usageCurrentPeriod.textContent = copy.currentButton;
  ui.usageNextPeriod.textContent = copy.nextButton;
  ui.usagePreviousPeriod.disabled = !canSelectUsagePeriod(adjacentUsageSelection(-1), history);
  ui.usageNextPeriod.disabled = !canSelectUsagePeriod(adjacentUsageSelection(1), history);
  for (const button of ui.usageHistoryMode.querySelectorAll("button")) {
    button.classList.toggle("selected", button.dataset.usagePeriod === usageSelection.mode);
  }

  const years = Array.isArray(history.availableYears) && history.availableYears.length > 0
    ? history.availableYears
    : [history.current?.year || usageSelection.year];
  replaceSelectOptions(ui.usageYearSelect, years, usageSelection.year, (value) => `${value}년`);
  replaceSelectOptions(ui.usageMonthSelect, Array.from({ length: 12 }, (_, index) => index + 1), usageSelection.month, (value) => `${value}월`);
  replaceSelectOptions(ui.usageWeekSelect, Array.from({ length: usageWeeksInYear(usageSelection.year) }, (_, index) => index + 1), usageSelection.week, (value) => `${value}주차`);
  ui.usageMonthSelect.hidden = usageSelection.mode !== "month";
  ui.usageWeekSelect.hidden = usageSelection.mode !== "week";
  for (const option of ui.usageMonthSelect.options) {
    option.disabled = usageSelection.year === Number(history.current?.year) && Number(option.value) > Number(history.current?.month);
  }
  for (const option of ui.usageWeekSelect.options) {
    option.disabled = usageSelection.year === Number(history.current?.weekYear ?? history.current?.year)
      && Number(option.value) > Number(history.current?.week);
  }

  const quickRenderKey = JSON.stringify([
    usageSelection.mode,
    usageSelection.year,
    usageSelection.month,
    usageSelection.week,
    history.current,
    quickBuckets.map((bucket) => [bucket?.value, bucket?.totalTokens]),
  ]);
  if (quickRenderKey !== usageQuickRenderKey) {
    usageQuickRenderKey = quickRenderKey;
    const quickFragment = document.createDocumentFragment();
    for (const bucket of quickBuckets) {
      const value = Number(bucket?.value);
      const period = usageSelection.mode === "week"
        ? { ...usageSelection, week: value }
        : { ...usageSelection, mode: "month", month: value };
      const button = make("button");
      button.type = "button";
      button.dataset.value = String(value);
      button.disabled = !canSelectUsagePeriod(period, history);
      const selected = usageSelection.mode === "week"
        ? value === usageSelection.week
        : usageSelection.mode === "month" && value === usageSelection.month;
      button.classList.toggle("selected", selected);
      button.append(
        make("span", "", text(bucket?.label)),
        make("small", "", formatCompactTokenCount(bucket?.totalTokens)),
      );
      quickFragment.appendChild(button);
    }
    ui.usageHistoryQuick.replaceChildren(quickFragment);
    requestAnimationFrame(() => ui.usageHistoryQuick.querySelector(".selected")?.scrollIntoView({ block: "nearest", inline: "center" }));
  }

  ui.usageSelectedLabel.textContent = `선택 ${copy.unit}`;
  ui.usageSelectedTotal.textContent = formatTokenCount(total);
  ui.usageSelectedMeta.textContent = usagePeriodMeta(totals);
  ui.usageComparisonLabel.textContent = `${copy.previous} 대비`;
  ui.usageComparisonValue.textContent = delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  ui.usageComparisonValue.className = delta == null ? "" : delta >= 0 ? "usage-summary-healthy" : "usage-summary-critical";
  ui.usageComparisonMeta.textContent = `${copy.previous} 사용량 ${formatTokenCount(previousTotal)}`;
  ui.usageAverageLabel.textContent = `${copy.average} 평균`;
  ui.usageAverageValue.textContent = formatTokenCount(Math.round(total / averageDivisor));
  ui.usageAverageMeta.textContent = `${visibleBuckets.length}${usageSelection.mode === "year" ? "개월" : "일"} 집계`;
  ui.usagePeakLabel.textContent = `최고 사용${copy.peak}`;
  ui.usagePeakValue.textContent = formatTokenCount(peak?.totalTokens);
  ui.usagePeakMeta.textContent = text(peak?.label) || "—";
  ui.usageChartTitle.textContent = usageSelection.mode === "year"
    ? `${usageSelection.year}년 월별 사용량`
    : usageSelection.mode === "week"
      ? `${usageSelection.year}년 ${usageSelection.week}주차 일별 사용량`
      : `${usageSelection.year}년 ${usageSelection.month}월 일별 사용량`;
  ui.usageChartDescription.textContent = usageSelection.mode === "year"
    ? "월별 장기 추세를 비교합니다."
    : "선택 기간 안의 일별 사용량 분포입니다.";
  ui.usageChartSummary.textContent = `${visibleBuckets.length}${usageSelection.mode === "year" ? "개월" : "일"} 합계 ${formatTokenCount(total)}`;
  ui.usageBreakdownTitle.textContent = `선택 ${copy.unit} 토큰 상세`;
  ui.usageTotalTokens.textContent = formatTokenCount(totals.totalTokens);
  ui.usageInputTokens.textContent = formatTokenCount(totals.inputTokens);
  ui.usageOutputTokens.textContent = formatTokenCount(totals.outputTokens);
  ui.usageCacheReadTokens.textContent = formatTokenCount(totals.cacheReadTokens);
  ui.usageCacheWriteTokens.textContent = formatTokenCount(totals.cacheWriteTokens);
  ui.usageReasoningTokens.textContent = formatTokenCount(totals.reasoningOutputTokens);
  renderUsageChart();
}

function renderUsage() {
  const groups = usageGroups();
  const tokens = usageSummary?.tokens || {};
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
  ui.usageTokenEvents.textContent = `${formatTokenCount(tokens.events)}개 사용 기록 기준`;
  renderUsageHistory();
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
  const requestSerial = ++usageRequestSerial;
  // Keep the user's requested period stable while the previous history is
  // still rendered. renderUsage() must never be allowed to turn this request
  // back into the period from the last response.
  const requestedSelection = { ...usageSelection };
  usageLoadAttempted = true;
  usageLoading = true;
  usageRefreshing = refresh;
  usageError = "";
  renderUsage();
  try {
    const query = new URLSearchParams({
      period: requestedSelection.mode,
      year: String(requestedSelection.year),
    });
    if (requestedSelection.mode === "month") query.set("month", String(requestedSelection.month));
    if (requestedSelection.mode === "week" && requestedSelection.week != null) query.set("week", String(requestedSelection.week));
    if (refresh) query.set("refresh", "1");
    const response = await fetch(`/api/usage?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 401 || response.status === 403) {
      location.reload();
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(text(result?.error) || `HTTP ${response.status}`);
    if (requestSerial !== usageRequestSerial) return;
    usageSummary = {
      updatedAt: Number(result?.updatedAt) || 0,
      refreshPending: result?.refreshPending === true,
      limits: Array.isArray(result?.limits) ? result.limits : [],
      tokens: result?.tokens && typeof result.tokens === "object" ? result.tokens : {},
      periods: result?.periods && typeof result.periods === "object" ? result.periods : {},
      timeline: Array.isArray(result?.timeline) ? result.timeline : [],
      history: result?.history && typeof result.history === "object" ? result.history : null,
    };
    if (usageSummary.history?.selection) {
      usageSelection = { ...usageSelection, ...usageSummary.history.selection };
    }
    usageLoadedAt = Date.now();
    window.clearTimeout(usageRefreshPollTimer);
    if (usageSummary.refreshPending) {
      usageRefreshPollTimer = window.setTimeout(() => {
        if (selection.type === "usage" && !usageLoading) void loadUsage(false);
      }, 1_000);
    }
  } catch (error) {
    if (requestSerial !== usageRequestSerial) return;
    usageError = error instanceof Error ? error.message : String(error);
  } finally {
    if (requestSerial !== usageRequestSerial) return;
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
  syncDocumentSidebar();
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
  const screen = screenGroups().find((candidate) => candidate.id === id);
  if (!screen) return;
  if (isMobile()) {
    const agentId = preferredSessionId(screen);
    if (agentId) selectSession(agentId);
    return;
  }
  selection = { type: "screen", id };
  returnScreenId = id;
  mobilePaneId = null;
  screenRenderKey = "";
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
}

function availableSessionTools() {
  const known = new Map([
    ["claude", { id: "claude", label: "Claude Code", supportsDangerous: true }],
    ["codex", { id: "codex", label: "Codex", supportsDangerous: true }],
    ["qwen", { id: "qwen", label: "Qwen", supportsDangerous: true }],
    ["cline", { id: "cline", label: "Cline", supportsDangerous: false }],
    ["none", { id: "none", label: "Shell only", supportsDangerous: false }],
  ]);
  const configured = remoteState.view?.availableTools;
  if (!Array.isArray(configured)) return [...known.values()];
  return configured.flatMap((candidate) => {
    const tool = known.get(text(candidate?.id));
    if (!tool) return [];
    return [{
      ...tool,
      label: text(candidate?.label) || tool.label,
      supportsDangerous: tool.supportsDangerous && Boolean(candidate?.supportsDangerous),
    }];
  });
}

function nextRemoteSessionName(projectId) {
  const count = allAgents().filter((agent) => agent.projectId === projectId).length;
  return `Session ${count + 1}`;
}

function syncSessionEditorDangerous() {
  const tool = availableSessionTools().find((candidate) => candidate.id === ui.sessionEditorTool.value);
  const supported = Boolean(tool?.supportsDangerous);
  ui.sessionEditorDangerousField.hidden = !supported;
  if (!supported) ui.sessionEditorDangerous.checked = false;
}

function setSessionEditorBusy(busy) {
  for (const control of ui.sessionEditorForm.elements) control.disabled = busy;
  ui.sessionEditorSubmit.textContent = busy
    ? "처리 중…"
    : sessionEditorMode === "rename" ? "저장" : "생성";
}

function closeSessionEditor() {
  if (ui.sessionEditorOverlay.hidden) return;
  ui.sessionEditorOverlay.hidden = true;
  sessionEditorMode = null;
  sessionEditorAgentId = null;
  ui.sessionEditorMessage.hidden = true;
  setSessionEditorBusy(false);
  const previousFocus = sessionEditorPreviousFocus;
  sessionEditorPreviousFocus = null;
  previousFocus?.focus?.();
}

function openCreateSessionEditor() {
  const projects = Array.isArray(remoteState.view?.projects)
    ? remoteState.view.projects.filter((project) => text(project?.id))
    : [];
  const tools = availableSessionTools();
  if (projects.length === 0) {
    showToast("세션을 생성할 프로젝트가 없습니다.");
    return;
  }
  if (tools.length === 0) {
    showToast("설정에서 사용할 AI 도구를 먼저 활성화해 주세요.");
    return;
  }
  sessionEditorPreviousFocus = document.activeElement;
  sessionEditorMode = "create";
  sessionEditorAgentId = null;
  ui.sessionEditorTitle.textContent = "새 세션";
  ui.sessionEditorProjectField.hidden = false;
  ui.sessionEditorToolField.hidden = false;
  ui.sessionEditorSubmit.textContent = "생성";
  ui.sessionEditorMessage.hidden = true;

  const selectedProjectId = selectedAgent()?.projectId
    || text(remoteState.view?.activeProjectId)
    || projects[0].id;
  ui.sessionEditorProject.replaceChildren(...projects.map((project) => {
    const option = make("option", "", text(project.name) || project.id);
    option.value = project.id;
    return option;
  }));
  ui.sessionEditorProject.value = projects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : projects[0].id;
  ui.sessionEditorTool.replaceChildren(...tools.map((tool) => {
    const option = make("option", "", tool.label);
    option.value = tool.id;
    return option;
  }));
  ui.sessionEditorTool.value = tools[0].id;
  ui.sessionEditorName.value = nextRemoteSessionName(ui.sessionEditorProject.value);
  ui.sessionEditorDangerous.checked = false;
  syncSessionEditorDangerous();
  ui.sessionEditorOverlay.hidden = false;
  ui.sessionEditorName.focus();
  ui.sessionEditorName.select();
}

function openRenameSessionEditor() {
  const agent = selectedAgent();
  if (!agent) return;
  sessionEditorPreviousFocus = document.activeElement;
  sessionEditorMode = "rename";
  sessionEditorAgentId = agent.id;
  ui.sessionEditorTitle.textContent = "세션 이름 변경";
  ui.sessionEditorProjectField.hidden = true;
  ui.sessionEditorToolField.hidden = true;
  ui.sessionEditorDangerousField.hidden = true;
  ui.sessionEditorSubmit.textContent = "저장";
  ui.sessionEditorMessage.hidden = true;
  ui.sessionEditorName.value = text(agent.name || agent.id);
  ui.sessionEditorOverlay.hidden = false;
  ui.sessionEditorName.focus();
  ui.sessionEditorName.select();
}

async function waitForCreatedSession(id) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 120 : 300));
    await fetchState({ quiet: true });
    if (agentMap().has(id)) {
      selectSession(id);
      return true;
    }
  }
  return false;
}

async function submitSessionEditor() {
  if (!sessionEditorMode) return;
  const name = ui.sessionEditorName.value.trim();
  if (!name) {
    ui.sessionEditorMessage.textContent = "세션 이름을 입력해 주세요.";
    ui.sessionEditorMessage.hidden = false;
    ui.sessionEditorName.focus();
    return;
  }
  setSessionEditorBusy(true);
  ui.sessionEditorMessage.hidden = true;
  try {
    const creating = sessionEditorMode === "create";
    const body = creating
      ? {
          projectId: ui.sessionEditorProject.value,
          name,
          aiToolId: ui.sessionEditorTool.value,
          dangerous: ui.sessionEditorDangerous.checked,
        }
      : { id: sessionEditorAgentId, name };
    const response = await fetch(
      creating ? "/api/session/create" : "/api/session/rename",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error(await apiError(response));
    const result = await response.json();
    if (!creating) {
      remoteState.agents = remoteState.agents.map((agent) => (
        agent.id === body.id ? { ...agent, name } : agent
      ));
      remoteState.view.agents = remoteState.view.agents.map((agent) => (
        agent.id === body.id ? { ...agent, name } : agent
      ));
      renderNavigation();
      renderSelection();
    }
    closeSessionEditor();
    showToast(creating ? "새 세션을 생성하고 있습니다." : "세션 이름을 변경했습니다.");
    if (creating && result.id) {
      if (!(await waitForCreatedSession(result.id))) {
        showToast("세션 생성 요청은 전달됐지만 아직 목록에 나타나지 않았습니다.");
      }
    } else {
      setTimeout(() => { void fetchState({ quiet: true }); }, 250);
    }
  } catch (error) {
    setSessionEditorBusy(false);
    ui.sessionEditorMessage.textContent = error.message || String(error);
    ui.sessionEditorMessage.hidden = false;
  }
}

function selectSession(id, fromScreenId = null) {
  if (!agentMap().has(id)) return;
  selection = { type: "session", id };
  returnScreenId = isMobile() ? null : fromScreenId;
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
    documentSidebarOpen = true;
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
  if (text === "/clear") clearRemoteChatHistory(agentId);
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

// ---- Shared desktop browser relay ----
// The desktop owns one persistent Electron browser profile. Remote only receives
// short-lived JPEG frames plus a constrained set of human input events; cookies,
// storage and DOM snapshots never cross this API boundary.
function remoteBrowserTab() {
  return remoteBrowser.tabs.find((tab) => tab.tabId === remoteBrowser.activeTabId) || null;
}

function setRemoteBrowserMessage(message) {
  if (!ui.browserMessage) return;
  ui.browserMessage.textContent = message || "";
  ui.browserMessage.hidden = !message;
}

function renderRemoteBrowserChrome() {
  const tab = remoteBrowserTab();
  const key = remoteBrowser.tabs.map((item) => `${item.tabId}:${item.title}:${item.url}`).join("|");
  if (ui.browserTabSelect && key !== remoteBrowser.tabsKey) {
    remoteBrowser.tabsKey = key;
    const fragment = document.createDocumentFragment();
    for (const item of remoteBrowser.tabs) {
      const option = document.createElement("option");
      option.value = item.tabId;
      option.textContent = item.title || item.url || "새 탭";
      fragment.appendChild(option);
    }
    ui.browserTabSelect.replaceChildren(fragment);
  }
  if (ui.browserTabSelect) {
    ui.browserTabSelect.disabled = remoteBrowser.tabs.length === 0;
    ui.browserTabSelect.value = remoteBrowser.activeTabId;
  }
  if (ui.browserBackButton) ui.browserBackButton.disabled = !tab?.canGoBack;
  if (ui.browserForwardButton) ui.browserForwardButton.disabled = !tab?.canGoForward;
  if (ui.browserReloadButton) ui.browserReloadButton.disabled = !tab;
  if (ui.browserAddressInput && document.activeElement !== ui.browserAddressInput) {
    ui.browserAddressInput.value = tab?.url === "about:blank" ? "" : (tab?.url || "");
  }
  if (!tab) {
    if (ui.browserFrame) ui.browserFrame.hidden = true;
    setRemoteBrowserMessage("사용할 수 있는 내장 브라우저 탭이 없습니다.");
  }
}

function resetRemoteBrowserFrame() {
  clearTimeout(remoteBrowser.frameTimer);
  remoteBrowser.frameTimer = null;
  remoteBrowser.frameAbort?.abort();
  remoteBrowser.frameAbort = null;
  remoteBrowser.frameLoading = false;
  remoteBrowser.pointer = null;
  if (remoteBrowser.frameObjectUrl) URL.revokeObjectURL(remoteBrowser.frameObjectUrl);
  remoteBrowser.frameObjectUrl = "";
  remoteBrowser.frameWidth = 0;
  remoteBrowser.frameHeight = 0;
  remoteBrowser.sourceWidth = 0;
  remoteBrowser.sourceHeight = 0;
  if (ui.browserFrame) {
    ui.browserFrame.removeAttribute("src");
    ui.browserFrame.hidden = true;
  }
}

function stopRemoteBrowser({ reset = false } = {}) {
  clearTimeout(remoteBrowser.frameTimer);
  remoteBrowser.frameTimer = null;
  remoteBrowser.frameAbort?.abort();
  remoteBrowser.frameAbort = null;
  remoteBrowser.frameLoading = false;
  remoteBrowser.pointer = null;
  if (reset) {
    resetRemoteBrowserFrame();
    remoteBrowser.agentId = "";
    remoteBrowser.tabs = [];
    remoteBrowser.activeTabId = "";
    remoteBrowser.tabsKey = "";
    remoteBrowser.statusAt = 0;
    renderRemoteBrowserChrome();
  }
}

async function fetchRemoteBrowserTabs(agentId, { force = false } = {}) {
  if (!agentId || remoteBrowser.statusLoading) return;
  if (!force && Date.now() - remoteBrowser.statusAt < 1_800 && remoteBrowser.tabs.length) return;
  remoteBrowser.statusLoading = true;
  try {
    const query = new URLSearchParams({ agentId });
    const response = await fetch(`/api/browser/tabs?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || `HTTP ${response.status}`);
    if (remoteBrowser.agentId !== agentId) return;
    remoteBrowser.tabs = Array.isArray(result.tabs) ? result.tabs : [];
    remoteBrowser.activeTabId = remoteBrowser.tabs.some((tab) => tab.tabId === result.activeTabId)
      ? result.activeTabId
      : remoteBrowser.tabs[0]?.tabId || "";
    remoteBrowser.statusAt = Date.now();
    renderRemoteBrowserChrome();
  } catch (error) {
    if (remoteBrowser.agentId === agentId) {
      setRemoteBrowserMessage(`브라우저 연결 실패: ${error.message || error}`);
    }
  } finally {
    remoteBrowser.statusLoading = false;
  }
}

function scheduleRemoteBrowserFrame(delay = 0) {
  clearTimeout(remoteBrowser.frameTimer);
  remoteBrowser.frameTimer = null;
  if (
    selection.type !== "session"
    || sessionViewMode !== "browser"
    || !remoteBrowser.agentId
  ) return;
  remoteBrowser.frameTimer = setTimeout(() => { void loadRemoteBrowserFrame(); }, delay);
}

async function loadRemoteBrowserFrame() {
  if (remoteBrowser.frameLoading || selection.type !== "session" || sessionViewMode !== "browser") return;
  const agentId = remoteBrowser.agentId;
  if (document.hidden) {
    scheduleRemoteBrowserFrame(1_500);
    return;
  }
  if (Date.now() - remoteBrowser.statusAt >= 1_800 || !remoteBrowser.activeTabId) {
    await fetchRemoteBrowserTabs(agentId, { force: true });
  }
  const tab = remoteBrowserTab();
  if (!tab || remoteBrowser.agentId !== agentId) {
    scheduleRemoteBrowserFrame(1_000);
    return;
  }
  remoteBrowser.frameLoading = true;
  const controller = new AbortController();
  remoteBrowser.frameAbort = controller;
  try {
    const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const viewportWidth = ui.browserViewport?.clientWidth || window.innerWidth || 720;
    const viewportHeight = ui.browserViewport?.clientHeight || window.innerHeight || 720;
    const query = new URLSearchParams({
      agentId,
      tabId: tab.tabId,
      quality: isMobile() ? "58" : "66",
      maxWidth: String(Math.min(2_048, Math.max(720, Math.round(viewportWidth * pixelRatio)))),
      maxHeight: String(Math.min(2_048, Math.max(720, Math.round(viewportHeight * pixelRatio)))),
    });
    const response = await fetch(`/api/browser/frame?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await apiError(response));
    const blob = await response.blob();
    if (remoteBrowser.agentId !== agentId || remoteBrowser.activeTabId !== tab.tabId) return;
    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = remoteBrowser.frameObjectUrl;
    remoteBrowser.frameObjectUrl = nextUrl;
    remoteBrowser.frameWidth = Number(response.headers.get("x-browser-frame-width")) || 0;
    remoteBrowser.frameHeight = Number(response.headers.get("x-browser-frame-height")) || 0;
    remoteBrowser.sourceWidth = Number(response.headers.get("x-browser-source-width")) || remoteBrowser.frameWidth;
    remoteBrowser.sourceHeight = Number(response.headers.get("x-browser-source-height")) || remoteBrowser.frameHeight;
    ui.browserFrame.src = nextUrl;
    ui.browserFrame.hidden = false;
    setRemoteBrowserMessage("");
    if (previousUrl) URL.revokeObjectURL(previousUrl);
  } catch (error) {
    if (error?.name !== "AbortError") {
      setRemoteBrowserMessage(`화면을 불러오지 못했습니다: ${error.message || error}`);
    }
  } finally {
    if (remoteBrowser.frameAbort === controller) remoteBrowser.frameAbort = null;
    remoteBrowser.frameLoading = false;
    const currentTab = remoteBrowserTab();
    scheduleRemoteBrowserFrame(currentTab?.loading ? 300 : 800);
  }
}

async function remoteBrowserAction(action, payload = {}) {
  const agentId = remoteBrowser.agentId || selectedAgent()?.id;
  if (!agentId) return null;
  try {
    const response = await fetch("/api/browser/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId,
        action,
        ...(action === "open" ? {} : { tabId: remoteBrowser.activeTabId }),
        ...payload,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || `HTTP ${response.status}`);
    if (result.tab?.tabId) remoteBrowser.activeTabId = result.tab.tabId;
    const changesChrome = ["open", "navigate", "activate", "back", "forward", "reload"].includes(action);
    if (changesChrome || action === "pointer") remoteBrowser.statusAt = 0;
    if (changesChrome) await fetchRemoteBrowserTabs(agentId, { force: true });
    scheduleRemoteBrowserFrame(0);
    return result;
  } catch (error) {
    showToast(`브라우저 조작 실패: ${error.message || error}`);
    return null;
  }
}

function normalizeRemoteBrowserAddress(value) {
  const input = String(value || "").trim();
  if (!input) return "https://www.google.com/";
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) return input;
  if (/\s/.test(input) || (!/[.:]/.test(input) && input.toLowerCase() !== "localhost")) {
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }
  return `http://${input}`;
}

function browserFrameMetrics() {
  const rect = ui.browserViewport?.getBoundingClientRect();
  const frameWidth = remoteBrowser.frameWidth;
  const frameHeight = remoteBrowser.frameHeight;
  if (!rect || !frameWidth || !frameHeight || !rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / frameWidth, rect.height / frameHeight);
  const drawWidth = frameWidth * scale;
  const drawHeight = frameHeight * scale;
  return {
    rect,
    scale,
    drawWidth,
    drawHeight,
    offsetX: (rect.width - drawWidth) / 2,
    offsetY: 0,
  };
}

function remoteBrowserPoint(clientX, clientY) {
  const metrics = browserFrameMetrics();
  if (!metrics) return null;
  const localX = clientX - metrics.rect.left - metrics.offsetX;
  const localY = clientY - metrics.rect.top - metrics.offsetY;
  if (localX < 0 || localY < 0 || localX > metrics.drawWidth || localY > metrics.drawHeight) return null;
  const frameX = localX / metrics.scale;
  const frameY = localY / metrics.scale;
  return {
    x: Math.round(frameX * remoteBrowser.sourceWidth / remoteBrowser.frameWidth),
    y: Math.round(frameY * remoteBrowser.sourceHeight / remoteBrowser.frameHeight),
    metrics,
  };
}

function startRemoteBrowser(agent) {
  if (!agent) return;
  if (remoteBrowser.agentId !== agent.id) {
    stopRemoteBrowser({ reset: true });
    remoteBrowser.agentId = agent.id;
    setRemoteBrowserMessage("PC 내장 브라우저를 연결하는 중…");
  }
  void fetchRemoteBrowserTabs(agent.id).then(() => scheduleRemoteBrowserFrame(0));
}

// ---- Conversation (chat) view ----
// Renders an agent's own transcript (via /api/chat) as a chat instead of the
// width-constrained terminal. Default on; the session view toggles chat/term.
const storedSessionViewMode = localStorage.getItem("multiagent.remote.sessionMode");
let sessionViewMode = ["chat", "term", "browser"].includes(storedSessionViewMode)
  ? storedSessionViewMode
  : "chat";
let chatRequestSeq = 0;

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const CHAT_FILE_PATH_RE = /(?:\/?[A-Za-z]:[\\/])?(?:\.{1,2}[\\/])?(?:[^\s"'<>|:*?()[\]{},;]+[\\/])*[^\s"'<>|:*?()[\]{},;]+\.(?:md|markdown|html?|png|jpe?g|gif|webp|bmp|svg|ico)(?::\d+(?::\d+)?)?/gi;

function cleanChatFilePath(value) {
  let result = String(value ?? "").trim()
    .replace(/^[<`"']+/, "")
    .replace(/[>`"']+$/, "")
    .replace(/(:\d+)(?::\d+)?$/, "")
    .split(/[?#]/)[0];
  try { result = decodeURIComponent(result); } catch {}
  result = result.trim();
  return /^\/[A-Za-z]:[\\/]/.test(result) ? result.slice(1) : result;
}

function isAbsoluteChatFilePath(value) {
  return /^[A-Za-z]:[\\/]/.test(cleanChatFilePath(value));
}

function chatFileKind(value) {
  const path = cleanChatFilePath(value);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return null;
  if (/\.(?:md|markdown)$/i.test(path)) return "markdown";
  if (/\.(?:html|htm)$/i.test(path)) return "html";
  if (/\.(?:png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(path)) return "image";
  return null;
}

function chatFileMarkup(rawPath, label, agent, { code = false } = {}) {
  const kind = chatFileKind(rawPath);
  const agentId = text(agent?.id);
  const projectId = text(agent?.projectId);
  const path = cleanChatFilePath(rawPath);
  const safeLabel = escapeHtml(label || path);
  if (!kind || !agentId || !projectId || !path) return code ? `<code>${safeLabel}</code>` : safeLabel;
  return `<button type="button" class="chat-file-link${code ? " chat-file-code" : ""}" data-chat-file-agent="${escapeHtml(agentId)}" data-chat-file-project="${escapeHtml(projectId)}" data-chat-file-path="${escapeHtml(path)}" data-chat-file-kind="${kind}" title="${escapeHtml(path)}">${safeLabel}</button>`;
}

function inlineMd(text, agent = null) {
  const tokens = [];
  const stash = (html) => {
    const token = `\u0000CHAT${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };
  let source = String(text ?? "");
  source = source.replace(/`([^`\n]+)`/g, (_match, code) => (
    chatFileKind(code)
      ? stash(chatFileMarkup(code, code, agent, { code: true }))
      : stash(`<code>${escapeHtml(code)}</code>`)
  ));
  source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawTarget) => {
    const target = String(rawTarget).trim().replace(/^<|>$/g, "");
    if (/^https?:\/\//i.test(target)) {
      return stash(`<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    }
    return chatFileKind(target) ? stash(chatFileMarkup(target, label, agent)) : match;
  });
  source = source.replace(/https?:\/\/[^\s<]+/g, (url) => (
    stash(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)
  ));
  source = source.replace(CHAT_FILE_PATH_RE, (path) => stash(chatFileMarkup(path, path, agent, { code: true })));
  let out = escapeHtml(source);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\u0000CHAT(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
  return out;
}
function mdToHtml(text, agent = null) {
  const lines = String(text).split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) { closeList(); html += `<h4>${inlineMd(heading[2], agent)}</h4>`; }
    else if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inlineMd(bullet[1], agent)}</li>`; }
    else if (!line.trim()) { closeList(); }
    else { closeList(); html += `<p>${inlineMd(line, agent)}</p>`; }
  }
  closeList();
  return html;
}

function renderChatUser(text, agent) {
  const node = make("div", "chat-user");
  node.innerHTML = inlineMd(text, agent);
  return node;
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

function renderAssistantTurn(run, agent = null) {
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
      md.innerHTML = mdToHtml(block.text, agent);
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
// /api/chat intentionally sends a bounded transcript tail. Keep already-seen
// blocks per session in this page so older turns do not disappear as that tail
// window advances during a long-running conversation.
const chatHistoryStore = new Map();
const rawChatKeys = new Map();
const pendingChatClears = new Map();

function chatBlockKey(block) {
  return JSON.stringify(block);
}

function mergeChatHistory(previous, incoming) {
  if (!incoming.length) return previous;
  if (!previous.length) return incoming.slice();
  const previousOffset = Math.max(0, previous.length - incoming.length);
  const previousKeys = previous.slice(previousOffset).map(chatBlockKey);
  const incomingKeys = incoming.map(chatBlockKey);
  const maxOverlap = Math.min(previousKeys.length, incomingKeys.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const previousStart = previousKeys.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (previousKeys[previousStart + index] !== incomingKeys[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return previous.concat(incoming.slice(overlap));
  }
  return previous.concat(incoming);
}

function rawChatKey(blocks) {
  if (!blocks.length) return "0";
  return `${blocks.length}|${chatBlockKey(blocks[0])}|${chatBlockKey(blocks[blocks.length - 1])}`;
}

function clearRemoteChatHistory(agentId) {
  pendingChatClears.set(agentId, rawChatKeys.get(agentId) || "0");
  chatHistoryStore.delete(agentId);
  if (chatAgent === agentId) {
    lastChatData = { blocks: [], missing: true };
    lastChatKey = "";
    renderChat(lastChatData);
  }
}

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
    const agent = selectedAgent();
    for (const range of ranges.slice(hidden)) {
      if (range.user) {
        const turn = make("div", "chat-turn user");
        turn.appendChild(renderChatUser(blocks[range.start].text, agent));
        frag.appendChild(turn);
      } else {
        frag.appendChild(renderAssistantTurn(blocks.slice(range.start, range.end), agent));
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
    lastChatKey = "";
    lastChatData = chatHistoryStore.get(agentId)?.data || null;
    if (lastChatData) renderChat(lastChatData);
  }
  const seq = ++chatRequestSeq;
  try {
    const response = await fetch(`/api/chat?id=${encodeURIComponent(agentId)}`, { credentials: "same-origin" });
    let data = await response.json().catch(() => ({ blocks: [] }));
    if (!response.ok) data = { blocks: [], error: true };
    if (seq !== chatRequestSeq) return; // a newer request superseded this one
    const cached = chatHistoryStore.get(agentId);
    if (data?.error && cached?.data) {
      // An HTTP failure is transient just like a network exception: keep the
      // last conversation visible instead of replacing it with an error card.
      lastChatData = cached.data;
      return;
    }
    const incoming = Array.isArray(data?.blocks) ? data.blocks : [];
    const incomingKey = rawChatKey(incoming);
    const pendingClearKey = pendingChatClears.get(agentId);
    if (pendingClearKey !== undefined) {
      if (incomingKey === pendingClearKey) return;
      pendingChatClears.delete(agentId);
    }
    rawChatKeys.set(agentId, incomingKey);
    const sessionChanged = Boolean(
      data?.sessionId && cached?.sessionId && data.sessionId !== cached.sessionId
    );
    const previous = sessionChanged ? [] : (cached?.data?.blocks || []);
    const blocks = data?.unsupported || data?.error
      ? incoming
      : mergeChatHistory(previous, incoming);
    if (!data?.unsupported && !data?.error && blocks.length) {
      data = { ...data, blocks, missing: false };
      chatHistoryStore.set(agentId, { sessionId: data.sessionId || cached?.sessionId, data });
    } else if (data?.missing && previous.length) {
      data = { ...cached.data, lifecycle: data.lifecycle ?? cached.data.lifecycle };
    }
    const last = blocks[blocks.length - 1];
    // Skip re-render when nothing changed so opened tool/▸ details stay open.
    const key = `${agentId}|${blocks.length}|${String(last?.text ?? last?.output ?? "").length}|${data?.lifecycle || ""}|${data?.unsupported ? 1 : 0}|${data?.missing ? 1 : 0}|${data?.error ? 1 : 0}`;
    if (key === lastChatKey) return;
    lastChatKey = key;
    renderChat(data);
  } catch {
    // Keep the last rendered conversation on a transient error.
  }
}

// Show chat or terminal for the session view; refresh the active one.
function syncSessionView() {
  if (selection.type !== "session") {
    stopRemoteBrowser();
    return;
  }
  const agent = selectedAgent();
  syncQueueAgent(agent);
  renderComposerAttachments();
  const chat = sessionViewMode === "chat";
  const browser = sessionViewMode === "browser";
  ui.appShell.dataset.sessionMode = sessionViewMode;
  if (ui.chatView) ui.chatView.hidden = !chat;
  if (ui.outputPanel) ui.outputPanel.hidden = sessionViewMode !== "term";
  if (ui.browserPanel) ui.browserPanel.hidden = !browser;
  if (ui.composerForm) ui.composerForm.hidden = browser;
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
  if (browser && agent) startRemoteBrowser(agent);
  else stopRemoteBrowser();
}
let lastChatStatusSig = "";

function setSessionViewMode(mode) {
  sessionViewMode = ["chat", "term", "browser"].includes(mode) ? mode : "chat";
  localStorage.setItem("multiagent.remote.sessionMode", sessionViewMode);
  lastChatFetch = { id: null, at: 0 };
  syncTerminal();
  syncSessionView();
  updateComposerSendState();
}

function applyScreenAvailability() {
  const mobile = isMobile();
  if (ui.screensSection) ui.screensSection.hidden = mobile;
  ui.searchInput.placeholder = mobile
    ? "프로젝트 · 세션 검색"
    : "Screen · 프로젝트 · 세션 검색";
}

async function showNotification(title, body, tag, agentId) {
  if (!("Notification" in window)
    || localStorage.getItem("multiagent.remote.notifications") !== "on"
    || window.Notification.permission !== "granted"
    || (backgroundPushEnabled && /^(?:done|question):/.test(String(tag)))) return;
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

function preferredSessionId(screen = null) {
  const ids = screen?.memberIds?.length
    ? screen.memberIds
    : allAgents().map((agent) => agent.id);
  const agents = ids.map((id) => agentMap().get(id)).filter(Boolean);
  return agents.find((agent) => statusOf(agent) !== "offline")?.id
    || agents[0]?.id
    || null;
}

function defaultWorkspaceSelection() {
  if (!isMobile()) {
    const screen = screenGroups()[0];
    if (screen) return { type: "screen", id: screen.id };
  }
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
  if (selection.type === "screen") {
    const screen = screenGroups().find((candidate) => candidate.id === selection.id);
    if (isMobile()) {
      const agentId = preferredSessionId(screen);
      selection = agentId ? { type: "session", id: agentId } : defaultWorkspaceSelection();
      returnScreenId = null;
      mobilePaneId = null;
      screenRenderKey = "";
    } else if (!screen) {
      selection = defaultWorkspaceSelection();
    }
  }
  if (selection.type === "documents" && !localDocumentProjects().some((project) => project.id === selection.id)) {
    const fallback = localDocumentProjects()[0];
    selection = fallback ? { type: "documents", id: fallback.id } : defaultWorkspaceSelection();
    selectedDocumentPath = null;
  }
  returnScreenId = !isMobile() && selection.type === "screen" ? selection.id : returnScreenId;
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

let nativeSessionAccessPending = false;
async function ensureNativeSessionAccess(detail) {
  if (
    detail?.active ||
    nativeSessionAccessPending ||
    !window.__MULTIAGENT_NATIVE_APP__ ||
    !window.ReactNativeWebView?.postMessage
  ) return;
  nativeSessionAccessPending = true;
  try {
    const response = await fetch("/api/mobile/device", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return;
    const registration = await response.json();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "multiagent:register-native-session-access",
      token: text(registration.token),
    }));
  } catch {
    // The native hub will report this profile as login-required/offline and can
    // retry the next time the authenticated Remote page is opened.
  } finally {
    nativeSessionAccessPending = false;
  }
}

async function enableNotifications() {
  if (window.__MULTIAGENT_NATIVE_APP__ && window.ReactNativeWebView?.postMessage) {
    if (backgroundPushEnabled) {
      stopNativeMonitor();
      ui.notifyButton.classList.remove("enabled");
      ui.notifyButton.title = "휴대폰 모니터링 꺼짐";
      showToast("백그라운드 모니터링을 중지했습니다.");
      return;
    }
    try {
      const response = await fetch("/api/monitor/device", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const registration = await response.json();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "multiagent:start-native-monitor",
        token: text(registration.token),
        cursor: Number(registration.cursor) || 0,
      }));
      showToast("백그라운드 모니터링을 시작하는 중입니다.");
    } catch {
      showToast("알림 전용 기기 토큰을 발급하지 못했습니다.");
    }
    return;
  }
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

function applyNativeMonitorState(detail) {
  if (!detail?.ok) {
    backgroundPushEnabled = false;
    ui.notifyButton.classList.remove("enabled");
    ui.notifyButton.title = "휴대폰 모니터링 꺼짐";
    if (detail?.userInitiated) showToast(text(detail?.error) || "백그라운드 모니터링을 시작하지 못했습니다.");
    return;
  }
  backgroundPushEnabled = Boolean(detail.active);
  ui.notifyButton.classList.toggle("enabled", backgroundPushEnabled);
  ui.notifyButton.title = backgroundPushEnabled
    ? "휴대폰 백그라운드 모니터링 켜짐"
    : "휴대폰 모니터링 꺼짐";
  if (backgroundPushEnabled) {
    localStorage.setItem("multiagent.remote.notifications", "on");
    if (detail?.userInitiated) showToast("고정 알림이 표시되는 동안 완료와 응답 필요 알림을 받습니다.");
  } else {
    localStorage.removeItem("multiagent.remote.notifications");
  }
}

function stopNativeMonitor() {
  if (!window.__MULTIAGENT_NATIVE_APP__ || !window.ReactNativeWebView?.postMessage) return;
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: "multiagent:stop-native-monitor",
    revoke: true,
  }));
  backgroundPushEnabled = false;
  localStorage.removeItem("multiagent.remote.notifications");
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
ui.usageHistoryMode.addEventListener("click", (event) => {
  const mode = event.target.closest("button")?.dataset.usagePeriod;
  if (!["week", "month", "year"].includes(mode) || mode === usageSelection.mode) return;
  const current = usageSummary?.history?.current || {
    year: usageNow.getFullYear(),
    month: usageNow.getMonth() + 1,
    week: usageSelection.week || 1,
  };
  usageSelection = { ...usageSelection, mode };
  if (mode === "week") {
    const currentWeekYear = Number(current.weekYear ?? current.year);
    usageSelection.year = Math.min(usageSelection.year, currentWeekYear);
    usageSelection.week = usageSelection.year === currentWeekYear
      ? Number(current.week)
      : Math.min(Number(usageSelection.week) || 1, usageWeeksInYear(usageSelection.year));
  }
  if (mode !== "week") usageSelection.year = Math.min(usageSelection.year, Number(current.year));
  if (mode === "month" && usageSelection.year === Number(current.year)) usageSelection.month = Math.min(usageSelection.month, Number(current.month));
  void loadUsage();
});
ui.usageYearSelect.addEventListener("change", () => {
  const current = usageSummary?.history?.current || {};
  usageSelection.year = Number(ui.usageYearSelect.value);
  usageSelection.week = Math.min(Number(usageSelection.week) || 1, usageWeeksInYear(usageSelection.year));
  if (usageSelection.year === Number(current.year)) {
    usageSelection.month = Math.min(usageSelection.month, Number(current.month));
  }
  if (usageSelection.mode === "week" && usageSelection.year === Number(current.weekYear ?? current.year)) {
    usageSelection.week = Math.min(usageSelection.week || Number(current.week), Number(current.week));
  }
  void loadUsage();
});
ui.usageMonthSelect.addEventListener("change", () => {
  usageSelection.month = Number(ui.usageMonthSelect.value);
  void loadUsage();
});
ui.usageWeekSelect.addEventListener("change", () => {
  usageSelection.week = Number(ui.usageWeekSelect.value);
  void loadUsage();
});
ui.usagePreviousPeriod.addEventListener("click", () => {
  usageSelection = adjacentUsageSelection(-1);
  void loadUsage();
});
ui.usageNextPeriod.addEventListener("click", () => {
  const next = adjacentUsageSelection(1);
  if (!canSelectUsagePeriod(next)) return;
  usageSelection = next;
  void loadUsage();
});
ui.usageCurrentPeriod.addEventListener("click", () => {
  const current = usageSummary?.history?.current || {};
  usageSelection = {
    ...usageSelection,
    year: usageSelection.mode === "week"
      ? Number(current.weekYear ?? current.year) || usageNow.getFullYear()
      : Number(current.year) || usageNow.getFullYear(),
    month: Number(current.month) || usageNow.getMonth() + 1,
    week: Number(current.week) || usageSelection.week,
  };
  void loadUsage();
});
ui.usageHistoryQuick.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-value]");
  if (!button || button.disabled) return;
  const value = Number(button.dataset.value);
  if (usageSelection.mode === "week") usageSelection.week = value;
  else {
    usageSelection.mode = "month";
    usageSelection.month = value;
  }
  void loadUsage();
});
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
ui.documentOpenHtmlButton.addEventListener("click", () => {
  if (selection.type !== "documents" || !selectedDocumentPath) return;
  void openRemoteHtmlPreview(selection.id, selectedDocumentPath);
});
ui.documentMarkdown.addEventListener("click", (event) => {
  const link = event.target.closest("[data-document-link]");
  if (!link || selection.type !== "documents" || !selectedDocumentPath) return;
  event.preventDefault();
  let target = String(link.dataset.documentLink || "").replaceAll("\\", "/").split(/[?#]/)[0];
  try { target = decodeURIComponent(target); } catch {}
  const targetKind = chatFileKind(target);
  if (!targetKind) return;
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
  if (targetKind === "image") {
    void openChatFilePreview("", selection.id, resolved, targetKind);
    return;
  }
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
  if (isMobile()) setDocumentSidebarOpen(false);
});
ui.documentSidebarToggle.addEventListener("click", () => {
  setDocumentSidebarOpen(!documentSidebarOpen);
});
ui.documentSidebarClose.addEventListener("click", () => setDocumentSidebarOpen(false));
ui.documentSidebarBackdrop.addEventListener("click", () => setDocumentSidebarOpen(false));
ui.appShell.addEventListener("click", (event) => {
  const link = event.target.closest(".chat-file-link");
  if (!link) return;
  event.preventDefault();
  void openChatFilePreview(
    String(link.dataset.chatFileAgent || ""),
    String(link.dataset.chatFileProject || ""),
    String(link.dataset.chatFilePath || ""),
    String(link.dataset.chatFileKind || ""),
  );
});
ui.filePreviewMarkdown.addEventListener("click", (event) => {
  const link = event.target.closest("[data-document-link]");
  if (!link || !filePreviewContext) return;
  event.preventDefault();
  const rawTarget = String(link.dataset.documentLink || "");
  const kind = chatFileKind(rawTarget);
  const resolved = resolveRelativePreviewPath(filePreviewContext.path, rawTarget);
  if (!kind || !resolved) {
    showToast("프로젝트 안의 Markdown, HTML 또는 이미지 링크만 열 수 있습니다.");
    return;
  }
  void openChatFilePreview(
    filePreviewContext.agentId,
    filePreviewContext.projectId,
    resolved,
    kind,
  );
});
ui.filePreviewClose.addEventListener("click", closeFilePreview);
ui.filePreviewOverlay.addEventListener("click", (event) => {
  if (event.target === ui.filePreviewOverlay) closeFilePreview();
});
ui.newSessionButton.addEventListener("click", openCreateSessionEditor);
ui.renameSessionButton.addEventListener("click", openRenameSessionEditor);
ui.sessionEditorProject.addEventListener("change", () => {
  ui.sessionEditorName.value = nextRemoteSessionName(ui.sessionEditorProject.value);
});
ui.sessionEditorTool.addEventListener("change", syncSessionEditorDangerous);
ui.sessionEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitSessionEditor();
});
ui.sessionEditorClose.addEventListener("click", closeSessionEditor);
ui.sessionEditorCancel.addEventListener("click", closeSessionEditor);
ui.sessionEditorOverlay.addEventListener("click", (event) => {
  if (event.target === ui.sessionEditorOverlay) closeSessionEditor();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!ui.sessionEditorOverlay.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeSessionEditor();
    return;
  }
  if (selection.type === "documents" && documentSidebarOpen && isMobile()) {
    event.preventDefault();
    setDocumentSidebarOpen(false);
    return;
  }
  if (ui.filePreviewOverlay.hidden) return;
  event.preventDefault();
  event.stopPropagation();
  closeFilePreview();
}, true);
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
ui.browserBackButton?.addEventListener("click", () => { void remoteBrowserAction("back"); });
ui.browserForwardButton?.addEventListener("click", () => { void remoteBrowserAction("forward"); });
ui.browserReloadButton?.addEventListener("click", () => { void remoteBrowserAction("reload"); });
ui.browserNewTabButton?.addEventListener("click", () => {
  const url = normalizeRemoteBrowserAddress(ui.browserAddressInput?.value);
  void remoteBrowserAction("open", { url });
});
ui.browserTabSelect?.addEventListener("change", () => {
  const tabId = ui.browserTabSelect.value;
  if (!tabId) return;
  remoteBrowser.activeTabId = tabId;
  resetRemoteBrowserFrame();
  void remoteBrowserAction("activate", { tabId });
});
ui.browserAddressForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = normalizeRemoteBrowserAddress(ui.browserAddressInput?.value);
  void remoteBrowserAction(remoteBrowser.activeTabId ? "navigate" : "open", { url });
  ui.browserAddressInput?.blur();
});
ui.browserInputForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = ui.browserTextInput?.value || "";
  if (!value) return;
  if (await remoteBrowserAction("text", { text: value })) ui.browserTextInput.value = "";
});
ui.browserInputForm?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-browser-key]");
  if (button) void remoteBrowserAction("key", { key: button.dataset.browserKey });
});
ui.browserViewport?.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  const point = remoteBrowserPoint(event.clientX, event.clientY);
  if (!point) return;
  event.preventDefault();
  ui.browserViewport.setPointerCapture?.(event.pointerId);
  remoteBrowser.pointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    lastWheelAt: 0,
    moved: false,
  };
});
ui.browserViewport?.addEventListener("pointermove", (event) => {
  const pointer = remoteBrowser.pointer;
  if (!pointer || pointer.id !== event.pointerId) return;
  event.preventDefault();
  if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 7) pointer.moved = true;
  if (!pointer.moved || event.timeStamp - pointer.lastWheelAt < 65) return;
  const point = remoteBrowserPoint(event.clientX, event.clientY);
  if (!point) return;
  const sourcePerClientX = remoteBrowser.sourceWidth / Math.max(1, point.metrics.drawWidth);
  const sourcePerClientY = remoteBrowser.sourceHeight / Math.max(1, point.metrics.drawHeight);
  const deltaX = Math.round((pointer.lastX - event.clientX) * sourcePerClientX * 1.25);
  const deltaY = Math.round((pointer.lastY - event.clientY) * sourcePerClientY * 1.25);
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
  pointer.lastWheelAt = event.timeStamp;
  if (deltaX || deltaY) void remoteBrowserAction("wheel", { x: point.x, y: point.y, deltaX, deltaY });
});
function finishRemoteBrowserPointer(event, cancelled = false) {
  const pointer = remoteBrowser.pointer;
  if (!pointer || pointer.id !== event.pointerId) return;
  remoteBrowser.pointer = null;
  ui.browserViewport.releasePointerCapture?.(event.pointerId);
  if (cancelled || pointer.moved) return;
  const point = remoteBrowserPoint(event.clientX, event.clientY);
  if (point) void remoteBrowserAction("pointer", { x: point.x, y: point.y });
}
ui.browserViewport?.addEventListener("pointerup", (event) => finishRemoteBrowserPointer(event));
ui.browserViewport?.addEventListener("pointercancel", (event) => finishRemoteBrowserPointer(event, true));
ui.browserViewport?.addEventListener("wheel", (event) => {
  const point = remoteBrowserPoint(event.clientX, event.clientY);
  if (!point) return;
  event.preventDefault();
  void remoteBrowserAction("wheel", {
    x: point.x,
    y: point.y,
    deltaX: Math.round(event.deltaX),
    deltaY: Math.round(event.deltaY),
  });
}, { passive: false });
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
  stopNativeMonitor();
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
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void fetchState({ quiet: true });
    if (selection.type === "session" && sessionViewMode === "browser") scheduleRemoteBrowserFrame(0);
  }
});
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "open-agent" && event.data.agentId) selectSession(event.data.agentId);
});
addEventListener("multiagent:native-monitor-state", (event) => {
  applyNativeMonitorState(event.detail);
});
addEventListener("multiagent:native-session-access-state", (event) => {
  void ensureNativeSessionAccess(event.detail);
});
addEventListener("multiagent:native-notification-open", (event) => {
  const agentId = text(event.detail?.agentId);
  if (agentId && agentMap().has(agentId)) selectSession(agentId);
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

// Screen mode is desktop-only. Crossing into the mobile breakpoint moves an
// open Screen to one of its sessions and rewrites the URL to ?agent=... .
mobileMedia.addEventListener("change", () => {
  applyScreenAvailability();
  validateSelection();
  renderNavigation();
  renderSelection();
  updateUrl();
  syncDocumentSidebar();
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

if (
  localStorage.getItem("multiagent.remote.notifications") === "on" &&
  (window.__MULTIAGENT_NATIVE_APP__ || window.Notification?.permission === "granted")
) {
  ui.notifyButton.classList.add("enabled");
  ui.notifyButton.title = window.__MULTIAGENT_NATIVE_APP__
    ? "휴대폰 모니터링 상태 확인 중"
    : "알림 켜짐";
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
