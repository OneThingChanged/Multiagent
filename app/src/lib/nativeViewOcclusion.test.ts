import { describe, expect, it, vi } from "vitest";
import {
  acquireNativeViewOcclusion,
  areNativeViewsOccluded,
  subscribeNativeViewOcclusion,
} from "./nativeViewOcclusion";

describe("native view occlusion", () => {
  it("keeps native views hidden until every overlay releases its blocker", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNativeViewOcclusion(listener);
    const releaseFirst = acquireNativeViewOcclusion();
    const releaseSecond = acquireNativeViewOcclusion();

    expect(areNativeViewsOccluded()).toBe(true);
    releaseFirst();
    expect(areNativeViewsOccluded()).toBe(true);
    releaseSecond();
    expect(areNativeViewsOccluded()).toBe(false);
    expect(listener.mock.calls.map(([value]) => value)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);

    releaseSecond();
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
  });
});
