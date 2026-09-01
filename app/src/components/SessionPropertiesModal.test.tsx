import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Agent, Project } from "../types";
import {
  nextSessionPropertiesTabIndex,
  SessionPropertiesModal,
} from "./SessionPropertiesModal";

const agent: Agent = {
  id: "agent-1",
  projectId: "project-1",
  name: "Weather",
  folder: "K:\\AI\\Weather",
  aiToolId: "codex",
  aiLabel: "Codex",
  dangerous: false,
  status: "idle",
  createdAt: 1,
  lastSessionId: "session-1",
};

const project: Project = {
  id: "project-1",
  name: "Weather Project",
  folder: "K:\\AI\\Weather",
  createdAt: 1,
};

describe("SessionPropertiesModal", () => {
  it("separates session properties into accessible tabs", () => {
    const html = renderToStaticMarkup(
      <SessionPropertiesModal
        agent={agent}
        project={project}
        onUpdateAgent={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain("기본 정보");
    expect(html).toContain("세션 데이터");
    expect(html).toContain("실행 옵션");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("JSONL 카탈로그");
    expect(html).toContain("Dangerous 모드");
  });

  it("supports wrapping arrow navigation and Home/End", () => {
    expect(nextSessionPropertiesTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextSessionPropertiesTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextSessionPropertiesTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextSessionPropertiesTabIndex(1, "Home", 3)).toBe(0);
    expect(nextSessionPropertiesTabIndex(1, "End", 3)).toBe(2);
  });
});
