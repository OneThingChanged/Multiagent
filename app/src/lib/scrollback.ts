const PREFIX = "multiagent.scrollback.";
const SUFFIX = ".v1";
const MAX_BYTES_PER_AGENT = 80 * 1024;

function key(agentId: string) {
  return `${PREFIX}${agentId}${SUFFIX}`;
}

export function saveScrollback(agentId: string, data: string) {
  try {
    const trimmed =
      data.length > MAX_BYTES_PER_AGENT
        ? data.slice(data.length - MAX_BYTES_PER_AGENT)
        : data;
    if (!trimmed) {
      localStorage.removeItem(key(agentId));
      return;
    }
    localStorage.setItem(key(agentId), trimmed);
  } catch (err) {
    console.warn("scrollback save failed", err);
  }
}

export function loadScrollback(agentId: string): string | null {
  try {
    return localStorage.getItem(key(agentId));
  } catch {
    return null;
  }
}

export function clearScrollback(agentId: string) {
  try {
    localStorage.removeItem(key(agentId));
  } catch {}
}

export function pruneScrollback(validAgentIds: Set<string>) {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || !k.endsWith(SUFFIX)) continue;
      const id = k.slice(PREFIX.length, k.length - SUFFIX.length);
      if (!validAgentIds.has(id)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {}
}
