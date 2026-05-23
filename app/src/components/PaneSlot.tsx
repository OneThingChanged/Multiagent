import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toolForId } from "../types";
import type {
  Agent,
  AgentStatus,
  DragState,
  DropTargetState,
  DropZone,
  LeafNode,
  Path,
  TerminalEntry,
} from "../types";
import { activeAgentInLeaf, pathEq } from "../lib/layout";
import {
  clampTerminalFontSize,
  computeDropZone,
  createEntry,
  saveTerminalFontSize,
} from "../lib/terminal";

export type RenderCtx = {
  agents: Agent[];
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
};

export function PaneSlot({
  leaf,
  path,
  ctx,
}: {
  leaf: LeafNode;
  path: Path;
  ctx: RenderCtx;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const active = pathEq(path, ctx.activePath);
  const activeAgentId = activeAgentInLeaf(leaf);
  const activeAgent = activeAgentId
    ? ctx.agents.find((a) => a.id === activeAgentId) ?? null
    : null;
  const { termsRef, setAgentStatus } = ctx;

  // Latest-agent ref read inside the spawn effect; lets that effect depend
  // only on agent.id (not on status, which flips often).
  const activeAgentRef = useRef<Agent | null>(activeAgent);
  useEffect(() => {
    activeAgentRef.current = activeAgent;
  }, [activeAgent]);

  useEffect(() => {
    const container = bodyRef.current;
    if (!container || !activeAgent) return;
    const agentId = activeAgent.id;

    let entry = termsRef.current.get(agentId);
    if (!entry) {
      entry = createEntry(agentId, ctx.onOpenMarkdownPath);
      termsRef.current.set(agentId, entry);
    }

    if (
      container.firstChild !== entry.el ||
      container.childNodes.length !== 1
    ) {
      container.replaceChildren(entry.el);
    }
    if (!entry.opened) {
      entry.term.open(entry.el);
      entry.opened = true;
    }

    let lastCols = 0;
    let lastRows = 0;
    let debounceTimer: number | undefined;

    const apply = () => {
      const e = termsRef.current.get(agentId);
      if (!e) return;
      if (e.el.clientWidth === 0 || e.el.clientHeight === 0) return;
      try {
        e.fit.fit();
      } catch {
        return;
      }
      const { cols, rows } = e.term;
      if (cols < 2 || rows < 2) return;

      if (!e.spawned) {
        e.spawned = true;
        lastCols = cols;
        lastRows = rows;
        const cur = activeAgentRef.current;
        if (!cur || cur.id !== agentId) return;
        if (cur.status === "idle") {
          setAgentStatus(agentId, "starting");
        }
        const tool = toolForId(cur.aiToolId);
        let initCommand: string | null = null;
        if (tool.command) {
          let cmd = tool.command;
          const sessionId = ctx.sessionPins?.[cur.id] ?? cur.lastSessionId;
          if (sessionId) {
            if (cur.aiToolId === "codex") {
              cmd = `${cmd} resume ${sessionId}`;
            } else if (cur.aiToolId === "claude") {
              cmd = `${cmd} --resume ${sessionId}`;
            }
          }
          if (cur.dangerous && tool.dangerousFlag) {
            cmd = `${cmd} ${tool.dangerousFlag}`;
          }
          initCommand = cmd;
        }
        invoke("spawn_pty", {
          id: agentId,
          shell: null,
          cwd: cur.folder || null,
          initCommand,
          aiToolId: cur.aiToolId,
          cols,
          rows,
        }).catch((err) => {
          e.term.write(`\r\n\x1b[31mspawn failed: ${err}\x1b[0m\r\n`);
        });
      } else if (cols !== lastCols || rows !== lastRows) {
        lastCols = cols;
        lastRows = rows;
        invoke("resize_pty", { id: agentId, cols, rows }).catch(() => {});
      }
    };

    const scheduleApply = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(apply, entry!.spawned ? 200 : 30);
    };

    const ro = new ResizeObserver(scheduleApply);
    ro.observe(entry.el);
    scheduleApply();

    const wheelHandler = (e: WheelEvent) => {
      const targetEntry = termsRef.current.get(agentId);
      if (!targetEntry) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey) {
        const current = clampTerminalFontSize(
          targetEntry.term.options.fontSize ?? 13
        );
        const next = clampTerminalFontSize(current + (e.deltaY < 0 ? 1 : -1));
        if (next === current) return;
        saveTerminalFontSize(next);

        for (const [entryId, entry] of termsRef.current) {
          entry.term.options.fontSize = next;
          if (
            !entry.spawned ||
            !entry.el.isConnected ||
            entry.el.clientWidth === 0 ||
            entry.el.clientHeight === 0
          ) {
            continue;
          }
          try {
            entry.fit.fit();
          } catch {
            continue;
          }
          const { cols, rows } = entry.term;
          if (cols < 2 || rows < 2) continue;
          if (entryId === agentId) {
            lastCols = cols;
            lastRows = rows;
          }
          invoke("resize_pty", { id: entryId, cols, rows }).catch(() => {});
        }
        return;
      }
      const dir = e.deltaY > 0 ? 1 : -1;
      const magnitude = e.shiftKey ? 10 : 3;
      targetEntry.term.scrollLines(dir * magnitude);
    };
    container.addEventListener("wheel", wheelHandler, {
      passive: false,
      capture: true,
    });

    return () => {
      ro.disconnect();
      window.clearTimeout(debounceTimer);
      container.removeEventListener("wheel", wheelHandler, {
        capture: true,
      } as EventListenerOptions);
    };
  }, [
    activeAgent?.id,
    termsRef,
    setAgentStatus,
    ctx.onOpenMarkdownPath,
    ctx.sessionPins,
  ]);

  useEffect(() => {
    if (!active || !activeAgent) return;
    const entry = termsRef.current.get(activeAgent.id);
    if (!entry) return;
    const raf = requestAnimationFrame(() => entry.term.focus());
    return () => cancelAnimationFrame(raf);
  }, [active, activeAgent?.id, termsRef]);

  const dragFrom = ctx.dragState?.fromAgentId ?? null;
  const overlayZone =
    ctx.dropTarget && ctx.dropTarget.leafId === leaf.id
      ? ctx.dropTarget.zone
      : null;

  const dragAgentIdFromEvent = (e: React.DragEvent) =>
    ctx.dragState?.fromAgentId ||
    e.dataTransfer.getData("application/x-multiagent-agent") ||
    e.dataTransfer.getData("text/plain");

  const canDropAgent = (agentId: string | null) => {
    if (!agentId) return false;
    return !(leaf.tabs.includes(agentId) && leaf.tabs.length === 1);
  };

  const onTabDragStart = (e: React.DragEvent, tabAgentId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tabAgentId);
    e.dataTransfer.setData("application/x-multiagent-agent", tabAgentId);
    ctx.onDragStart(tabAgentId);
  };
  const onTabDragEnd = () => {
    ctx.onDragEnd();
  };
  const onPaneDragOver = (e: React.DragEvent) => {
    const agentId = dragAgentIdFromEvent(e);
    if (!canDropAgent(agentId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const zone = computeDropZone(rect, e.clientX, e.clientY);
    if (
      !ctx.dropTarget ||
      ctx.dropTarget.leafId !== leaf.id ||
      ctx.dropTarget.zone !== zone
    ) {
      ctx.onDropTargetChange({ leafId: leaf.id, zone });
    }
  };
  const onPaneDragLeave = (e: React.DragEvent) => {
    const nextTarget = e.relatedTarget;
    if (
      nextTarget instanceof Node &&
      e.currentTarget.contains(nextTarget)
    ) {
      return;
    }
    if (ctx.dropTarget?.leafId === leaf.id) {
      ctx.onDropTargetChange(null);
    }
  };
  const onPaneDrop = (e: React.DragEvent) => {
    const agentId = dragAgentIdFromEvent(e);
    if (!canDropAgent(agentId)) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const zone = computeDropZone(rect, e.clientX, e.clientY);
    ctx.onDrop(agentId, leaf.id, zone);
    ctx.onDragEnd();
  };

  return (
    <div
      className={`pane-slot ${active ? "pane-active" : ""}`}
      onMouseDown={() => ctx.setActivePath(path)}
      onDragOver={onPaneDragOver}
      onDragLeave={onPaneDragLeave}
      onDrop={onPaneDrop}
    >
      <div className="pane-tabs">
        {leaf.tabs.map((tabAgentId) => {
          const tabAgent = ctx.agents.find((a) => a.id === tabAgentId);
          if (!tabAgent) return null;
          const isActive = tabAgentId === activeAgentId;
          const isDragging = dragFrom === tabAgentId;
          const tool = toolForId(tabAgent.aiToolId);
          return (
            <div
              key={tabAgentId}
              className={`pane-tab ${isActive ? "tab-active" : ""} ${isDragging ? "tab-dragging" : ""}`}
              draggable
              onDragStart={(e) => onTabDragStart(e, tabAgentId)}
              onDragEnd={onTabDragEnd}
              onMouseDown={(e) => {
                e.stopPropagation();
                ctx.onSelectTab(path, tabAgentId);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                ctx.onTabContextMenu(path, tabAgentId, e.clientX, e.clientY);
              }}
              title={tabAgent.name}
            >
              <span
                className="tab-tool-icon"
                style={{ color: tool.iconColor }}
              >
                {tool.icon}
              </span>
              <span className="tab-name">{tabAgent.name}</span>
              {tabAgent.dangerous && (
                <span className="tab-danger" title="Dangerous mode">
                  ⚠
                </span>
              )}
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onCloseTab(path, tabAgentId);
                }}
                title="Close tab"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div ref={bodyRef} className="pane-body" />
      {overlayZone && (
        <div className={`drop-overlay drop-overlay-${overlayZone}`} />
      )}
    </div>
  );
}
