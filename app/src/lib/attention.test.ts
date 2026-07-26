import { describe, expect, it } from "vitest";
import {
  markAgentCompletionRead,
  markAttentionRead,
  MAX_ATTENTION_ITEMS,
  removeSessionAttention,
  unreadCompletedAgentIds,
  upsertAttentionItem,
  type AttentionItem,
} from "./attention";

function item(id: string, kind: AttentionItem["kind"] = "waiting"): AttentionItem {
  return {
    id, dedupeKey: `${kind}:session`, kind, agentId: "agent", sessionKey: "session",
    title: "title", body: "body", createdAt: Number(id) || 1, read: false,
  };
}

describe("attention items", () => {
  it("keeps the newest item per session/kind and marks it read", () => {
    const next = upsertAttentionItem([item("1")], item("2"));
    expect(next.map((entry) => entry.id)).toEqual(["2"]);
    expect(markAttentionRead(next)[0].read).toBe(true);
  });

  it("clears resolved waiting states but retains completion history", () => {
    const items = [item("1"), item("2", "completed")];
    expect(removeSessionAttention(items, "session").map((entry) => entry.kind))
      .toEqual(["completed"]);
  });

  it("tracks unread completions by agent and acknowledges only that agent", () => {
    const completed = {
      ...item("2", "completed"),
      agentId: "agent-2",
      sessionKey: "session-2",
    };
    const alreadyRead = {
      ...item("3", "completed"),
      agentId: "agent-3",
      sessionKey: "session-3",
      read: true,
    };
    const items = [item("1"), completed, alreadyRead];

    expect(Array.from(unreadCompletedAgentIds(items))).toEqual(["agent-2"]);

    const next = markAgentCompletionRead(items, "agent-2");
    expect(next[0]).toBe(items[0]);
    expect(next[1].read).toBe(true);
    expect(next[2]).toBe(items[2]);
    expect(unreadCompletedAgentIds(next).size).toBe(0);
    expect(markAgentCompletionRead(next, "missing")).toBe(next);
  });

  it("limits sidebar completion markers to eligible running agents", () => {
    const active = {
      ...item("2", "completed"),
      agentId: "active-agent",
      sessionKey: "active-session",
      dedupeKey: "completed:active-session",
    };
    const inactive = {
      ...item("3", "completed"),
      agentId: "inactive-agent",
      sessionKey: "inactive-session",
      dedupeKey: "completed:inactive-session",
    };

    expect(
      Array.from(
        unreadCompletedAgentIds(
          [active, inactive],
          new Set(["active-agent"])
        )
      )
    ).toEqual(["active-agent"]);
  });

  it("bounds retained history", () => {
    let items: AttentionItem[] = [];
    for (let index = 0; index < MAX_ATTENTION_ITEMS + 10; index += 1) {
      items = upsertAttentionItem(items, {
        ...item(String(index), "completed"),
        dedupeKey: `completed:${index}`,
        sessionKey: String(index),
      });
    }
    expect(items).toHaveLength(MAX_ATTENTION_ITEMS);
    expect(items[0].sessionKey).toBe("10");
  });
});
