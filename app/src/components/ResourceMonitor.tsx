import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { invoke } from "../platform/runtime";
import type { Agent, Project } from "../types";
import type {
  ResourceSessionUsage,
  ResourceUsageResult,
} from "../platform/ipcContract";
import { useAppLanguage } from "../lib/appLanguage";

// Orca-style Resource Manager: the status-bar segment shows the app's total
// memory; the popover breaks it down per project → session (PTY process
// tree). Sampling runs a system process snapshot, so it polls slowly while
// closed and faster while the popover is open.
const IDLE_POLL_MS = 20_000;
const OPEN_POLL_MS = 5_000;

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb >= 10 ? Math.round(gb * 10) / 10 : Math.round(gb * 100) / 100} GB`;
  }
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

function formatCpu(percent: number) {
  return `${Math.round(percent * 10) / 10}%`;
}

type ProjectGroup = {
  projectId: string | null;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  sessions: Array<{
    usage: ResourceSessionUsage;
    agent: Agent | null;
  }>;
};

export function ResourceMonitor({
  agents,
  projects,
  onRefreshUsage,
}: {
  agents: Agent[];
  projects: Project[];
  onRefreshUsage?: () => void | Promise<void>;
}) {
  const { text } = useAppLanguage();
  const [usage, setUsage] = useState<ResourceUsageResult | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useNativeViewOcclusion(open);

  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const next = await invoke<ResourceUsageResult>("resource_usage", {});
      setUsage(next);
    } catch {
      // Resource sampling is best-effort; keep the last snapshot.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(
      () => void load(),
      open ? OPEN_POLL_MS : IDLE_POLL_MS
    );
    return () => window.clearInterval(timer);
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!usage) return [];
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const byProject = new Map<string, ProjectGroup>();
    for (const session of usage.sessions) {
      const agent = agentById.get(session.id) ?? null;
      const projectId = agent?.projectId ?? null;
      const key = projectId ?? "__unknown__";
      let group = byProject.get(key);
      if (!group) {
        group = {
          projectId,
          name: projectId
            ? projectById.get(projectId)?.name ?? text("삭제된 프로젝트", "Deleted project")
            : text("기타 세션", "Other sessions"),
          cpuPercent: 0,
          memoryBytes: 0,
          sessions: [],
        };
        byProject.set(key, group);
      }
      group.cpuPercent += session.cpu_percent;
      group.memoryBytes += session.memory_bytes;
      group.sessions.push({ usage: session, agent });
    }
    const list = [...byProject.values()];
    for (const group of list) {
      group.sessions.sort(
        (a, b) => b.usage.memory_bytes - a.usage.memory_bytes
      );
    }
    list.sort((a, b) => b.memoryBytes - a.memoryBytes);
    return list;
  }, [agents, projects, text, usage]);

  const sessionsMemory = useMemo(
    () =>
      (usage?.sessions ?? []).reduce(
        (sum, session) => sum + session.memory_bytes,
        0
      ),
    [usage]
  );
  const appSelfMemory = Math.max(
    0,
    (usage?.total_memory_bytes ?? 0) - sessionsMemory
  );
  const systemPercent =
    usage && usage.system_memory_bytes > 0
      ? Math.round((usage.total_memory_bytes / usage.system_memory_bytes) * 100)
      : 0;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), onRefreshUsage?.()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, onRefreshUsage]);

  return (
    <div className="resource-monitor" ref={rootRef}>
      <button
        type="button"
        className={`resource-status ${open ? "resource-status-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title="Resource Manager"
      >
        <span className="resource-status-icon">▦</span>
        <span>{usage ? formatBytes(usage.total_memory_bytes) : "—"}</span>
      </button>
      {open && (
        <div className="resource-popover" role="dialog" aria-label="Resource Manager">
          <div className="resource-popover-heading">
            <strong>▦ Resource Manager</strong>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? text("갱신 중", "Refreshing") : text("새로고침", "Refresh")}
            </button>
          </div>
          <div className="resource-popover-summary">
            <b>{formatCpu(usage?.total_cpu_percent ?? 0)}</b>
            <span>·</span>
            <b>{formatBytes(usage?.total_memory_bytes ?? 0)}</b>
            <span>·</span>
            <span>{text(`시스템 RAM의 ${systemPercent}%`, `${systemPercent}% of system RAM`)}</span>
          </div>
          <div className="resource-popover-columns">
            <span>{text("이름", "Name")}</span>
            <span>CPU</span>
            <span>{text("메모리", "Memory")}</span>
          </div>
          <div className="resource-popover-body">
            {usage && !usage.sampled && (
              <div className="resource-empty">
                {text("프로세스 정보를 수집하지 못했습니다.", "Could not collect process information.")}
              </div>
            )}
            {usage?.sampled && groups.length === 0 && (
              <div className="resource-empty">{text("실행 중인 로컬 세션이 없습니다.", "No local sessions are running.")}</div>
            )}
            {groups.map((group) => (
              <div key={group.projectId ?? "__unknown__"}>
                <div className="resource-row resource-row-group">
                  <span className="resource-name">{group.name}</span>
                  <span className="resource-cpu">
                    {formatCpu(group.cpuPercent)}
                  </span>
                  <span className="resource-mem">
                    {formatBytes(group.memoryBytes)}
                  </span>
                </div>
                {group.sessions.map(({ usage: session, agent }) => (
                  <div className="resource-row resource-row-session" key={session.id}>
                    <span className="resource-name">
                      <span
                        className={`resource-dot ${
                          agent && agent.status !== "idle" && agent.status !== "exited"
                            ? "resource-dot-live"
                            : ""
                        }`}
                      />
                      {agent?.name ?? `pid ${session.pid}`}
                      <em className="resource-proc-count">
                        {session.process_count} proc
                      </em>
                    </span>
                    <span className="resource-cpu">
                      {formatCpu(session.cpu_percent)}
                    </span>
                    <span className="resource-mem">
                      {formatBytes(session.memory_bytes)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {usage?.sampled && (
              <div className="resource-row resource-row-app">
                <span className="resource-name">{text("앱 프로세스 (UI 등)", "App processes (UI, etc.)")}</span>
                <span className="resource-cpu" />
                <span className="resource-mem">{formatBytes(appSelfMemory)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
