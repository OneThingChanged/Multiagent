import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Agent, Group, Project } from "../types";

function renderSidebar(
  projects: Project[],
  agents: Agent[] = [],
  groups: Group[] = [],
  activeGroupId: string | null = null,
  options: {
    detachedAgentIds?: Set<string>;
    unreadCompletedAgentIds?: Set<string>;
    sessionPickerMode?: boolean;
    detachedLabel?: string;
  } = {}
) {
  return renderToStaticMarkup(
    <Sidebar
      projects={projects}
      agents={agents}
      groups={groups}
      activeProjectId={projects[0]?.id ?? null}
      activeGroupId={activeGroupId}
      activeAgentId={null}
      inGroupAgentIds={new Set()}
      detachedAgentIds={options.detachedAgentIds ?? new Set()}
      unreadCompletedAgentIds={options.unreadCompletedAgentIds ?? new Set()}
      dragState={null}
      onSelectProject={() => {}}
      onSelect={() => {}}
      onSelectScreen={() => {}}
      onRenameSession={() => {}}
      onContextMenu={() => {}}
      onNewProject={() => {}}
      onNewSessionForProject={() => {}}
      onDeactivate={() => {}}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onReorderProject={() => {}}
      onProjectContextMenu={() => {}}
      sessionPickerMode={options.sessionPickerMode}
      detachedLabel={options.detachedLabel}
    />
  );
}

function agent(id: string, projectId: string): Agent {
  return {
    id,
    projectId,
    name: id.toUpperCase(),
    folder: `K:\\AI\\${projectId}`,
    aiToolId: "codex",
    aiLabel: "Codex",
    dangerous: false,
    status: "idle",
    createdAt: 1,
  };
}

describe("Sidebar", () => {
  it("shows projects that do not have sessions yet", () => {
    const html = renderSidebar([
      {
        id: "project-empty",
        name: "Empty Project",
        folder: "K:\\AI\\Empty",
        createdAt: 1,
      },
    ]);

    expect(html).toContain("Empty Project");
    expect(html).toContain("프로젝트 행의 + 버튼으로 세션을 시작하세요");
  });

  it("shows split groups above projects as colored screens", () => {
    const projects: Project[] = [
      { id: "project-a", name: "Project A", folder: "K:\\AI\\A", createdAt: 1 },
      { id: "project-b", name: "Project B", folder: "K:\\AI\\B", createdAt: 1 },
    ];
    const agents = [
      agent("a", "project-a"),
      agent("b", "project-b"),
      agent("c", "project-a"),
      agent("d", "project-b"),
    ];
    const groups: Group[] = [
      {
        id: "screen-ab",
        layout: {
          type: "split",
          id: "split-ab",
          direction: "h",
          sizes: [0.5, 0.5],
          children: [
            { type: "leaf", id: "leaf-a", tabs: ["a"], activeIndex: 0 },
            { type: "leaf", id: "leaf-b", tabs: ["b"], activeIndex: 0 },
          ],
        },
      },
      {
        id: "screen-cd",
        layout: {
          type: "split",
          id: "split-cd",
          direction: "v",
          sizes: [0.5, 0.5],
          children: [
            { type: "leaf", id: "leaf-c", tabs: ["c"], activeIndex: 0 },
            { type: "leaf", id: "leaf-d", tabs: ["d"], activeIndex: 0 },
          ],
        },
      },
    ];

    const html = renderSidebar(projects, agents, groups, "screen-ab");

    expect(html).toContain("SCREENS");
    expect(html).toContain("Screen 1");
    expect(html).toContain("(A + B)");
    expect(html).toContain("Screen 2");
    expect(html).toContain("(C + D)");
    expect(html.match(/>S1<\/span>/g)).toHaveLength(2);
    expect(html.match(/>S2<\/span>/g)).toHaveLength(2);
    expect(html).toContain("screen-group-row-active");
  });

  it("does not promote a tab-only group to a screen", () => {
    const projects: Project[] = [
      { id: "project-a", name: "Project A", folder: "K:\\AI\\A", createdAt: 1 },
    ];
    const agents = [agent("a", "project-a"), agent("b", "project-a")];
    const groups: Group[] = [
      {
        id: "tabs-ab",
        layout: {
          type: "leaf",
          id: "leaf-ab",
          tabs: ["a", "b"],
          activeIndex: 0,
        },
      },
    ];

    const html = renderSidebar(projects, agents, groups);

    expect(html).not.toContain("SCREENS");
    expect(html).not.toContain(">S1</span>");
  });

  it("shows management controls and unavailable sessions in picker mode", () => {
    const projects: Project[] = [
      { id: "project-a", name: "Project A", folder: "K:\\AI\\A", createdAt: 1 },
    ];
    const html = renderSidebar(
      projects,
      [agent("available", "project-a"), agent("busy", "project-a")],
      [],
      null,
      {
        detachedAgentIds: new Set(["busy"]),
        sessionPickerMode: true,
        detachedLabel: "사용 중",
      }
    );

    expect(html).toContain("Projects · 세션 선택");
    expect(html).toContain("AVAILABLE");
    expect(html).toContain("BUSY");
    expect(html).toContain("사용 중");
    expect(html).toContain('title="New project"');
    expect(html).toContain('title="활성 세션만 보기"');
    expect(html).not.toContain('title="Remove session"');
  });

  it("marks sessions with unread completed work", () => {
    const projects: Project[] = [
      { id: "project-a", name: "Project A", folder: "K:\\AI\\A", createdAt: 1 },
    ];
    const html = renderSidebar(
      projects,
      [agent("done", "project-a"), agent("read", "project-a")],
      [],
      null,
      { unreadCompletedAgentIds: new Set(["done"]) }
    );

    expect(html).toContain("agent-completion-unread");
    expect(html).toContain("읽지 않은 작업 완료");
    expect(html.match(/agent-completion-dot/g)).toHaveLength(1);
  });

  it("uses the sidebar x action only to deactivate a session", () => {
    const projects: Project[] = [
      { id: "project-a", name: "Project A", folder: "K:\\AI\\A", createdAt: 1 },
    ];
    const html = renderSidebar(projects, [agent("session-a", "project-a")]);

    expect(html).toContain('title="세션 비활성화"');
    expect(html).toContain('aria-label="SESSION-A 세션 비활성화"');
    expect(html).not.toContain("Remove session");
  });
});
