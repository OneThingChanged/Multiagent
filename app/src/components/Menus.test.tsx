import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContextMenu, TabContextMenu } from "./Menus";

describe("ContextMenu", () => {
  it("offers opening a session in a new window", () => {
    const html = renderToStaticMarkup(
      <ContextMenu
        state={{ agentId: "agent-1", x: 0, y: 0 }}
        hasActive={false}
        canPlaceInActive={false}
        isSessionLocked={false}
        canPinSession={false}
        canRestart={false}
        canDeactivate={false}
        onClose={() => {}}
        onAction={() => {}}
      />
    );

    expect(html).toContain("새 창에서 열기");
  });
});

describe("TabContextMenu", () => {
  it("shows the recently closed tab action and its shortcut", () => {
    const html = renderToStaticMarkup(
      <TabContextMenu
        state={{ agentId: "agent-1", path: [], x: 0, y: 0 }}
        canReopen={true}
        onClose={() => {}}
        onReopen={() => {}}
        onCloseTab={() => {}}
      />
    );

    expect(html).toContain("최근 닫은 탭 다시 열기");
    expect(html).toContain("Ctrl+Shift+T");
  });
});
