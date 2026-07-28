import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContextMenu, TabContextMenu } from "./Menus";

describe("ContextMenu", () => {
  it("offers opening and explicitly deleting a session", () => {
    const html = renderToStaticMarkup(
      <ContextMenu
        state={{ agentId: "agent-1", x: 0, y: 0 }}
        hasActive={false}
        canPlaceInActive={false}
        isSessionLocked={false}
        canPinSession={false}
        canDeactivate={false}
        onClose={() => {}}
        onAction={() => {}}
      />
    );

    expect(html).toContain("새 창에서 열기");
    expect(html).toContain("세션 삭제");
    expect(html).toContain("ctx-item-danger");
  });
});

describe("TabContextMenu", () => {
  it("shows split, pin, close and color actions", () => {
    const html = renderToStaticMarkup(
      <TabContextMenu
        state={{ agentId: "agent-1", path: [], x: 0, y: 0 }}
        pinned={false}
        tabColor={null}
        canReopen={true}
        onDismiss={() => {}}
        onSplit={() => {}}
        onTogglePin={() => {}}
        onCloseTab={() => {}}
        onCloseOthers={() => {}}
        onCloseRight={() => {}}
        onRename={() => {}}
        onSetColor={() => {}}
        onReopen={() => {}}
        chatMode={false}
        onToggleChat={() => {}}
        canChat={true}
        canRevealInExplorer={false}
        onRevealInExplorer={() => {}}
      />
    );

    expect(html).toContain("오른쪽으로 분할");
    expect(html).toContain("탭 고정");
    expect(html).toContain("다른 탭 닫기");
    expect(html).toContain("탭 색상");
    expect(html).toContain("Ctrl+Shift+T");
    expect(html).not.toContain("탐색기에서 보기");
  });

  it("shows unpin label when the tab is pinned", () => {
    const html = renderToStaticMarkup(
      <TabContextMenu
        state={{ agentId: "agent-1", path: [], x: 0, y: 0 }}
        pinned={true}
        tabColor="#4c8bf5"
        canReopen={false}
        onDismiss={() => {}}
        onSplit={() => {}}
        onTogglePin={() => {}}
        onCloseTab={() => {}}
        onCloseOthers={() => {}}
        onCloseRight={() => {}}
        onRename={() => {}}
        onSetColor={() => {}}
        onReopen={() => {}}
        chatMode={false}
        onToggleChat={() => {}}
        canChat={true}
        canRevealInExplorer={false}
        onRevealInExplorer={() => {}}
      />
    );

    expect(html).toContain("탭 고정 해제");
  });

  it("offers reveal in Explorer for a local file tab", () => {
    const html = renderToStaticMarkup(
      <TabContextMenu
        state={{ agentId: "doc:project:docs/report.html", path: [], x: 0, y: 0 }}
        pinned={false}
        tabColor={null}
        canReopen={false}
        onDismiss={() => {}}
        onSplit={() => {}}
        onTogglePin={() => {}}
        onCloseTab={() => {}}
        onCloseOthers={() => {}}
        onCloseRight={() => {}}
        onRename={() => {}}
        onSetColor={() => {}}
        onReopen={() => {}}
        chatMode={false}
        onToggleChat={() => {}}
        canChat={false}
        canRevealInExplorer={true}
        onRevealInExplorer={() => {}}
      />
    );

    expect(html).toContain("탐색기에서 보기");
  });
});
