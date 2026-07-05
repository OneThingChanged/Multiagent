import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContextMenu } from "./Menus";

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
