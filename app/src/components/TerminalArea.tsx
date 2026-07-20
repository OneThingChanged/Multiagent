import { useEffect } from "react";
import { getCurrentWebview } from "../platform/runtime";
import type {
  Agent,
  AgentStatus,
  DragState,
  DropTargetState,
  DropZone,
  LayoutNode,
  Path,
  Project,
  TerminalEntry,
} from "../types";
import type { AppThemeId } from "../lib/appTheme";
import { formatDroppedPathForTerminal, hasExternalFiles } from "../lib/fileDrop";
import { computeDropZone } from "../lib/terminal";
import { PaneSlot } from "./PaneSlot";
import type { RenderCtx } from "./PaneSlot";
import { Splitter } from "./Splitter";

function parsePanePath(value: string | undefined) {
  if (value === undefined) return null;
  if (value === "") return [];
  const path = value.split(",").map((part) => Number(part));
  return path.every((part) => Number.isInteger(part) && part >= 0)
    ? path
    : null;
}

function pastePathsToTerminal(
  entry: TerminalEntry | undefined,
  paths: string[]
) {
  if (!entry || paths.length === 0) return false;
  const text = paths.map(formatDroppedPathForTerminal).filter(Boolean).join(" ");
  if (!text) return false;
  entry.term.focus();
  entry.term.clearSelection();
  entry.term.paste(text);
  return true;
}

function paneDropTargetAt(
  clientX: number,
  clientY: number,
  fromAgentId: string
): DropTargetState | null {
  const pane = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>("[data-pane-leaf-id]");
  const leafId = pane?.dataset.paneLeafId;
  if (!pane || !leafId) return null;

  const agentIds = (pane.dataset.paneAgentIds ?? "")
    .split(",")
    .filter(Boolean);
  if (agentIds.length === 1 && agentIds[0] === fromAgentId) {
    return null;
  }

  const zone = computeDropZone(pane.getBoundingClientRect(), clientX, clientY);
  return { leafId, zone };
}

function isOverEmptyState(clientX: number, clientY: number) {
  return !!document
    .elementFromPoint(clientX, clientY)
    ?.closest(".empty-state");
}

export function TerminalArea({
  agents,
  projects,
  theme,
  layout,
  sessionPins,
  activePath,
  dragState,
  dropTarget,
  termsRef,
  setAgentStatus,
  setAgentSessionId,
  setActivePath,
  onCloseTab,
  onSelectTab,
  onResizeAt,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
  onDropToEmpty,
  onTabContextMenu,
  chatModeAgents,
  onToggleChat,
  onOpenMarkdownPath,
  onOpenImagePath,
  onOpenFolderPath,
  onOpenTerminalPath,
}: {
  agents: Agent[];
  projects: Project[];
  theme: AppThemeId;
  layout: LayoutNode | null;
  sessionPins: Record<string, string> | null;
  activePath: Path | null;
  dragState: DragState | null;
  dropTarget: DropTargetState | null;
  termsRef: React.MutableRefObject<Map<string, TerminalEntry>>;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  setAgentSessionId: (id: string, sessionId: string | null) => void;
  setActivePath: (path: Path | null) => void;
  onCloseTab: (path: Path, agentId: string) => void;
  onSelectTab: (path: Path, agentId: string) => void;
  onResizeAt: (path: Path, sizes: number[]) => void;
  onDragStart: (fromAgentId: string) => void;
  onDragEnd: () => void;
  onDropTargetChange: (t: DropTargetState | null) => void;
  onDrop: (from: string, target: string, zone: DropZone) => void;
  onDropToEmpty: (agentId: string) => void;
  onTabContextMenu: (path: Path, agentId: string, x: number, y: number) => void;
  chatModeAgents: Set<string>;
  onToggleChat: (agentId: string) => void;
  onOpenMarkdownPath: (
    agentId: string,
    path: string,
    external?: boolean
  ) => void;
  onOpenImagePath: (agentId: string, path: string) => void;
  onOpenFolderPath: (agentId: string, path: string) => void;
  onOpenTerminalPath: (agentId: string, path: string) => void;
}) {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths;
        if (paths.length === 0) return;

        const scale = window.devicePixelRatio || 1;
        const x = event.payload.position.x / scale;
        const y = event.payload.position.y / scale;
        const pane = document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-pane-active-agent-id]");
        const agentId = pane?.dataset.paneActiveAgentId;
        if (!agentId) return;

        const panePath = parsePanePath(pane.dataset.panePath);
        if (panePath) setActivePath(panePath);
        pastePathsToTerminal(termsRef.current.get(agentId), paths);
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => {
        console.error("listen file drop failed", err);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setActivePath, termsRef]);

  useEffect(() => {
    if (!dragState) return;
    const fromAgentId = dragState.fromAgentId;

    const updateDropTarget = (event: PointerEvent) => {
      const target = paneDropTargetAt(
        event.clientX,
        event.clientY,
        fromAgentId
      );
      onDropTargetChange(target);
      return target;
    };

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      updateDropTarget(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      event.preventDefault();
      const target = updateDropTarget(event);
      if (target) {
        onDrop(fromAgentId, target.leafId, target.zone);
      } else if (!layout && isOverEmptyState(event.clientX, event.clientY)) {
        onDropToEmpty(fromAgentId);
      }
      onDragEnd();
    };

    const handlePointerCancel = () => {
      onDragEnd();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDragEnd();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    dragState,
    layout,
    onDragEnd,
    onDrop,
    onDropTargetChange,
    onDropToEmpty,
  ]);

  const ctx: RenderCtx = {
    agents,
    projects,
    theme,
    sessionPins,
    activePath,
    dragState,
    dropTarget,
    termsRef,
    setAgentStatus,
    setAgentSessionId,
    setActivePath,
    onCloseTab,
    onSelectTab,
    onResizeAt,
    onDragStart,
    onDragEnd,
    onDropTargetChange,
    onDrop,
    onTabContextMenu,
    chatModeAgents,
    onToggleChat,
    onOpenMarkdownPath,
    onOpenImagePath,
    onOpenFolderPath,
    onOpenTerminalPath,
  };
  return (
    <main className="terminal-area">
      {layout ? (
        <NodeRenderer node={layout} path={[]} ctx={ctx} />
      ) : (
        <div
          className="empty-state"
          onDragOver={(event) => {
            if (hasExternalFiles(event.dataTransfer)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "none";
              return;
            }
            const agentId =
              dragState?.fromAgentId ||
              event.dataTransfer.getData("application/x-multiagent-agent") ||
              event.dataTransfer.getData("text/plain");
            if (!agentId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            if (hasExternalFiles(event.dataTransfer)) {
              event.preventDefault();
              return;
            }
            const agentId =
              dragState?.fromAgentId ||
              event.dataTransfer.getData("application/x-multiagent-agent") ||
              event.dataTransfer.getData("text/plain");
            if (!agentId) return;
            event.preventDefault();
            onDropToEmpty(agentId);
            onDragEnd();
          }}
        >
          세션을 선택하세요
        </div>
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
