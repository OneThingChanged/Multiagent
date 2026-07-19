const $ = (selector) => document.querySelector(selector);

const ui = {
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
  sessionView: $("#sessionView"),
  detailStatus: $("#detailStatus"),
  detailName: $("#detailName"),
  detailMeta: $("#detailMeta"),
  backToScreenButton: $("#backToScreenButton"),
  questionPanel: $("#questionPanel"),
  questionText: $("#questionText"),
  questionOptions: $("#questionOptions"),
  focusAnswerButton: $("#focusAnswerButton"),
  promptPanel: $("#promptPanel"),
  promptText: $("#promptText"),
  outputText: $("#outputText"),
  copyOutputButton: $("#copyOutputButton"),
  composerForm: $("#composerForm"),
  composerKeys: $("#composerKeys"),
  messageInput: $("#messageInput"),
  sendButton: $("#sendButton"),
  refreshButton: $("#refreshButton"),
  installButton: $("#installButton"),
  notifyButton: $("#notifyButton"),
  logoutButton: $("#logoutButton"),
  mobileMonitorButton: $("#mobileMonitorButton"),
  mobileScreensButton: $("#mobileScreensButton"),
  mobileSessionsButton: $("#mobileSessionsButton"),
  mobileQuestionsButton: $("#mobileQuestionsButton"),
  mobileScreenBadge: $("#mobileScreenBadge"),
  mobileQuestionBadge: $("#mobileQuestionBadge"),
  toast: $("#toast"),
};

const STATUS = {
  working: { label: "작업 중", rank: 0 },
  attention: { label: "답변 필요", rank: 1 },
  done: { label: "완료", rank: 2 },
  idle: { label: "대기", rank: 3 },
  offline: { label: "비활성", rank: 4 },
};
const STATUS_ORDER = Object.keys(STATUS);
const FILTERS = ["all", ...STATUS_ORDER];

let remoteState = { agents: [], view: { projects: [], agents: [], groups: [] } };
const initialUrl = new URL(location.href);
let activeFilter = FILTERS.includes(initialUrl.searchParams.get("filter"))
  ? initialUrl.searchParams.get("filter")
  : "all";
let selection = initialUrl.searchParams.get("screen")
  ? { type: "screen", id: initialUrl.searchParams.get("screen") }
  : initialUrl.searchParams.get("agent")
    ? { type: "session", id: initialUrl.searchParams.get("agent") }
    : { type: "monitor", id: null };
let returnScreenId = null;
let mobilePaneId = null;
let deferredInstallPrompt = null;
let firstSnapshot = true;
let pollTimer = null;
let toastTimer = null;
let screenRenderKey = "";
let previousActivity = new Map();
const leafTabSelection = new Map();
const screenDrafts = new Map();

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

function statusOf(agent) {
  const hookEvent = text(agent?.hook?.event).toLowerCase();
  const rawStatus = text(agent?.status).toLowerCase();
  if (["exited", "unreachable", "offline"].includes(rawStatus)) return "offline";
  if (questionOf(agent) || ["waiting", "blocked", "permission-request"].includes(rawStatus)
    || ["waiting", "blocked", "permission-request"].includes(hookEvent)) return "attention";
  if (["working", "starting"].includes(rawStatus)
    || ["working", "tool-start", "tool-end", "starting"].includes(hookEvent)) return "working";
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
    if (activeFilter !== "all" && statusOf(agent) !== activeFilter) return false;
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
  if (selection.type === "session") url.searchParams.set("agent", selection.id);
  if (selection.type === "screen") url.searchParams.set("screen", selection.id);
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
  const counts = { working: 0, attention: 0, done: 0, idle: 0, offline: 0 };
  for (const agent of allAgents()) counts[statusOf(agent)] += 1;
  ui.workingCount.textContent = String(counts.working);
  ui.questionCount.textContent = String(counts.attention);
  ui.doneCount.textContent = String(counts.done);
  ui.idleCount.textContent = String(counts.idle);
  ui.offlineCount.textContent = String(counts.offline);
  ui.totalCount.textContent = String(allAgents().length);
  ui.mobileQuestionBadge.textContent = String(counts.attention);
  ui.mobileQuestionBadge.hidden = counts.attention === 0;
  const screens = screenGroups();
  ui.mobileScreenBadge.textContent = String(screens.length);
  ui.mobileScreenBadge.hidden = screens.length === 0;
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
}

function renderMonitor() {
  const query = ui.searchInput.value.trim().toLowerCase();
  const statuses = activeFilter === "all" ? STATUS_ORDER : [activeFilter];
  ui.monitorTitle.textContent = activeFilter === "all" ? "전체 세션" : STATUS[activeFilter].label;
  ui.monitorMeta.textContent = activeFilter === "all"
    ? "PC에서 실행 중인 작업을 상태별로 확인합니다."
    : `${STATUS[activeFilter].label} 상태의 세션만 표시하고 있습니다.`;
  ui.monitorBoard.dataset.filtered = activeFilter === "all" ? "false" : "true";
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
    });
    fragment.appendChild(button);
  }
  ui.screenPaneTabs.replaceChildren(fragment);
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
  const expand = make("button", "expand-session", "↗");
  expand.type = "button";
  expand.title = "세션 크게 보기";
  expand.addEventListener("click", () => selectSession(activeAgent.id, screen.id));
  head.append(tabs, expand);

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
  const output = make("pre", "terminal-output", recentOutput(activeAgent, 70) || "출력 대기 중…");
  output.dataset.role = "output";
  body.append(meta, question, output);

  const form = make("form", "screen-composer");
  const input = document.createElement("input");
  input.maxLength = 4000;
  input.placeholder = "메시지 또는 답변";
  input.value = screenDrafts.get(activeAgent.id) || "";
  input.addEventListener("input", () => screenDrafts.set(activeAgent.id, input.value));
  const send = make("button", "", "전송");
  send.type = "submit";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    send.disabled = true;
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
    const nextOutput = recentOutput(agent, 70) || "출력 대기 중…";
    if (output.textContent !== nextOutput) {
      const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 42;
      output.textContent = nextOutput;
      if (nearBottom) requestAnimationFrame(() => { output.scrollTop = output.scrollHeight; });
    }
  }
  for (const tab of ui.screenLayout.querySelectorAll("[data-tab-agent]")) {
    const agent = agentsById.get(tab.dataset.tabAgent);
    const dot = tab.querySelector(".status-dot");
    if (agent && dot) dot.className = `status-dot ${statusOf(agent)}`;
  }
  updateScreenHeader(screen);
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
  const nextKey = JSON.stringify([screen.id, screen.layout, [...leafTabSelection.entries()].filter(([key]) => key.startsWith(`${screen.id}:`))]);
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
  const output = recentOutput(agent) || "출력 대기 중…";
  const nearBottom = ui.outputText.scrollHeight - ui.outputText.scrollTop - ui.outputText.clientHeight < 48;
  ui.detailStatus.className = `status-chip ${status}`;
  ui.detailStatus.textContent = STATUS[status].label;
  ui.detailName.textContent = text(agent.name || agent.id);
  ui.detailMeta.textContent = `${projectName(agent)} · ${toolName(agent)}`;
  ui.questionPanel.hidden = !question.text;
  ui.questionText.textContent = question.text;
  const optionFragment = document.createDocumentFragment();
  for (const option of question.options) {
    const button = make("button", "question-option", option);
    button.type = "button";
    button.addEventListener("click", () => {
      ui.messageInput.value = option;
      ui.messageInput.focus();
    });
    optionFragment.appendChild(button);
  }
  ui.questionOptions.replaceChildren(optionFragment);
  ui.promptPanel.hidden = !prompt;
  ui.promptText.textContent = prompt;
  if (ui.outputText.textContent !== output) {
    ui.outputText.textContent = output;
    if (nearBottom) requestAnimationFrame(() => { ui.outputText.scrollTop = ui.outputText.scrollHeight; });
  }
  const canReturn = returnScreenId && screenGroups().some((screen) => screen.id === returnScreenId);
  ui.backToScreenButton.hidden = !canReturn;
}

function renderSelection() {
  ui.monitorView.hidden = selection.type !== "monitor";
  ui.screenView.hidden = selection.type !== "screen";
  ui.sessionView.hidden = selection.type !== "session";
  if (selection.type === "monitor") renderMonitor();
  if (selection.type === "screen") renderScreen();
  if (selection.type === "session") renderSession();
  ui.overviewButton.classList.toggle("selected", selection.type === "monitor");
  ui.mobileMonitorButton.classList.toggle("active", selection.type === "monitor" && activeFilter !== "attention");
  ui.mobileScreensButton.classList.toggle("active", selection.type === "screen");
  ui.mobileSessionsButton.classList.toggle("active", selection.type === "session");
  ui.mobileQuestionsButton.classList.toggle("active", selection.type === "monitor" && activeFilter === "attention");
}

function closeSidebar() {
  ui.navigationPane.classList.remove("open");
  ui.sidebarBackdrop.classList.remove("visible");
}

function openSidebar(section) {
  ui.navigationPane.classList.add("open");
  ui.sidebarBackdrop.classList.add("visible");
  requestAnimationFrame(() => section?.scrollIntoView({ block: "start" }));
}

function selectMonitor(filter = activeFilter) {
  selection = { type: "monitor", id: null };
  returnScreenId = null;
  setActiveFilter(filter);
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
  updateUrl();
  renderNavigation();
  renderSelection();
  closeSidebar();
}

async function sendInput(agentId, message) {
  if (!agentId || !message.trim()) return false;
  try {
    const response = await fetch("/api/input", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agentId, data: `${message.trim()}\r` }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    showToast("PC의 세션으로 전송했습니다.");
    setTimeout(() => fetchState({ quiet: true }), 350);
    return true;
  } catch (error) {
    showToast(`전송 실패: ${error.message}`);
    return false;
  }
}

// Special-key sequences for prompts the composer text field can't express:
// a bare Enter ("Press enter to continue"), arrow-key menu navigation, Esc,
// and Ctrl+C. Sent raw (no trailing \r, no trim) so control bytes reach the PTY.
const KEY_SEQUENCES = {
  enter: "\r",
  up: "\x1b[A",
  down: "\x1b[B",
  esc: "\x1b",
  ctrlc: "\x03",
};

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

async function sendSelectedMessage() {
  const agent = selectedAgent();
  const message = ui.messageInput.value.trim();
  if (!agent || !message) return;
  ui.sendButton.disabled = true;
  if (await sendInput(agent.id, message)) ui.messageInput.value = "";
  ui.sendButton.disabled = false;
}

async function showNotification(title, body, tag, agentId) {
  if (!("Notification" in window)
    || localStorage.getItem("multiagent.remote.notifications") !== "on"
    || window.Notification.permission !== "granted") return;
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

function validateSelection() {
  if (selection.type === "session" && !agentMap().has(selection.id)) selection = { type: "monitor", id: null };
  if (selection.type === "screen" && !screenGroups().some((screen) => screen.id === selection.id)) selection = { type: "monitor", id: null };
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
    ui.notifyButton.title = "알림 켜짐";
    showToast("완료와 질문 알림을 켰습니다.");
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
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch {}
}

ui.overviewButton.addEventListener("click", () => selectMonitor("all"));
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
ui.sidebarToggle.addEventListener("click", () => {
  if (ui.navigationPane.classList.contains("open")) closeSidebar();
  else openSidebar();
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
ui.composerForm.addEventListener("submit", (event) => { event.preventDefault(); void sendSelectedMessage(); });
ui.composerKeys?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-key]");
  if (!button) return;
  const agent = selectedAgent();
  if (!agent) { showToast("세션을 먼저 선택하세요."); return; }
  const sequence = KEY_SEQUENCES[button.dataset.key];
  if (sequence) void sendRaw(agent.id, sequence);
});
ui.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void sendSelectedMessage();
  }
});
ui.copyOutputButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(ui.outputText.textContent || "");
    showToast("최근 출력을 복사했습니다.");
  } catch { showToast("출력을 복사하지 못했습니다."); }
});
ui.notifyButton.addEventListener("click", enableNotifications);
ui.installButton.addEventListener("click", installPwa);
ui.logoutButton.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  location.reload();
});
ui.mobileMonitorButton.addEventListener("click", () => selectMonitor("all"));
ui.mobileScreensButton.addEventListener("click", () => openSidebar(ui.screensSection));
ui.mobileSessionsButton.addEventListener("click", () => openSidebar(ui.filters));
ui.mobileQuestionsButton.addEventListener("click", () => selectMonitor("attention"));

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

if (localStorage.getItem("multiagent.remote.notifications") === "on" && window.Notification?.permission === "granted") {
  ui.notifyButton.classList.add("enabled");
  ui.notifyButton.title = "알림 켜짐";
}
setActiveFilter(activeFilter);
void registerServiceWorker();
void fetchState();
schedulePoll();
