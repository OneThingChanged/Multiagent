import { describe, expect, it } from "vitest";
import { buildDesktopPetUpdate, completionForAgent } from "./desktopPet";

describe("buildDesktopPetUpdate", () => {
  it("prefers unread completions over working sessions", () => {
    const result = buildDesktopPetUpdate(
      [
        {
          id: "agent-1",
          name: "Implement",
          projectId: "project-1",
          aiToolId: "codex",
          status: "working",
        },
        {
          id: "agent-2",
          name: "Review",
          projectId: "project-1",
          aiToolId: "claude",
          status: "running",
        },
      ],
      [{ id: "project-1", name: "MultiAgent" }],
      { "agent-1": "펫 작업 목록을 만들어줘" },
      [
        {
          key: "done-1",
          agentId: "agent-1",
          title: "Project / Session",
          body: "작업이 끝났어요",
          question: "펫 작업 목록을 만들어줘",
        },
      ]
    );

    expect(result).toMatchObject({
      status: "done",
      workingCount: 1,
      completedCount: 1,
      agentId: "agent-1",
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
  });
});
