import { describe, expect, it } from "vitest";
import {
  buildWindowSessionUsage,
  claimWindowSession,
} from "./window-session-ownership.mjs";

describe("window session ownership", () => {
  it("separates sessions owned by the caller from sessions used elsewhere", () => {
    expect(
      buildWindowSessionUsage({
        detachedAgents: new Map([
          ["main-live", 10],
          ["owned-live", 20],
          ["other-window", 30],
        ]),
        callerViewId: 20,
      })
    ).toEqual({
      in_use_agent_ids: ["main-live", "other-window"],
      owned_agent_ids: ["owned-live"],
    });
  });

  it("claims unowned sessions, including orphaned live PTYs, but rejects foreign ownership", () => {
    const detachedAgents = new Map([["other-window", 30]]);

    expect(
      claimWindowSession({
        agentId: "inactive",
        callerViewId: 20,
        detachedAgents,
      })
    ).toBe(true);
    expect(detachedAgents.get("inactive")).toBe(20);
    expect(
      claimWindowSession({
        agentId: "main-live",
        callerViewId: 20,
        detachedAgents,
      })
    ).toBe(true);
    expect(
      claimWindowSession({
        agentId: "other-window",
        callerViewId: 20,
        detachedAgents,
      })
    ).toBe(false);
  });
});
