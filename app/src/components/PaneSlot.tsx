import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "../platform/runtime";
import { electronBridge, isElectronRuntime } from "../platform/electronBridge";
import type {
  SpawnTerminalResult,
  TerminalReplay,
} from "../platform/ipcContract";
import { toolForId } from "../types";
import { buildSpawnArgs } from "../lib/spawn";
import type {
  Agent,
  AgentStatus,
  DragState,
  DropTargetState,
  DropZone,
  LeafNode,
  Path,
  Project,
  TerminalEntry,
} from "../types";
import type { AppThemeId } from "../lib/appTheme";
import { activeAgentInLeaf, pathEq } from "../lib/layout";
import {
  docFileExtension,
  docTabBasename,
  isDocTabId,
  parseDocTabId,
} from "../lib/docTabs";
import { DocViewer } from "./DocViewer";
import {
  clampTerminalFontSize,
  computeDropZone,
  createEntry,
  findTerminalLinkAtMouseEvent,
  installImeCompositionPreview,
  openTerminalUrl,
  saveTerminalFontSize,
  scrollTerminalLinesImmediately,
  type TerminalMouseLink,
} from "../lib/terminal";
import { loadScrollback } from "../lib/scrollback";
import {
  extractDroppedFilePaths,
  formatDroppedPathForTerminal,
  hasExternalFiles,
} from "../lib/fileDrop";
import {
  beginTerminalSync,
  completeTerminalSync,
} from "../lib/terminalDelivery";

function sameTerminalLink(a: TerminalMouseLink | null, b: TerminalMouseLink | null) {
  return !!a && !!b && a.kind === b.kind && a.text === b.text;
}

type PendingTabDrag = {
  agentId: string;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
};

export type RenderCtx = {
  agents: Agent[];
  projects: Project[];
  theme: AppThemeId;
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
  onTabContextMenu: (path: Path, agentId: string, x: number, y: number) => void;
  onOpenMarkdownPath: (agentId: string, path: string) => void;
  onOpenImagePath: (agentId: string, path: string) => void;
  onOpenFolderPath: (agentId: string, path: string) => void;
  onOpenTerminalPath: (agentId: string, path: string) => void;
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
  const pendingTabDragRef = useRef<PendingTabDrag | null>(null);
  const suppressNextTabClickRef = useRef(false);
  const active = pathEq(path, ctx.activePath);
  const activeTabId = activeAgentInLeaf(leaf);
  const activeDocId = activeTabId && isDocTabId(activeTabId) ? activeTabId : null;
  const activeAgentId = activeDocId ? null : activeTabId;
  const activeAgent = activeAgentId
    ? ctx.agents.find((a) => a.id === activeAgentId) ?? null
    : null;
  const { termsRef, setAgentStatus, setAgentSessionId } = ctx;

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
    let freshlyCreated = false;
    if (!entry) {
      entry = createEntry(
        agentId,
        ctx.onOpenMarkdownPath,
        ctx.onOpenImagePath,
        ctx.onOpenFolderPath,
        ctx.onOpenTerminalPath,
        { normalizeSshCursorKeys: !!activeAgent.sshHostId }
      );
      termsRef.current.set(agentId, entry);
      freshlyCreated = true;
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
      if (freshlyCreated && !isElectronRuntime()) {
        const saved = loadScrollback(agentId);
        if (saved) {
          entry.term.write(saved);
          entry.term.write(
            "\r\n\x1b[2m--- restored from previous session ---\x1b[0m\r\n"
          );
        }
      }
    }
    installImeCompositionPreview(entry);

    let lastCols = 0;
    let lastRows = 0;
    let debounceTimer: number | undefined;
    let disposed = false;
    let attachStarted = false;

    const restoreSavedScrollback = (target: TerminalEntry) => {
      if (
        target.restoredScrollback ||
        !target.restoreScrollbackOnAttach
      ) return;
      const saved = loadScrollback(agentId);
      if (saved) {
        target.term.write(saved);
        target.term.write(
          "\r\n\x1b[2m--- restored from previous session ---\x1b[0m\r\n"
        );
      }
      target.restoredScrollback = true;
      target.restoreScrollbackOnAttach = false;
    };

    const attachElectronView = async (
      target: TerminalEntry,
      cols: number,
      rows: number
    ) => {
      beginTerminalSync(target);
      let spawnResult: SpawnTerminalResult = { reattached: true };
      if (!target.spawned) {
        target.spawned = true;
        const cur = activeAgentRef.current;
        if (!cur || cur.id !== agentId) return;
        target.spawnPromise = (async () => {
          const { initCommand, ssh, cwd } = await buildSpawnArgs(
            cur,
            ctx.sessionPins,
            setAgentSessionId
          );
          return invoke<SpawnTerminalResult>("spawn_pty", {
            id: agentId,
            shell: null,
            cwd,
            initCommand,
            aiToolId: cur.aiToolId,
            ssh,
            cols,
            rows,
          });
        })();
      }
      if (target.spawnPromise) {
        const pendingSpawn = target.spawnPromise;
        spawnResult = await pendingSpawn;
        if (target.spawnPromise === pendingSpawn) target.spawnPromise = null;
        if (spawnResult.cancelled) {
          target.spawned = false;
          target.syncing = false;
          return;
        }
        target.restoreScrollbackOnAttach = !spawnResult.reattached;
      }
      if (disposed) return;

      restoreSavedScrollback(target);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const replay = await invoke<TerminalReplay>("attach_terminal", {
          id: agentId,
          afterSequence: target.lastSequence,
        });
        if (disposed) {
          await invoke("detach_terminal", { id: agentId }).catch(() => {});
          return;
        }
        target.attached = true;
        const result = completeTerminalSync(
          target,
          replay,
          (data) => target.term.write(data)
        );
        if (result !== "gap") {
          await invoke("resize_pty", { id: agentId, cols, rows }).catch(() => {});
          return;
        }
      }
      throw new Error("터미널 출력 동기화를 완료하지 못했습니다.");
    };

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

      if (isElectronRuntime()) {
        if (!attachStarted) {
          attachStarted = true;
          lastCols = cols;
          lastRows = rows;
          void attachElectronView(e, cols, rows).catch((err) => {
            if (disposed) return;
            e.spawned = false;
            e.spawnPromise = null;
            e.attached = false;
            e.syncing = false;
            e.term.write(`\r\n\x1b[31mspawn/attach failed: ${err}\x1b[0m\r\n`);
            setAgentStatus(agentId, "exited");
          });
        } else if (
          e.attached &&
          (cols !== lastCols || rows !== lastRows)
        ) {
          lastCols = cols;
          lastRows = rows;
          invoke("resize_pty", { id: agentId, cols, rows }).catch(() => {});
        }
      } else if (!e.spawned) {
        e.spawned = true;
        lastCols = cols;
        lastRows = rows;
        const cur = activeAgentRef.current;
        if (!cur || cur.id !== agentId) return;
        if (cur.status === "idle") {
          setAgentStatus(agentId, "starting");
        }
        const spawn = async () => {
          const { initCommand, ssh, cwd } = await buildSpawnArgs(
            cur,
            ctx.sessionPins,
            setAgentSessionId
          );
          invoke("spawn_pty", {
            id: agentId,
            shell: null,
            cwd,
            initCommand,
            aiToolId: cur.aiToolId,
            ssh,
            cols,
            rows,
          }).catch((err) => {
            e.term.write(`\r\n\x1b[31mspawn failed: ${err}\x1b[0m\r\n`);
            setAgentStatus(agentId, "exited");
          });
        };
        void spawn();
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

    let pendingLinkClick: TerminalMouseLink | null = null;

    const stopTerminalMouseEvent = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const terminalLinkAt = (event: MouseEvent) => {
      const targetEntry = termsRef.current.get(agentId);
      if (!targetEntry) return null;
      return findTerminalLinkAtMouseEvent(targetEntry.term, event);
    };

    const openTerminalLink = (link: TerminalMouseLink) => {
      const targetEntry = termsRef.current.get(agentId);
      targetEntry?.term.clearSelection();
      switch (link.kind) {
        case "url":
          openTerminalUrl(link.text);
          break;
        case "markdown":
          ctx.onOpenMarkdownPath(agentId, link.text);
          break;
        case "image":
          ctx.onOpenImagePath(agentId, link.text);
          break;
        case "folder":
          ctx.onOpenFolderPath(agentId, link.text);
          break;
        case "terminal":
          ctx.onOpenTerminalPath(agentId, link.text);
          break;
      }
    };

    const linkMouseDownHandler = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail > 1 || event.shiftKey) {
        pendingLinkClick = null;
        return;
      }
      const link = terminalLinkAt(event);
      if (!link) {
        pendingLinkClick = null;
        return;
      }
      pendingLinkClick = link;
      termsRef.current.get(agentId)?.term.clearSelection();
      stopTerminalMouseEvent(event);
    };

    const linkMouseUpHandler = (event: MouseEvent) => {
      if (!pendingLinkClick) return;
      const pending = pendingLinkClick;
      pendingLinkClick = null;
      stopTerminalMouseEvent(event);
      if (sameTerminalLink(terminalLinkAt(event), pending)) {
        openTerminalLink(pending);
      }
    };

    const linkClickHandler = (event: MouseEvent) => {
      if (terminalLinkAt(event)) {
        stopTerminalMouseEvent(event);
      }
    };

    container.addEventListener("mousedown", linkMouseDownHandler, {
      capture: true,
    });
    container.addEventListener("mouseup", linkMouseUpHandler, {
      capture: true,
    });
    container.addEventListener("click", linkClickHandler, {
      capture: true,
    });

    const wheelHandler = (e: WheelEvent) => {
      const targetEntry = termsRef.current.get(agentId);
      if (!targetEntry) return;
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
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
      if (targetEntry.term.buffer.active.type === "alternate") {
        // Fullscreen TUIs (claude/codex) draw into xterm's alternate buffer,
        // which has no real terminal scrollback. Running xterm's own wheel path
        // here can expose blank rows that snap back on the next repaint, so we
        // never scroll the viewport; we drive the TUI's own scroll instead.
        e.preventDefault();
        e.stopPropagation();
        const repeats = e.shiftKey ? 3 : 1;
        let data: string;
        if (targetEntry.term.modes.mouseTrackingMode !== "none") {
          // The TUI is reporting mouse events — forward native wheel events so
          // it scrolls its own transcript exactly like a standard terminal
          // (Windows Terminal, iTerm, …). Some TUIs bind scroll to the wheel
          // rather than the PageUp/PageDown keys, so this is more reliable.
          const rect = container.getBoundingClientRect();
          const cols = Math.max(1, targetEntry.term.cols);
          const rows = Math.max(1, targetEntry.term.rows);
          const col = Math.min(
            cols,
            Math.max(
              1,
              Math.ceil(((e.clientX - rect.left) / rect.width) * cols)
            )
          );
          const row = Math.min(
            rows,
            Math.max(
              1,
              Math.ceil(((e.clientY - rect.top) / rect.height) * rows)
            )
          );
          const button = e.deltaY < 0 ? 64 : 65; // SGR wheel up / down
          data = `\x1b[<${button};${col};${row}M`.repeat(repeats);
        } else {
          // No mouse reporting — fall back to paging the transcript/list via
          // PageUp/PageDown keys.
          data = (e.deltaY < 0 ? "\x1b[5~" : "\x1b[6~").repeat(repeats);
        }
        invoke("write_pty", { id: agentId, data }).catch(() => {});
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY > 0 ? 1 : -1;
      const magnitude = e.shiftKey ? 10 : 3;
      scrollTerminalLinesImmediately(targetEntry.term, dir * magnitude);
    };
    container.addEventListener("wheel", wheelHandler, {
      passive: false,
      capture: true,
    });

    return () => {
      disposed = true;
      entry!.attached = false;
      if (isElectronRuntime() && attachStarted) {
        beginTerminalSync(entry!);
        invoke("detach_terminal", { id: agentId }).catch(() => {});
      }
      ro.disconnect();
      window.clearTimeout(debounceTimer);
      container.removeEventListener("mousedown", linkMouseDownHandler, {
        capture: true,
      } as EventListenerOptions);
      container.removeEventListener("mouseup", linkMouseUpHandler, {
        capture: true,
      } as EventListenerOptions);
      container.removeEventListener("click", linkClickHandler, {
        capture: true,
      } as EventListenerOptions);
      container.removeEventListener("wheel", wheelHandler, {
        capture: true,
      } as EventListenerOptions);
    };
  }, [
    activeAgent?.id,
    activeAgent?.status === "idle",
    termsRef,
    setAgentStatus,
    setAgentSessionId,
    ctx.onOpenMarkdownPath,
    ctx.onOpenImagePath,
    ctx.onOpenFolderPath,
    ctx.onOpenTerminalPath,
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

  const pasteDroppedFiles = (dataTransfer: DataTransfer) => {
    if (!activeAgentId) return false;
    const entry = ctx.termsRef.current.get(activeAgentId);
    if (!entry) return false;
    const bridge = electronBridge();
    const text = extractDroppedFilePaths(
      dataTransfer,
      bridge ? (file) => bridge.getPathForFile(file) : undefined
    )
      .map(formatDroppedPathForTerminal)
      .filter(Boolean)
      .join(" ");
    if (!text) return false;
    ctx.setActivePath(path);
    entry.term.focus();
    entry.term.clearSelection();
    entry.term.paste(text);
    return true;
  };

  const canDropAgent = (agentId: string | null) => {
    if (!agentId) return false;
    return !(leaf.tabs.includes(agentId) && leaf.tabs.length === 1);
  };

  const onTabPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    tabAgentId: string
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    const pending: PendingTabDrag = {
      agentId: tabAgentId,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
    };
    pendingTabDragRef.current = pending;

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pending.pointerId) return;
      if (
        !pending.dragging &&
        Math.hypot(moveEvent.clientX - pending.x, moveEvent.clientY - pending.y) >
          4
      ) {
        pending.dragging = true;
        moveEvent.preventDefault();
        ctx.onDragStart(tabAgentId);
      }
      if (pending.dragging) {
        moveEvent.preventDefault();
      }
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pending.pointerId) return;
      cleanup();
      pendingTabDragRef.current = null;
      if (pending.dragging) {
        suppressNextTabClickRef.current = true;
        upEvent.preventDefault();
      }
    };

    const handleCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pending.pointerId) return;
      cleanup();
      pendingTabDragRef.current = null;
      if (pending.dragging) {
        suppressNextTabClickRef.current = true;
        ctx.onDragEnd();
      }
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);
  };
  const onPaneDragOver = (e: React.DragEvent) => {
    if (hasExternalFiles(e.dataTransfer)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = activeAgentId ? "copy" : "none";
      if (ctx.dropTarget?.leafId === leaf.id) {
        ctx.onDropTargetChange(null);
      }
      return;
    }
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
    if (hasExternalFiles(e.dataTransfer)) {
      e.preventDefault();
      e.stopPropagation();
      if (activeAgentId) {
        pasteDroppedFiles(e.dataTransfer);
      }
      if (ctx.dropTarget?.leafId === leaf.id) {
        ctx.onDropTargetChange(null);
      }
      return;
    }
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
      data-pane-leaf-id={leaf.id}
      data-pane-active-agent-id={activeAgentId ?? ""}
      data-pane-agent-ids={leaf.tabs.join(",")}
      data-pane-path={path.join(",")}
      onClick={() => ctx.setActivePath(path)}
      onDragOver={onPaneDragOver}
      onDragLeave={onPaneDragLeave}
      onDrop={onPaneDrop}
    >
      <div className="pane-tabs">
        {leaf.tabs.map((tabAgentId) => {
          if (isDocTabId(tabAgentId)) {
            const isActive = tabAgentId === activeTabId;
            const isDragging = dragFrom === tabAgentId;
            const relativePath =
              parseDocTabId(tabAgentId)?.relativePath ?? tabAgentId;
            const ext = docFileExtension(tabAgentId);
            return (
              <div
                key={tabAgentId}
                className={`pane-tab pane-tab-doc ${isActive ? "tab-active" : ""} ${isDragging ? "tab-dragging" : ""}`}
                draggable={false}
                onPointerDown={(e) => onTabPointerDown(e, tabAgentId)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressNextTabClickRef.current) {
                    suppressNextTabClickRef.current = false;
                    e.preventDefault();
                    return;
                  }
                  ctx.onSelectTab(path, tabAgentId);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  ctx.onTabContextMenu(path, tabAgentId, e.clientX, e.clientY);
                }}
                title={relativePath}
              >
                <span className={`tab-doc-icon tab-doc-icon-${ext || "file"}`}>
                  {ext ? ext.toUpperCase().slice(0, 4) : "FILE"}
                </span>
                <span className="tab-name">{docTabBasename(tabAgentId)}</span>
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
          }
          const tabAgent = ctx.agents.find((a) => a.id === tabAgentId);
          if (!tabAgent) return null;
          const isActive = tabAgentId === activeAgentId;
          const isDragging = dragFrom === tabAgentId;
          const tool = toolForId(tabAgent.aiToolId);
          return (
            <div
              key={tabAgentId}
              className={`pane-tab ${isActive ? "tab-active" : ""} ${isDragging ? "tab-dragging" : ""}`}
              draggable={false}
              onPointerDown={(e) => onTabPointerDown(e, tabAgentId)}
              onClick={(e) => {
                e.stopPropagation();
                if (suppressNextTabClickRef.current) {
                  suppressNextTabClickRef.current = false;
                  e.preventDefault();
                  return;
                }
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
      {/* Keep the xterm host mounted even while a doc tab is active so the
          terminal attach/detach lifecycle and buffered DOM stay intact. */}
      <div
        ref={bodyRef}
        className="pane-body"
        style={activeDocId ? { display: "none" } : undefined}
      />
      {activeDocId && (
        <DocViewer
          docId={activeDocId}
          project={
            ctx.projects.find(
              (p) => p.id === parseDocTabId(activeDocId)?.projectId
            ) ?? null
          }
          theme={ctx.theme}
        />
      )}
      {overlayZone && (
        <div className={`drop-overlay drop-overlay-${overlayZone}`} />
      )}
    </div>
  );
}
