import { describe, expect, it, vi } from "vitest";
import { RemoteSessionCreateBroker } from "./remote-session-create-broker.mjs";

function idFactory(...ids) {
  return () => ids.shift();
}

describe("RemoteSessionCreateBroker", () => {
  it("resolves only after the renderer confirms the matching request", async () => {
    const dispatch = vi.fn(() => true);
    const broker = new RemoteSessionCreateBroker({
      dispatch,
      timeoutMs: 1_000,
      idFactory: idFactory("agent-created", "request-1"),
    });

    const resultPromise = broker.create({ projectId: "project-a", name: "Remote" });
    expect(dispatch).toHaveBeenCalledWith({
      requestId: "request-1",
      id: "agent-created",
      projectId: "project-a",
      name: "Remote",
    });
    expect(broker.complete({
      requestId: "request-1",
      id: "another-agent",
      ok: true,
    })).toBe(false);
    expect(broker.complete({
      requestId: "request-1",
      id: "agent-created",
      ok: true,
    })).toBe(true);
    await expect(resultPromise).resolves.toEqual({ id: "agent-created" });
  });

  it("propagates the renderer failure and its HTTP status", async () => {
    const broker = new RemoteSessionCreateBroker({
      dispatch: () => true,
      timeoutMs: 1_000,
      idFactory: idFactory("agent-created", "request-2"),
    });

    const resultPromise = broker.create({});
    broker.complete({
      requestId: "request-2",
      id: "agent-created",
      ok: false,
      error: "프로젝트가 사라졌습니다.",
      statusCode: 409,
    });

    await expect(resultPromise).rejects.toMatchObject({
      message: "프로젝트가 사라졌습니다.",
      statusCode: 409,
    });
  });

  it("fails immediately when no coordinator can receive the request", async () => {
    const broker = new RemoteSessionCreateBroker({
      dispatch: () => false,
      timeoutMs: 1_000,
      idFactory: idFactory("agent-created", "request-3"),
    });

    await expect(broker.create({})).rejects.toMatchObject({ statusCode: 503 });
  });

  it("times out requests that never receive an acknowledgement", async () => {
    vi.useFakeTimers();
    try {
      const broker = new RemoteSessionCreateBroker({
        dispatch: () => true,
        timeoutMs: 50,
        idFactory: idFactory("agent-created", "request-4"),
      });
      const resultPromise = broker.create({});
      const assertion = expect(resultPromise).rejects.toMatchObject({ statusCode: 504 });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
