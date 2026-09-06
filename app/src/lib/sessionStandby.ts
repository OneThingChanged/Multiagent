import type { Agent } from "../types";

// Unlike deferredStart (an allocation guard), this is durable user intent.
// An explicit false must win over an old process journal entry.
export function restoreStandbyEligibility(
  agent: Pick<Agent, "id" | "resumeEligible">,
  previouslyRunning: ReadonlySet<string>,
): boolean {
  return agent.resumeEligible ?? previouslyRunning.has(agent.id);
}

export function isStandbySession(agent: Pick<Agent, "deferredStart" | "resumeEligible">) {
  return agent.deferredStart === true && agent.resumeEligible === true;
}

export function parseRememberedSessionIds(raw: string | null): Set<string> {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    return new Set(Array.isArray(values)
      ? values.filter((value): value is string => typeof value === "string")
      : []);
  } catch {
    return new Set();
  }
}
