import { afterEach, describe, expect, it } from "vitest";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConversationStoreManager } from "./conversation-store.mjs";

const cleanup = [];

async function tempRoot() {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "multiagent-conversations-"));
  cleanup.push(root);
  return root;
}

function codexLine(role, text) {
  return JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: [{ type: role === "user" ? "input_text" : "output_text", text }],
    },
  });
}

afterEach(async () => {
  while (cleanup.length) {
    await fsPromises.rm(cleanup.pop(), { recursive: true, force: true });
  }
});

describe("ConversationStoreManager", () => {
  it("persists one agent conversation incrementally without duplicating composer input", async () => {
    const root = await tempRoot();
    const configDir = path.join(root, "config");
    const defaultRoot = path.join(root, "local", "conversation-store");
    const transcript = path.join(root, "session.jsonl");
    const manager = new ConversationStoreManager({ configDir, defaultRoot });
    const input = {
      agentId: "agent-a",
      sessionId: "session-a",
      provider: "codex",
      transcriptPath: transcript,
      projectPath: root,
      title: "Agent A",
    };

    manager.store.recordUserMessage({ ...input, text: "hello" });
    await fsPromises.writeFile(
      transcript,
      `${codexLine("user", "hello")}\n${codexLine("assistant", "world")}\n`,
      "utf8",
    );
    await manager.store.ingestTranscript(input);
    await manager.store.ingestTranscript(input);

    let page = manager.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      limit: 10,
    });
    expect(page.blocks.map((block) => block.text)).toEqual(["hello", "world"]);
    expect(page.total).toBe(2);

    await fsPromises.appendFile(
      transcript,
      `${codexLine("user", "again")}\n${codexLine("assistant", "done")}\n`,
      "utf8",
    );
    await manager.store.ingestTranscript(input);
    page = manager.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      limit: 2,
    });
    expect(page.blocks.map((block) => block.text)).toEqual(["again", "done"]);
    expect(page.hasOlder).toBe(true);
    expect(page.total).toBe(4);

    const older = manager.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      beforeSequence: page.firstSequence,
      limit: 10,
    });
    expect(older.blocks.map((block) => block.text)).toEqual(["hello", "world"]);
    manager.close();

    const reopened = new ConversationStoreManager({ configDir, defaultRoot });
    expect(reopened.store.listBlocks({
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      limit: 10,
    }).blocks.map((block) => block.text)).toEqual(["hello", "world", "again", "done"]);
    reopened.close();
  });

  it("isolates agents and safely copies the active store to a configured path", async () => {
    const root = await tempRoot();
    const configDir = path.join(root, "config");
    const defaultRoot = path.join(root, "local", "conversation-store");
    const customRoot = path.join(root, "custom", "archive");
    const manager = new ConversationStoreManager({ configDir, defaultRoot });

    manager.store.recordUserMessage({
      agentId: "agent-a",
      sessionId: "shared-provider-id",
      provider: "codex",
      text: "only a",
    });
    manager.store.recordUserMessage({
      agentId: "agent-b",
      sessionId: "shared-provider-id",
      provider: "codex",
      text: "only b",
    });
    expect(manager.store.listBlocks({
      agentId: "agent-a",
      sessionId: "shared-provider-id",
      provider: "codex",
    }).blocks.map((block) => block.text)).toEqual(["only a"]);
    expect(manager.store.listBlocks({
      agentId: "agent-b",
      sessionId: "shared-provider-id",
      provider: "codex",
    }).blocks.map((block) => block.text)).toEqual(["only b"]);

    const moved = await manager.setRoot(customRoot);
    expect(moved.custom).toBe(true);
    expect(path.resolve(moved.path)).toBe(path.resolve(customRoot));
    expect(manager.store.listBlocks({
      agentId: "agent-a",
      sessionId: "shared-provider-id",
      provider: "codex",
    }).blocks.map((block) => block.text)).toEqual(["only a"]);

    const reset = await manager.setRoot(null);
    expect(reset.custom).toBe(false);
    expect(manager.store.listBlocks({
      agentId: "agent-b",
      sessionId: "shared-provider-id",
      provider: "codex",
    }).blocks.map((block) => block.text)).toEqual(["only b"]);
    manager.close();
  });

  it("reports a missing custom drive without silently creating an empty default archive", async () => {
    const root = await tempRoot();
    const configDir = path.join(root, "config");
    const defaultRoot = path.join(root, "local", "conversation-store");
    const customRoot = path.join(root, "detached-drive", "archive");
    await fsPromises.mkdir(configDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(configDir, "conversation-store-config.json"),
      JSON.stringify({ version: 1, customRoot }),
      "utf8",
    );

    const manager = new ConversationStoreManager({ configDir, defaultRoot });
    const unavailable = await manager.status();
    expect(unavailable.available).toBe(false);
    expect(unavailable.path).toBe(path.resolve(customRoot));
    await expect(fsPromises.stat(defaultRoot)).rejects.toThrow();

    await fsPromises.mkdir(customRoot, { recursive: true });
    const restored = await manager.setRoot(customRoot);
    expect(restored.available).toBe(true);
    expect(restored.custom).toBe(true);
    manager.close();
  });
});
