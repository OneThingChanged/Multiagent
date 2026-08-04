import { describe, expect, it } from "vitest";
import { buildDesktopPetUpdate, completionForAgent } from "./desktopPet";

describe("buildDesktopPetUpdate", () => {
  it("keeps the working motion while reporting completed sessions", () => {
    const result = buildDesktopPetUpdate(
      [
        {
          id: "agent-1",
          name: "Implement",
          projectId: "project-1",
          aiToolId: "codex",
          status: "working",
          lastSessionId: "session-working",
        },
        {
          id: "agent-2",
          name: "Review",
          projectId: "project-1",
          aiToolId: "claude",
          status: "running",
          lastSessionId: "session-running",
        },
      ],
      [{ id: "project-1", name: "MultiAgent" }],
      { "agent-1": "펫 작업 목록을 만들어줘" },
      [
        {
          key: "done-1",
          agentId: "agent-3",
          sessionKey: "session-completed",
          title: "Project / Session",
          body: "작업이 끝났어요",
          question: "펫 작업 목록을 만들어줘",
        },
      ]
    );

    expect(result).toMatchObject({
      status: "working",
      workingCount: 1,
      completedCount: 1,
      agentId: "agent-3",
      notificationKey: "done-1",
      question: "펫 작업 목록을 만들어줘",
    });
    expect(result.workingItems[0]).toMatchObject({
      projectName: "MultiAgent",
      agentName: "Implement",
      tool: "Codex",
      question: "펫 작업 목록을 만들어줘",
    });
  });

  it("counts the same session once and excludes it from completed while working", () => {
    const result = buildDesktopPetUpdate(
      [
        {
          id: "agent-1",
          name: "Session A",
          projectId: "project-1",
          aiToolId: "codex",
          status: "working",
          lastSessionId: "shared-session",
        },
        {
          id: "agent-2",
          name: "Session A duplicate",
          projectId: "project-1",
          aiToolId: "codex",
          status: "working",
          lastSessionId: "shared-session",
        },
      ],
      [{ id: "project-1", name: "MultiAgent" }],
      {},
      [
        {
          key: "old-shared",
          agentId: "agent-1",
          sessionKey: "shared-session",
          title: "MultiAgent / Session A",
          body: "작업이 끝났어요",
          question: null,
        },
        {
          key: "old-completed",
          agentId: "agent-3",
          sessionKey: "completed-session",
          title: "MultiAgent / Session B",
          body: "작업이 끝났어요",
          question: null,
        },
        {
          key: "latest-completed",
          agentId: "agent-3",
          sessionKey: "completed-session",
          title: "MultiAgent / Session B",
          body: "작업이 끝났어요",
          question: null,
        },
      ]
    );

    expect(result).toMatchObject({
      status: "working",
      workingCount: 1,
      completedCount: 1,
      notificationKey: "latest-completed",
    });
  });

  it("shows working, running, and idle aggregate states", () => {
    const agent = {
      id: "agent-1",
      name: "Session",
      projectId: "project-1",
      aiToolId: "codex",
    };
    expect(
      buildDesktopPetUpdate([{ ...agent, status: "working" }], [], {}, []).status
    ).toBe("working");
    expect(
      buildDesktopPetUpdate([{ ...agent, status: "starting" }], [], {}, []).status
    ).toBe("running");
    expect(
      buildDesktopPetUpdate([{ ...agent, status: "recovering" }], [], {}, []).status
    ).toBe("running");
    expect(
      buildDesktopPetUpdate([{ ...agent, status: "exited" }], [], {}, []).status
    ).toBe("idle");
  });

  it("includes the submitted question in completion text", () => {
    const completion = completionForAgent(
      { id: "agent-1", name: "Session", projectId: "project-1" },
      [{ id: "project-1", name: "MultiAgent" }],
      "작업 질문을 한 줄로 보여줘"
    );

    expect(completion.body).toBe("완료 · 작업 질문을 한 줄로 보여줘");
    expect(completion.question).toBe("작업 질문을 한 줄로 보여줘");
    expect(completion.sessionKey).toBe("agent-1");
  });

  it("shows hook waiting state and uses the provider session once", () => {
    const result = buildDesktopPetUpdate(
      [
        {
          id: "agent-waiting",
          name: "Session",
          projectId: "project-1",
          aiToolId: "claude",
          status: "waiting",
          activity: {
            workStatus: "waiting",
            source: "hook",
            receivedAt: Date.now(),
            stateStartedAt: Date.now(),
            providerSessionId: "provider-session",
            interactiveQuestion: "배포할까요?",
          },
        },
      ],
      [{ id: "project-1", name: "MultiAgent" }],
      {},
      []
    );
    expect(result).toMatchObject({ status: "working", workingCount: 1 });
    expect(result.workingItems[0].question).toBe("배포할까요?");
  });
});
