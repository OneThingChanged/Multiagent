import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent } from "../types";
import { isAgentRuntimeActive } from "../lib/agentActivity";
import {
  loadAttentionItems,
  markAgentAttentionRead,
  markAgentCompletionRead,
  markAttentionRead,
  removeSessionAttention,
  resolveAgentWorkAttention,
  saveAttentionItems,
  unreadCompletedAgentIds,
  upsertAttentionItem,
  type AttentionItem,
} from "../lib/attention";

export type AttentionDraft = Omit<AttentionItem, "id" | "read">;

export function useAttentionState(agents: readonly Agent[]) {
  const [items, setItems] = useState<AttentionItem[]>(loadAttentionItems);

  useEffect(() => {
    saveAttentionItems(items);
  }, [items]);

  const push = useCallback((draft: AttentionDraft) => {
    setItems((current) => {
      const existing = current.find(
        (item) => item.dedupeKey === draft.dedupeKey
      );
      if (
        existing &&
        existing.createdAt === draft.createdAt &&
        existing.body === draft.body
      ) {
        return current;
      }
      return upsertAttentionItem(current, {
        ...draft,
        id: `${draft.dedupeKey}:${draft.createdAt}:${crypto.randomUUID()}`,
        read: false,
      });
    });
  }, []);

  const acknowledgeCompletion = useCallback((agentId: string) => {
    setItems((current) => markAgentCompletionRead(current, agentId));
  }, []);

  const acknowledgeAgent = useCallback((agentId: string) => {
    setItems((current) => markAgentAttentionRead(current, agentId));
  }, []);

  const acknowledgeItem = useCallback((itemId: string) => {
    setItems((current) => markAttentionRead(current, new Set([itemId])));
  }, []);

  const acknowledgeAll = useCallback(() => {
    setItems((current) => markAttentionRead(current));
  }, []);

  const clearRead = useCallback(() => {
    setItems((current) => current.filter((item) => !item.read));
  }, []);

  const beginAgentWork = useCallback(
    (agentId: string, sessionKey: string) => {
      setItems((current) =>
        resolveAgentWorkAttention(current, agentId, sessionKey)
      );
    },
    []
  );

  const resolveSession = useCallback((sessionKey: string) => {
    setItems((current) => removeSessionAttention(current, sessionKey));
  }, []);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read).length,
    [items]
  );

  const unreadCompletionAgentIds = useMemo(() => {
    const runningAgentIds = new Set(
      agents.filter(isAgentRuntimeActive).map((agent) => agent.id)
    );
    return unreadCompletedAgentIds(items, runningAgentIds);
  }, [agents, items]);

  return {
    items,
    push,
    acknowledgeCompletion,
    acknowledgeAgent,
    acknowledgeItem,
    acknowledgeAll,
    clearRead,
    beginAgentWork,
    resolveSession,
    unreadCount,
    unreadCompletionAgentIds,
  };
}
