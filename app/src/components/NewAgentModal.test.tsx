import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewAgentModal } from "./NewAgentModal";

describe("NewAgentModal", () => {
  it("preselects Luna max for both workers when Codex is the default tool", () => {
    const html = renderToStaticMarkup(
      <NewAgentModal
        project={{
          id: "project-1",
          name: "Project 1",
          folder: "K:\\AI\\Project1",
          createdAt: 1,
        }}
        defaultName="Session 1"
        disabledTools={["claude"]}
        onCancel={() => {}}
        onCreate={() => {}}
      />
    );

    expect(html).toContain("문서·HTML 병렬 작업자");
    expect(html.match(/value="codex-luna-max" selected=""/g)).toHaveLength(2);
  });
});
