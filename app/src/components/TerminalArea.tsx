import type {
  Agent,
  AgentStatus,
  DragState,
  DropTargetState,
  DropZone,
  LayoutNode,
  Path,
  TerminalEntry,
} from "../types";
import { PaneSlot } from "./PaneSlot";
import type { RenderCtx } from "./PaneSlot";
import { Splitter } from "./Splitter";

export function TerminalArea({
  agents,
  layout,
  sessionPins,
  activePath,
  dragState,
  dropTarget,
  termsRef,
  setAgentStatus,
  setActivePath,
  onCloseTab,
  onSelectTab,
  onResizeAt,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  onTabContextMenu,
  onOpenMarkdownPath,
}: {
  agents: Agent[];
  layout: LayoutNode | null;
  sessionPins: Record<string, string> | null;
  activePath: Path | null;
  dragState: DragState | null;
  dropTarget: DropTargetState | null;
  termsRef: React.MutableRefObject<Map<string, TerminalEntry>>;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  setActivePath: (path: Path | null) => void;
  onCloseTab: (path: Path, agentId: string) => void;
  onSelectTab: (path: Path, agentId: string) => void;
  onResizeAt: (path: Path, sizes: number[]) => void;
  onDragStart: (fromAgentId: string) => void;
  onDragEnd: () => void;
  onDropTargetChange: (t: DropTargetState | null) => void;
  onDrop: (from: string, target: string, zone: DropZone) => void;
  onTabContextMenu: (path: Path, agentId: string, x: number, y: number) => void;
  onOpenMarkdownPath: (agentId: string, path: string) => void;
}) {
  const ctx: RenderCtx = {
    agents,
    sessionPins,
    activePath,
    dragState,
    dropTarget,
    termsRef,
    setAgentStatus,
    setActivePath,
    onCloseTab,
    onSelectTab,
    onResizeAt,
    onDragStart,
    onDragEnd,
    onDropTargetChange,
    onDrop,
    onTabContextMenu,
    onOpenMarkdownPath,
  };
  return (
    <main className="terminal-area">
      {layout ? (
        <NodeRenderer node={layout} path={[]} ctx={ctx} />
      ) : (
        <div className="empty-state">세션을 선택하세요</div>
      )}
    </main>
  );
}

function NodeRenderer({
  node,
  path,
  ctx,
}: {
  node: LayoutNode;
  path: Path;
  ctx: RenderCtx;
}) {
  if (node.type === "leaf") {
    return <PaneSlot leaf={node} path={path} ctx={ctx} />;
  }
  return (
    <Splitter
      direction={node.direction}
      sizes={node.sizes}
      onResize={(sizes) => ctx.onResizeAt(path, sizes)}
    >
      {node.children.map((child, i) => (
        <NodeRenderer
          key={
            child.type === "leaf" ? `leaf-${child.id}` : `split-${child.id}`
          }
          node={child}
          path={[...path, i]}
          ctx={ctx}
        />
      ))}
    </Splitter>
  );
}
