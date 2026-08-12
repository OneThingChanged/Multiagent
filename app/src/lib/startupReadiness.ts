import type { AgentRuntimeStatus } from "../types";

export const STARTUP_READY_TIMEOUT_MS = 20_000;

export type InitializingRuntimeStatus = Extract<
  AgentRuntimeStatus,
  "starting" | "recovering"
>;

type StartupReadyFallbackOptions = {
  expectedStatus: InitializingRuntimeStatus;
  getRuntimeStatus: () => AgentRuntimeStatus | undefined;
  onReady: () => void;
  timeoutMs?: number;
  schedule?: (callback: () => void, timeoutMs: number) => number;
};

/**
 * Hooks remain the fastest readiness signal, but a background PTY may not have
 * a visible renderer subscriber and some CLI launches can miss SessionStart.
 * Release only the exact initialization state that scheduled this fallback so
 * later working, idle, or exited states remain authoritative.
 */
export function scheduleStartupReadyFallback({
  expectedStatus,
  getRuntimeStatus,
  onReady,
  timeoutMs = STARTUP_READY_TIMEOUT_MS,
  schedule = (callback, delay) =>
    globalThis.setTimeout(callback, delay) as unknown as number,
}: StartupReadyFallbackOptions): number {
  return schedule(() => {
    if (getRuntimeStatus() === expectedStatus) onReady();
  }, timeoutMs);
}
