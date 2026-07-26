export const LS_ATTENTION_ITEMS = "multiagent.attentionItems.v1";
export const MAX_ATTENTION_ITEMS = 100;

export type AttentionKind = "waiting" | "blocked" | "completed" | "stale";

export type AttentionItem = {
  id: string;
  dedupeKey: string;
  kind: AttentionKind;
  agentId: string;
  sessionKey: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};

export function upsertAttentionItem(
  items: AttentionItem[],
  item: AttentionItem
) {
  return [
    ...items.filter((candidate) => candidate.dedupeKey !== item.dedupeKey),
    item,
  ].slice(-MAX_ATTENTION_ITEMS);
}

export function removeSessionAttention(
  items: AttentionItem[],
  sessionKey: string,
  kinds: AttentionKind[] = ["waiting", "blocked", "stale"]
) {
  return items.filter(
    (item) => item.sessionKey !== sessionKey || !kinds.includes(item.kind)
  );
}

export function markAttentionRead(items: AttentionItem[], ids?: Set<string>) {
  return items.map((item) =>
    !ids || ids.has(item.id) ? { ...item, read: true } : item
  );
}

export function unreadCompletedAgentIds(
  items: AttentionItem[],
  eligibleAgentIds?: ReadonlySet<string>
): Set<string> {
  return new Set(
    items
      .filter(
        (item) =>
          item.kind === "completed" &&
          !item.read &&
          (!eligibleAgentIds || eligibleAgentIds.has(item.agentId))
      )
      .map((item) => item.agentId)
  );
}

export function markAgentCompletionRead(
  items: AttentionItem[],
  agentId: string
): AttentionItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (
      item.agentId !== agentId ||
      item.kind !== "completed" ||
      item.read
    ) {
      return item;
    }
    changed = true;
    return { ...item, read: true };
  });
  return changed ? next : items;
}

function isAttentionItem(value: unknown): value is AttentionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AttentionItem>;
  return typeof item.id === "string" &&
    typeof item.dedupeKey === "string" &&
    typeof item.agentId === "string" &&
    typeof item.sessionKey === "string" &&
    typeof item.title === "string" &&
    typeof item.body === "string" &&
    typeof item.createdAt === "number" &&
    typeof item.read === "boolean" &&
    ["waiting", "blocked", "completed", "stale"].includes(item.kind || "");
}

export function loadAttentionItems(): AttentionItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_ATTENTION_ITEMS) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isAttentionItem).slice(-MAX_ATTENTION_ITEMS)
      : [];
  } catch {
    return [];
  }
}

export function saveAttentionItems(items: AttentionItem[]) {
  try {
    localStorage.setItem(LS_ATTENTION_ITEMS, JSON.stringify(items.slice(-MAX_ATTENTION_ITEMS)));
  } catch {}
}
