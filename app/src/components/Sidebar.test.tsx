import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Agent, Group, Project } from "../types";

function renderSidebar(
  projects: Project[],
  agents: Agent[] = [],
  groups: Group[] = [],
  activeGroupId: string | null = null
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
      dragState={null}
      onSelectProject={() => {}}
      onSelect={() => {}}
      onSelectScreen={() => {}}
      onRenameSession={() => {}}
      onContextMenu={() => {}}
      onNewProject={() => {}}
      onNewSessionForProject={() => {}}
      onRemove={() => {}}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onReorderProject={() => {}}
      onProjectContextMenu={() => {}}
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
});
