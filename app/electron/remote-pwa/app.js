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
  sessionOffline: $("#sessionOffline"),
  restartSessionButton: $("#restartSessionButton"),
  sessionMode: $("#sessionMode"),
  chatView: $("#chatView"),
  outputPanel: $("#outputPanel"),
  terminalMount: $("#terminalMount"),
  terminalLive: $("#terminalLive"),
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
  body.append(meta, question);
  if (terminalSupported) {
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

function renderSelection() {
  ui.monitorView.hidden = selection.type !== "monitor";
  ui.screenView.hidden = selection.type !== "screen";
  ui.sessionView.hidden = selection.type !== "session";
  if (selection.type === "monitor") renderMonitor();
  if (selection.type === "screen") renderScreen();
  if (selection.type === "session") renderSession();
  syncTerminal();
  syncSessionView();
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
  if (isMobile()) { selectMonitor(); return; } // Screen mode is PC-only
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
  const text = message.trim();
  if (!agentId || !text) return false;
  // Type the text, then send Enter as a SEPARATE write. Claude/Codex TUIs treat
  // a "text\r" arriving in one chunk as a multi-line paste (newline inserted,
  // not submitted); a discrete \r a beat later registers as the Enter keypress.
  if (!(await sendRaw(agentId, text))) return false;
  await new Promise((resolve) => setTimeout(resolve, 80));
  await sendRaw(agentId, "\r");
  showToast("전송했습니다.");
  return true;
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

// ---- Live terminals (xterm) ----
// Each visible pane gets its own xterm mirroring the desktop terminal: raw PTY
// output streams in over SSE and every keystroke goes straight back to the PTY.
// The PTY size is authoritative — we never resize it, since the desktop views
// the same session. The single session view has one terminal; PC Screen mode
// runs one per pane. Mobile keeps Screen mode disabled (one stream at a time).
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
  const instance = { term, stream: null, agentId: null };
  term.onData((data) => { if (instance.agentId) void sendRaw(instance.agentId, data); });

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

// The terminal mirrors the desktop PTY's column count, which is far wider than
// a phone. Scale the xterm element down so the whole width fits the container
// (a phone shows the full layout instead of a clipped sliver; pinch to zoom for
// detail). PC panes wide enough for the PTY render at natural 1:1 size.
function refitTerminal(instance, container) {
  const element = instance?.term?.element;
  if (!element || !container) return;
  element.style.transformOrigin = "top left";
  element.style.transform = "";
  container.style.height = "";
  const natural = element.offsetWidth;
  const available = container.clientWidth;
  if (!natural || !available) return;
  const scale = Math.min(1, available / natural);
  if (scale < 1) {
    element.style.transform = `scale(${scale})`;
    container.style.height = `${Math.ceil(element.offsetHeight * scale)}px`;
  }
}

function refitAllTerminals() {
  for (const [container, instance] of terminals) {
    requestAnimationFrame(() => refitTerminal(instance, container));
  }
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
  } else if (selection.type === "screen" && !isMobile()) {
    for (const mount of ui.screenLayout.querySelectorAll("[data-terminal-mount]")) {
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
  let arg = "";
  const input = tool.input;
  if (typeof input === "string") arg = input;
  else if (input && typeof input === "object") {
    arg = input.command || input.cmd || input.file_path || input.path || input.pattern || JSON.stringify(input);
  }
  return { name: tool.name || "tool", arg: String(arg).replace(/\s+/g, " ").slice(0, 90) };
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
      pendingCall = { name: block.name, input: block.input, output: null, isError: false };
      tools.push(pendingCall);
    } else if (block.kind === "tool-result") {
      if (pendingCall && pendingCall.output === null) {
        pendingCall.output = block.output; pendingCall.isError = block.isError; pendingCall = null;
      } else {
        tools.push({ name: "result", input: null, output: block.output, isError: block.isError });
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
      const pre = make("pre", tool.isError ? "err" : "", tool.output ?? "(출력 없음)");
      item.appendChild(pre);
      list.appendChild(item);
    }
    group.appendChild(list);
    turn.appendChild(group);
  }
  for (const node of bodyNodes) turn.appendChild(node);
  return turn;
}

const CHAT_PAGE = 80;
let chatVisible = CHAT_PAGE;
let lastChatData = null;

function renderChat(data) {
  const el = ui.chatView;
  if (!el) return;
  lastChatData = data;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  const frag = document.createDocumentFragment();
  if (data?.unsupported) {
    frag.appendChild(make("div", "chat-empty", "이 세션은 대화 보기를 지원하지 않습니다 (codex/claude)."));
  } else if (!blocks.length) {
    frag.appendChild(make("div", "chat-empty", data?.missing ? "아직 대화 기록이 없습니다." : "대화를 불러오는 중…"));
  } else {
    // Group into turns, then render only the most recent `chatVisible` so a
    // long session paints fast; a button reveals older turns on demand.
    const turns = [];
    let i = 0;
    while (i < blocks.length) {
      if (blocks[i].role === "user" && blocks[i].kind === "text") {
        const turn = make("div", "chat-turn user");
        turn.appendChild(make("div", "chat-user", blocks[i].text));
        turns.push(turn);
        i += 1;
      } else {
        const run = [];
        while (i < blocks.length && blocks[i].role !== "user") { run.push(blocks[i]); i += 1; }
        turns.push(renderAssistantTurn(run));
      }
    }
    const hidden = Math.max(0, turns.length - chatVisible);
    if (hidden > 0) {
      const more = make("button", "chat-more", `▲ 이전 대화 더 보기 (${hidden})`);
      more.type = "button";
      more.addEventListener("click", () => {
        chatVisible += CHAT_PAGE * 2;
        if (lastChatData) renderChat(lastChatData);
      });
      frag.appendChild(more);
    }
    for (const turn of turns.slice(hidden)) frag.appendChild(turn);
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
    const data = await response.json().catch(() => ({ blocks: [] }));
    if (seq !== chatRequestSeq) return; // a newer request superseded this one
    const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
    const last = blocks[blocks.length - 1];
    // Skip re-render when nothing changed so opened tool/▸ details stay open.
    const key = `${agentId}|${blocks.length}|${String(last?.text ?? last?.output ?? "").length}|${data?.unsupported ? 1 : 0}|${data?.missing ? 1 : 0}`;
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
  const chat = sessionViewMode === "chat";
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
  }
}

// Screen mode is PC-only. On mobile, hide its nav section + bottom-nav button
// and bounce any active Screen selection back to the Monitor.
function applyScreenAvailability() {
  const mobile = isMobile();
  if (ui.screensSection) ui.screensSection.hidden = mobile;
  if (ui.mobileScreensButton) ui.mobileScreensButton.hidden = mobile;
  if (mobile && selection.type === "screen") selectMonitor();
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
  // Mobile: open/close the drawer. Tablet/desktop: collapse the fixed sidebar.
  if (isMobile()) {
    if (ui.navigationPane.classList.contains("open")) closeSidebar();
    else openSidebar();
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
  try {
    const response = await fetch("/api/session/restart", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agent.id }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    showToast("세션을 다시 시작했습니다.");
    setTimeout(() => fetchState({ quiet: true }), 600);
  } catch (error) {
    showToast(`다시 시작 실패: ${error.message}`);
  } finally {
    ui.restartSessionButton.disabled = false;
  }
});
ui.sessionMode?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  sessionViewMode = button.dataset.mode === "term" ? "term" : "chat";
  localStorage.setItem("multiagent.remote.sessionMode", sessionViewMode);
  lastChatFetch = { id: null, at: 0 }; // force an immediate chat refresh on switch
  syncTerminal();
  syncSessionView();
});
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

// Collapsible sidebar (tablet/desktop) — persisted across sessions.
const NAV_COLLAPSE_KEY = "multiagent.remote.navCollapsed";
const appShell = document.querySelector(".app-shell");
function applyNavCollapsed(collapsed) {
  appShell?.classList.toggle("nav-collapsed", collapsed);
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
  refitAllTerminals();
});
let resizeTimer = null;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refitAllTerminals, 150);
});

if (localStorage.getItem("multiagent.remote.notifications") === "on" && window.Notification?.permission === "granted") {
  ui.notifyButton.classList.add("enabled");
  ui.notifyButton.title = "알림 켜짐";
}
applyNavCollapsed(localStorage.getItem(NAV_COLLAPSE_KEY) === "1");
applyScreenAvailability();
setActiveFilter(activeFilter);
void registerServiceWorker();
void fetchState();
schedulePoll();
