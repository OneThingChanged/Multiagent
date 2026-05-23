import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

import {
  LS_AGENTS,
  LS_GROUPS,
  LS_VIEW,
  toolForId,
} from "./types";
import type {
  Agent,
  AgentStatus,
  ContextMenuState,
  DragState,
  DropTargetState,
  DropZone,
  Group,
  NewAgentPayload,
  Path,
  StoredAgent,
  TabCtxState,
  TerminalEntry,
  Toast,
} from "./types";
import { activeAgentInLeaf, collectAgentIds, getAt } from "./lib/layout";
import * as groupOps from "./lib/groupOps";
import { loadBootstrap } from "./lib/persistence";
import type { Bootstrap } from "./lib/persistence";
import { applyTerminalTheme, notifyDone } from "./lib/terminal";
import { loadAppTheme, saveAppTheme } from "./lib/appTheme";
import type { AppThemeId } from "./lib/appTheme";

import { Sidebar } from "./components/Sidebar";
import { TerminalArea } from "./components/TerminalArea";
import { NewAgentModal } from "./components/NewAgentModal";
import { ToastContainer } from "./components/Toast";
import { ContextMenu, TabContextMenu } from "./components/Menus";
import { DocsPanel } from "./components/DocsPanel";
import { SettingsModal } from "./components/SettingsModal";

const LS_DOCS_WIDTH = "multiagent.docsWidth.v1";
const DEFAULT_DOCS_WIDTH = 640;
const MIN_DOCS_WIDTH = 360;
const MIN_WORKSPACE_WIDTH = 260;

type DocsRequest = {
  agentId: string;
  relativePath: string;
  key: number;
};

function clampDocsWidth(width: number) {
  const viewportMax =
    typeof window === "undefined"
      ? DEFAULT_DOCS_WIDTH
      : Math.max(MIN_DOCS_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH);
  if (!Number.isFinite(width)) return DEFAULT_DOCS_WIDTH;
  return Math.min(viewportMax, Math.max(MIN_DOCS_WIDTH, Math.round(width)));
}

function loadDocsWidth() {
  try {
    const raw = localStorage.getItem(LS_DOCS_WIDTH);
    return raw ? clampDocsWidth(Number(raw)) : DEFAULT_DOCS_WIDTH;
  } catch {
    return DEFAULT_DOCS_WIDTH;
  }
}

function App() {
  // One-shot bootstrap: read localStorage exactly once at mount.
  const bootstrapRef = useRef<Bootstrap | null>(null);
  if (!bootstrapRef.current) bootstrapRef.current = loadBootstrap();
  const boot = bootstrapRef.current;

  const [agents, setAgents] = useState<Agent[]>(boot.agents);
  const [groups, setGroups] = useState<Group[]>(boot.groups);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    boot.activeGroupId
  );
  const [activePath, setActivePath] = useState<Path | null>(boot.activePath);

  const [showModal, setShowModal] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appTheme, setAppTheme] = useState<AppThemeId>(loadAppTheme);
  const [docsWidth, setDocsWidth] = useState(loadDocsWidth);
  const [docsRequest, setDocsRequest] = useState<DocsRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabCtxState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  const termsRef = useRef<Map<string, TerminalEntry>>(new Map());
  const agentsRef = useRef<Agent[]>([]);
  const activeGroupIdRef = useRef<string | null>(null);
  const activePathRef = useRef<Path | null>(null);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // ---- Persistence

  useEffect(() => {
    const configs: StoredAgent[] = agents.map((a) => ({
      id: a.id,
      name: a.name,
      folder: a.folder,
      aiToolId: a.aiToolId,
      dangerous: a.dangerous,
      createdAt: a.createdAt,
      lastSessionId: a.lastSessionId,
    }));
    try {
      localStorage.setItem(LS_AGENTS, JSON.stringify(configs));
    } catch {}
  }, [agents]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_GROUPS, JSON.stringify(groups));
    } catch {}
  }, [groups]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_VIEW,
        JSON.stringify({ activeGroupId, activePath })
      );
    } catch {}
  }, [activeGroupId, activePath]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_DOCS_WIDTH, String(docsWidth));
    } catch {}
  }, [docsWidth]);

  useEffect(() => {
    for (const entry of termsRef.current.values()) {
      applyTerminalTheme(entry.term, appTheme);
    }
  }, [appTheme]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const handleThemeChange = useCallback((theme: AppThemeId) => {
    setAppTheme(theme);
    saveAppTheme(theme);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setDocsWidth((width) => clampDocsWidth(width));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ---- Notifications

  const pushToast = useCallback(
    (agentId: string, title: string, body: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, agentId, title, body }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    isPermissionGranted()
      .then((g) => {
        if (!g) return requestPermission();
      })
      .catch(() => {});
  }, []);

  // ---- PTY + hook event listeners

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const track = (u: () => void) => {
      if (cancelled) u();
      else unsubs.push(u);
    };

    listen<{ id: string; data: string }>("pty:data", (e) => {
      if (cancelled) return;
      const id = e.payload.id;
      const data = e.payload.data;
      const entry = termsRef.current.get(id);
      entry?.term.write(data);

      setAgents((cur) =>
        cur.map((a) =>
          a.id === id && (a.status === "idle" || a.status === "starting")
            ? { ...a, status: "running" }
            : a
        )
      );
    }).then(track);

    listen<{ id: string }>("pty:exit", (e) => {
      if (cancelled) return;
      setAgents((prev) =>
        prev.map((a) =>
          a.id === e.payload.id ? { ...a, status: "exited" } : a
        )
      );
    }).then(track);

    listen<void>("app:close-requested", async () => {
      if (cancelled) return;
      // Session IDs are already captured at SessionStart time; close path just
      // needs to send /quit so the tools shut down cleanly, then confirm.
      const targets = agentsRef.current.filter((a) => {
        if (a.status === "exited" || a.status === "idle") return false;
        if (a.aiToolId !== "codex" && a.aiToolId !== "claude") return false;
        const e = termsRef.current.get(a.id);
        return !!e && e.spawned;
      });
      await Promise.all(
        targets.map((a) =>
          invoke("write_pty", { id: a.id, data: "/quit\r" }).catch(() => {})
        )
      );
      await new Promise((r) =>
        setTimeout(r, targets.length > 0 ? 300 : 50)
      );
      await invoke("confirm_close").catch(() => {});
    }).then(track);

    listen<{ id: string; event: string; session_id?: string }>(
      "agent:hook-event",
      (e) => {
        if (cancelled) return;
        const { id, event, session_id } = e.payload;
        if (event === "working") {
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.status !== "exited"
                ? { ...a, status: "working" }
                : a
            )
          );
        } else if (event === "done") {
          const target = agentsRef.current.find((a) => a.id === id);
          if (target && target.status === "working") {
            notifyDone(target.name);
            pushToast(target.id, target.name, "작업이 끝났어요");
          }
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.status === "working"
                ? { ...a, status: "running" }
                : a
            )
          );
        } else if (event === "session-start" && session_id) {
          setAgents((cur) =>
            cur.map((a) =>
              a.id === id && a.lastSessionId !== session_id
                ? { ...a, lastSessionId: session_id }
                : a
            )
          );
        }
      }
    ).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pushToast]);

  // ---- Group operations (delegated to lib/groupOps as pure functions)

  const applyGroupOp = useCallback(
    (op: (state: groupOps.GroupState) => groupOps.GroupState) => {
      setGroups((prevGroups) => {
        const next = op({
          groups: prevGroups,
          activeGroupId: activeGroupIdRef.current,
          activePath: activePathRef.current,
        });
        setActiveGroupId(next.activeGroupId);
        setActivePath(next.activePath);
        return next.groups;
      });
    },
    []
  );

  const selectAgent = useCallback(
    (agentId: string) => applyGroupOp((s) => groupOps.selectAgent(s, agentId)),
    [applyGroupOp]
  );

  const openAsTab = useCallback(
    (agentId: string) => applyGroupOp((s) => groupOps.openAsTab(s, agentId)),
    [applyGroupOp]
  );

  const splitWith = useCallback(
    (agentId: string, direction: "h" | "v") =>
      applyGroupOp((s) => groupOps.splitWith(s, agentId, direction)),
    [applyGroupOp]
  );

  const closeTab = useCallback(
    (path: Path, agentId: string) =>
      applyGroupOp((s) => groupOps.closeTab(s, path, agentId)),
    [applyGroupOp]
  );

  const resizeAt = useCallback(
    (path: Path, sizes: number[]) =>
      applyGroupOp((s) => groupOps.resizeAt(s, path, sizes)),
    [applyGroupOp]
  );

  const setActiveTabInPane = useCallback(
    (path: Path, agentId: string) =>
      applyGroupOp((s) => groupOps.setActiveTabInPane(s, path, agentId)),
    [applyGroupOp]
  );

  const performDrop = useCallback(
    (fromAgentId: string, targetLeafId: string, zone: DropZone) =>
      applyGroupOp((s) =>
        groupOps.performDrop(s, fromAgentId, targetLeafId, zone)
      ),
    [applyGroupOp]
  );

  // ---- Agent CRUD (side effects + layout via groupOps)

  const createAgent = useCallback(
    (payload: NewAgentPayload) => {
      const id = crypto.randomUUID();
      const tool = toolForId(payload.aiToolId);

      setAgents((prev) => [
        ...prev,
        {
          id,
          name: payload.name.trim() || `Agent ${prev.length + 1}`,
          folder: payload.folder,
          aiToolId: tool.id,
          aiLabel: tool.label,
          dangerous: payload.dangerous && !!tool.dangerousFlag,
          status: "starting",
          createdAt: Date.now(),
        },
      ]);
      applyGroupOp((s) => groupOps.addNewAgent(s, id));
    },
    [applyGroupOp]
  );

  const setAgentStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const removeAgent = useCallback(
    async (id: string) => {
      await invoke("kill_pty", { id }).catch(() => {});
      const entry = termsRef.current.get(id);
      entry?.term.dispose();
      termsRef.current.delete(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      applyGroupOp((s) => groupOps.removeAgentFromLayout(s, id));
    },
    [applyGroupOp]
  );

  // ---- Context menu

  const onSidebarContextMenu = useCallback(
    (agentId: string, x: number, y: number) => {
      setContextMenu({ agentId, x, y });
    },
    []
  );

  const onContextAction = useCallback(
    (action: "open" | "tab" | "split-h" | "split-v") => {
      if (!contextMenu) return;
      const id = contextMenu.agentId;
      setContextMenu(null);
      if (action === "open") selectAgent(id);
      else if (action === "tab") openAsTab(id);
      else if (action === "split-h") splitWith(id, "h");
      else if (action === "split-v") splitWith(id, "v");
    },
    [contextMenu, selectAgent, openAsTab, splitWith]
  );

  // ---- Stable drag callbacks

  const handleDragStart = useCallback((fromAgentId: string) => {
    setDragState({ fromAgentId });
  }, []);
  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
  }, []);

  const handleDocsResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      document.body.classList.add("docs-resizing");

      const handleMove = (moveEvent: PointerEvent) => {
        setDocsWidth(clampDocsWidth(window.innerWidth - moveEvent.clientX));
      };
      const handleEnd = () => {
        document.body.classList.remove("docs-resizing");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
        window.removeEventListener("pointercancel", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
      window.addEventListener("pointercancel", handleEnd);
    },
    []
  );

  const handleOpenMarkdownPath = useCallback(
    async (agentId: string, path: string) => {
      const agent = agentsRef.current.find((a) => a.id === agentId);
      if (!agent?.folder) return;

      try {
        const relativePath = await invoke<string>("resolve_markdown_path", {
          folder: agent.folder,
          path,
        });
        selectAgent(agentId);
        setDocsOpen(true);
        setDocsRequest({
          agentId,
          relativePath,
          key: Date.now(),
        });
      } catch {
        pushToast(agentId, agent.name, "Markdown 파일을 찾을 수 없습니다.");
      }
    },
    [pushToast, selectAgent]
  );

  // ---- Derived

  const activeGroup = useMemo(
    () => (activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null),
    [activeGroupId, groups]
  );
  const activeGroupLayout = activeGroup ? activeGroup.layout : null;

  const inGroupAgentIds = useMemo(
    () => (activeGroupLayout ? collectAgentIds(activeGroupLayout) : new Set<string>()),
    [activeGroupLayout]
  );

  const activeAgentId = useMemo(() => {
    if (!activeGroupLayout || !activePath) return null;
    const leaf = getAt(activeGroupLayout, activePath);
    return leaf && leaf.type === "leaf" ? activeAgentInLeaf(leaf) : null;
  }, [activeGroupLayout, activePath]);

  const activeAgent = useMemo(
    () => (activeAgentId ? agents.find((a) => a.id === activeAgentId) ?? null : null),
    [activeAgentId, agents]
  );

  // ---- Render

  return (
    <div className={`app app-theme-${appTheme}`}>
      <Sidebar
        agents={agents}
        groups={groups}
        activeGroupId={activeGroupId}
        activeAgentId={activeAgentId}
        inGroupAgentIds={inGroupAgentIds}
        dragState={dragState}
        onSelect={selectAgent}
        onContextMenu={onSidebarContextMenu}
        onNew={() => setShowModal(true)}
        docsOpen={docsOpen}
        onToggleDocs={() => setDocsOpen((open) => !open)}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onRemove={removeAgent}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
      <TerminalArea
        agents={agents}
        layout={activeGroupLayout}
        activePath={activePath}
        dragState={dragState}
        dropTarget={dropTarget}
        termsRef={termsRef}
        setAgentStatus={setAgentStatus}
        setActivePath={setActivePath}
        onCloseTab={closeTab}
        onSelectTab={setActiveTabInPane}
        onResizeAt={resizeAt}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDropTargetChange={setDropTarget}
        onDrop={performDrop}
        onTabContextMenu={(path, agentId, x, y) =>
          setTabContextMenu({ path, agentId, x, y })
        }
        onOpenMarkdownPath={handleOpenMarkdownPath}
      />
      {docsOpen && (
        <div
          className="docs-resizer"
          onPointerDown={handleDocsResizeStart}
          title="Resize docs"
        />
      )}
      <DocsPanel
        open={docsOpen}
        activeAgent={activeAgent}
        width={docsWidth}
        requestedPath={
          docsRequest && docsRequest.agentId === activeAgent?.id
            ? docsRequest.relativePath
            : null
        }
        requestKey={docsRequest?.key ?? 0}
        theme={appTheme}
        onClose={() => setDocsOpen(false)}
      />
      {settingsOpen && (
        <SettingsModal
          theme={appTheme}
          onThemeChange={handleThemeChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {showModal && (
        <NewAgentModal
          defaultName={`Agent ${agents.length + 1}`}
          onCancel={() => setShowModal(false)}
          onCreate={(payload) => {
            setShowModal(false);
            createAgent(payload);
          }}
        />
      )}
      <ToastContainer
        toasts={toasts}
        onSelect={selectAgent}
        onDismiss={dismissToast}
      />
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          hasActive={!!activeGroupLayout && !!activePath}
          onClose={() => setContextMenu(null)}
          onAction={onContextAction}
        />
      )}
      {tabContextMenu && (
        <TabContextMenu
          state={tabContextMenu}
          onClose={() => setTabContextMenu(null)}
          onCloseTab={() => {
            closeTab(tabContextMenu.path, tabContextMenu.agentId);
            setTabContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
