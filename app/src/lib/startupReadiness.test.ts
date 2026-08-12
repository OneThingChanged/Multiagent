import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STARTUP_READY_TIMEOUT_MS,
  scheduleStartupReadyFallback,
} from "./startupReadiness";

afterEach(() => vi.useRealTimers());

describe("scheduleStartupReadyFallback", () => {
  it.each(["starting", "recovering"] as const)(
    "releases a stuck %s session after the readiness timeout",
    (status) => {
      vi.useFakeTimers();
      const onReady = vi.fn();

      scheduleStartupReadyFallback({
        expectedStatus: status,
        getRuntimeStatus: () => status,
        onReady,
      });

      vi.advanceTimersByTime(STARTUP_READY_TIMEOUT_MS - 1);
      expect(onReady).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onReady).toHaveBeenCalledOnce();
    }
  );

  it.each(["running", "exited", "idle"] as const)(
    "does not overwrite a session that changed to %s",
    (nextStatus) => {
      vi.useFakeTimers();
      const onReady = vi.fn();
      let runtimeStatus:
        | "starting"
        | "running"
        | "exited"
        | "idle" = "starting";

      scheduleStartupReadyFallback({
        expectedStatus: "starting",
        getRuntimeStatus: () => runtimeStatus,
        onReady,
      });
      runtimeStatus = nextStatus;
      vi.advanceTimersByTime(STARTUP_READY_TIMEOUT_MS);

      expect(onReady).not.toHaveBeenCalled();
    }
  );
});
