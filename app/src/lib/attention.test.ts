import { describe, expect, it } from "vitest";
import {
  markAttentionRead,
  MAX_ATTENTION_ITEMS,
  removeSessionAttention,
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
