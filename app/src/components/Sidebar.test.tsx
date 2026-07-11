import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Project } from "../types";

function renderSidebar(projects: Project[]) {
  return renderToStaticMarkup(
    <Sidebar
      projects={projects}
      agents={[]}
      groups={[]}
      activeProjectId={projects[0]?.id ?? null}
      activeGroupId={null}
      activeAgentId={null}
      inGroupAgentIds={new Set()}
      dragState={null}
      onSelectProject={() => {}}
      onSelect={() => {}}
      onRenameSession={() => {}}
      onContextMenu={() => {}}
      onNewProject={() => {}}
      onNewSession={() => {}}
      docsOpen={false}
      onToggleDocs={() => {}}
      alwaysOnTop={false}
      onToggleAlwaysOnTop={() => {}}
      desktopPetEnabled={true}
      desktopPetAvailable={true}
      onToggleDesktopPet={() => {}}
      onOpenNewWindow={() => {}}
      settingsOpen={false}
      onToggleSettings={() => {}}
      onRemove={() => {}}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onReorderProject={() => {}}
      onProjectContextMenu={() => {}}
    />
  );
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
    expect(html).toContain("Select project, then click + to start a session");
  });
});
