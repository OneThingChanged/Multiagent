import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Agent, Group, Project, ProjectFolder } from "../types";

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
    projectFolders?: ProjectFolder[];
    browserHub?: boolean;
  } = {}
) {
  return renderToStaticMarkup(
    <Sidebar
      projects={projects}
      projectFolders={options.projectFolders ?? []}
      agents={agents}
      groups={groups}
      activeProjectId={projects[0]?.id ?? null}
      activeGroupId={activeGroupId}
      activeAgentId={null}
      inGroupAgentIds={new Set()}
      detachedAgentIds={options.detachedAgentIds ?? new Set()}
      unreadCompletedAgentIds={options.unreadCompletedAgentIds ?? new Set()}
      dragState={null}
      browserHubActive={options.browserHub}
      browserCount={options.browserHub ? 2 : 0}
      onOpenBrowserHub={options.browserHub ? () => {} : undefined}
      onSelectProject={() => {}}
      onSelect={() => {}}
      onSelectScreen={() => {}}
      onRenameSession={() => {}}
      onContextMenu={() => {}}
      onNewProject={() => {}}
      onNewProjectFolder={() => {}}
      onNewSessionForProject={() => {}}
      onDeactivate={() => {}}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onMoveProject={() => {}}
      onReorderProjectFolder={() => {}}
      onProjectContextMenu={() => {}}
      onProjectFolderContextMenu={() => {}}
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

function stubSidebarState(values: Record<string, string>) {
  const state = new Map(Object.entries(values));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => state.get(key) ?? null,
    setItem: (key: string, value: string) => state.set(key, value),
  });
}

describe("Sidebar", () => {
  it("keeps dormant restored sessions visible with a blue standby marker in active-only mode", () => {
    stubSidebarState({ "multiagent.activeOnly.v1": "1" });
    const html = renderSidebar(
      [{ id: "p", name: "Project", folder: "C:/p", createdAt: 1 }],
      [{ ...agent("dormant", "p"), deferredStart: true, resumeEligible: true }],
    );
    expect(html).toContain("DORMANT");
    expect(html).toContain("status-standby");
    expect(html).not.toContain("status-running");
  });

  it("hides never-started and deactivated sessions from active-only without blue markers", () => {
    const projects = [{ id: "p", name: "Project", folder: "C:/p", createdAt: 1 }];
    const inactive = { ...agent("never-started", "p"), deferredStart: true, resumeEligible: false };
    stubSidebarState({ "multiagent.activeOnly.v1": "1" });
    expect(renderSidebar(projects, [inactive])).not.toContain("NEVER-STARTED");
    stubSidebarState({ "multiagent.activeOnly.v1": "0" });
    const html = renderSidebar(projects, [inactive]);
    expect(html).toContain("NEVER-STARTED");
    expect(html).toContain("status-idle");
    expect(html).not.toContain("status-standby");
  });

  afterEach(() => vi.unstubAllGlobals());

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

  it("places the global browser hub above the project section", () => {
    const html = renderSidebar([], [], [], null, { browserHub: true });

    expect(html).toContain("브라우저 모아보기");
    expect(html).toContain("browser-hub-sidebar-count\">2");
    expect(html.indexOf("브라우저 모아보기")).toBeLessThan(html.indexOf("Projects"));
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

  it("groups projects in one-level virtual folders and keeps uncategorized projects", () => {
    const projects: Project[] = [
      {
        id: "project-a",
        name: "Project A",
        folder: "K:\\AI\\A",
        projectFolderId: "folder-work",
        createdAt: 1,
      },
      {
        id: "project-b",
        name: "Project B",
        folder: "K:\\AI\\B",
        createdAt: 1,
      },
    ];
    const html = renderSidebar(projects, [], [], null, {
      projectFolders: [
        {
          id: "folder-work",
          name: "업무",
          machineKey: "local",
          createdAt: 1,
        },
        {
          id: "folder-empty",
          name: "빈 폴더",
          machineKey: "local",
          createdAt: 2,
        },
      ],
    });

    expect(html).toContain("업무");
    expect(html).toContain("미분류");
    expect(html).toContain("빈 폴더");
    expect(html).toContain("Project A");
    expect(html).toContain("Project B");
    expect(html).toContain("프로젝트를 여기로 끌어오세요");
  });

  it("keeps projects collapsible while active-only filtering is enabled", () => {
    stubSidebarState({
      "multiagent.activeOnly.v1": "1",
      "multiagent.expandedProjects.v1": "[]",
    });
    const runningAgent = {
      ...agent("active-session", "project-a"),
      status: "recovering" as const,
      runtimeStatus: "recovering" as const,
    };

    const html = renderSidebar(
      [{ id: "project-a", name: "Project A", folder: "K:\\AI\\A", createdAt: 1 }],
      [runningAgent]
    );

    expect(html).toContain('title="Expand project"');
    expect(html).toContain("Project A");
    expect(html).not.toContain("ACTIVE-SESSION");
  });

  it("keeps project folders collapsible while active-only filtering is enabled", () => {
    stubSidebarState({
      "multiagent.activeOnly.v1": "1",
      "multiagent.expandedProjects.v1": '["project-a"]',
      "multiagent.collapsedProjectFolders.v1": '["folder-work"]',
    });
    const runningAgent = {
      ...agent("active-session", "project-a"),
      status: "running" as const,
    };
    const projects: Project[] = [
      {
        id: "project-a",
        name: "Project A",
        folder: "K:\\AI\\A",
        projectFolderId: "folder-work",
        createdAt: 1,
      },
    ];

    const html = renderSidebar(projects, [runningAgent], [], null, {
      projectFolders: [
        { id: "folder-work", name: "업무", machineKey: "local", createdAt: 1 },
      ],
    });

    expect(html).toContain('title="폴더 펼치기"');
    expect(html).toContain("업무");
    expect(html).not.toContain("Project A");
    expect(html).not.toContain("ACTIVE-SESSION");
  });
});
