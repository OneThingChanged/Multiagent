export function buildWindowSessionUsage({
  detachedAgents,
  callerViewId,
}) {
  const inUseAgentIds = new Set();
  const ownedAgentIds = new Set();

  for (const [agentId, ownerViewId] of detachedAgents) {
    if (ownerViewId === callerViewId) ownedAgentIds.add(agentId);
    else inUseAgentIds.add(agentId);
  }
  return {
    in_use_agent_ids: [...inUseAgentIds],
    owned_agent_ids: [...ownedAgentIds],
  };
}

export function claimWindowSession({
  agentId,
  callerViewId,
  detachedAgents,
}) {
  const ownerViewId = detachedAgents.get(agentId);
  if (ownerViewId !== undefined && ownerViewId !== callerViewId) return false;
  detachedAgents.set(agentId, callerViewId);
  return true;
}
