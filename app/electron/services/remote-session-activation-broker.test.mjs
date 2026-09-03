import { describe, expect, it, vi } from "vitest";
import { RemoteSessionActivationBroker } from "./remote-session-activation-broker.mjs";

function idFactory(...ids) {
  return () => ids.shift();
}

describe("RemoteSessionActivationBroker", () => {
  it("resolves only after the renderer confirms an active PTY", async () => {
    let active = false;
    const dispatch = vi.fn(() => true);
    const broker = new RemoteSessionActivationBroker({
      dispatch,
      isActive: () => active,
      timeoutMs: 1_000,
      idFactory: idFactory("11111111-1111-4111-8111-111111111111"),
    });

    const resultPromise = broker.activate("agent-1");
    expect(dispatch).toHaveBeenCalledWith({
      requestId: "11111111-1111-4111-8111-111111111111",
      id: "agent-1",
    });
    active = true;
    expect(broker.complete({
      requestId: "11111111-1111-4111-8111-111111111111",
      id: "agent-1",
      ok: true,
    })).toBe(true);
    await expect(resultPromise).resolves.toEqual({
      id: "agent-1",
      active: true,
      restarted: true,
    });
  });

  it("returns immediately when the PTY is already active", async () => {
    const dispatch = vi.fn(() => true);
    const broker = new RemoteSessionActivationBroker({
      dispatch,
      isActive: () => true,
    });

    await expect(broker.activate("agent-1")).resolves.toEqual({
      id: "agent-1",
      active: true,
      restarted: false,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects false acknowledgements and missing PTYs", async () => {
    const broker = new RemoteSessionActivationBroker({
      dispatch: () => true,
      isActive: () => false,
      timeoutMs: 1_000,
      idFactory: idFactory(
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ),
    });

    const rejected = broker.activate("agent-1");
    broker.complete({
      requestId: "22222222-2222-4222-8222-222222222222",
      id: "agent-1",
      ok: false,
      error: "세션을 찾을 수 없습니다.",
      statusCode: 404,
    });
    await expect(rejected).rejects.toMatchObject({ statusCode: 404 });

    const missingPty = broker.activate("agent-2");
    broker.complete({
      requestId: "33333333-3333-4333-8333-333333333333",
      id: "agent-2",
      ok: true,
    });
    await expect(missingPty).rejects.toMatchObject({ statusCode: 409 });
  });

  it("fails immediately when no coordinator can receive the request", async () => {
    const broker = new RemoteSessionActivationBroker({
      dispatch: () => false,
      isActive: () => false,
      timeoutMs: 1_000,
      idFactory: idFactory("44444444-4444-4444-8444-444444444444"),
    });

    await expect(broker.activate("agent-1")).rejects.toMatchObject({ statusCode: 503 });
  });
});
