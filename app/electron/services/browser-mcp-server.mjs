// Minimal stdio MCP bridge for the browser owned by MultiAgent. It deliberately
// has no Electron dependency: the child inherits MULTIAGENT_PORT, token and
// agent id from the PTY that launched Codex/Claude, then talks only to the
// authenticated loopback integration API.

const port = String(process.env.MULTIAGENT_PORT || "").trim();
const token = String(process.env.MULTIAGENT_TOKEN || "").trim();
const agentId = String(process.env.MULTIAGENT_AGENT_ID || "").trim();
const baseUrl = port ? `http://127.0.0.1:${port}/integration/v1/browser/${encodeURIComponent(agentId)}` : "";

const tools = [
  {
    name: "browser_tabs",
    description: "List the tabs available to the current MultiAgent session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_open",
    description: "Open a new visible tab in the session's shared MultiAgent browser. Defaults to Google when URL is omitted.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_navigate",
    description: "Navigate a browser tab to an HTTP(S) URL.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, url: { type: "string" } }, required: ["url"], additionalProperties: false },
  },
  {
    name: "browser_snapshot",
    description: "Read a sanitized text/link/control snapshot of the active browser tab.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_screenshot",
    description: "Capture the active browser tab and return a local image path.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_click",
    description: "Click a non-password element using a CSS selector.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, selector: { type: "string" } }, required: ["selector"], additionalProperties: false },
  },
  {
    name: "browser_type",
    description: "Type into a non-password form control using a CSS selector.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" }, selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"], additionalProperties: false },
  },
  {
    name: "browser_back",
    description: "Navigate the active browser tab back.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_forward",
    description: "Navigate the active browser tab forward.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_reload",
    description: "Reload the active browser tab.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "browser_attach_annotation",
    description: "Capture the explicitly selected/hovered page element as sanitized HTML, JSON metadata and an image path.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } }, additionalProperties: false },
  },
];

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: "text", text: String(message) }],
  };
}

async function callBrowser(action, body = {}, method = "POST") {
  if (!baseUrl || !token || !agentId) {
    throw new Error("MultiAgent browser bridge environment is missing");
  }
  const response = await fetch(`${baseUrl}/${action}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(payload?.error || `browser request failed (${response.status})`);
  return payload;
}

async function callTool(name, args) {
  const body = args && typeof args === "object" ? { ...args } : {};
  switch (name) {
    case "browser_tabs": return callBrowser("status", {}, "GET");
    case "browser_open": return callBrowser("open", body);
    case "browser_navigate": return callBrowser("navigate", body);
    case "browser_snapshot": return callBrowser("snapshot", body);
    case "browser_screenshot": return callBrowser("screenshot", body);
    case "browser_click": return callBrowser("click", body);
    case "browser_type": return callBrowser("type", body);
    case "browser_back": return callBrowser("back", body);
    case "browser_forward": return callBrowser("forward", body);
    case "browser_reload": return callBrowser("reload", body);
    case "browser_attach_annotation": return callBrowser("annotate", body);
    default: throw new Error(`Unknown browser tool: ${name}`);
  }
}

async function handle(message) {
  if (!message || typeof message !== "object") return;
  const id = message.id;
  const method = message.method;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") {
    if (id !== undefined) write({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "initialize") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "multiagent-browser", version: "0.1.0" },
      },
    });
    return;
  }
  if (method === "tools/list") {
    write({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }
  if (method === "tools/call") {
    try {
      const result = await callTool(String(message.params?.name || ""), message.params?.arguments);
      write({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        },
      });
    } catch (error) {
      write({ jsonrpc: "2.0", id, result: errorResult(error?.message || error) });
    }
    return;
  }
  if (id !== undefined) {
    write({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(method)}` } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } });
      continue;
    }
    void handle(message).catch((error) => {
      if (message?.id !== undefined) write({ jsonrpc: "2.0", id: message.id, result: errorResult(error?.message || error) });
    });
  }
});
process.stdin.on("end", () => process.exit(0));
