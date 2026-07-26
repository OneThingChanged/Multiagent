import { describe, expect, it, vi } from "vitest";
import { CloseCoordinator } from "./close-coordinator.mjs";

describe("CloseCoordinator", () => {
  it("waits for renderer confirmation before completing an update install", () => {
    const onRequest = vi.fn();
    const onComplete = vi.fn();
    const coordinator = new CloseCoordinator({ onRequest, onComplete });

    coordinator.request("install-update");

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    coordinator.confirm();

    expect(onComplete).toHaveBeenCalledWith("install-update", "renderer");
  });

  it("upgrades a pending quit to the safer higher-priority action", () => {
    const onRequest = vi.fn();
    const onComplete = vi.fn();
    const coordinator = new CloseCoordinator({ onRequest, onComplete });

    coordinator.request("quit");
    coordinator.request("relaunch");
    coordinator.request("install-update");
    coordinator.confirm();

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("install-update", "renderer");
  });

  it("falls back after the renderer timeout and can recover from completion failure", () => {
    vi.useFakeTimers();
    const error = new Error("install failed");
    const onFailure = vi.fn();
    const onComplete = vi
      .fn()
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockImplementationOnce(() => {});
    const coordinator = new CloseCoordinator({
      onRequest: vi.fn(),
      onComplete,
      onFailure,
      timeoutMs: 100,
    });

    coordinator.request("install-update");
    vi.advanceTimersByTime(100);

    expect(onFailure).toHaveBeenCalledWith(error, "install-update");
    expect(coordinator.isPending()).toBe(false);

    coordinator.request("quit");
    coordinator.confirm();
    expect(onComplete).toHaveBeenLastCalledWith("quit", "renderer");
    vi.useRealTimers();
  });
});
