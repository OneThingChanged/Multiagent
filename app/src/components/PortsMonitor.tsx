import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../platform/runtime";
import type { Agent, Project } from "../types";
import type { PortEntry, PortsResult } from "../platform/ipcContract";

// Orca-style Ports monitor: the status-bar segment shows the workspace port
// count; the popover groups listening TCP ports by project, with an
// External Ports section collapsed below. Attribution happens in the main
// process: (1) the listener pid descends from a session's PTY root, or
// (2) its command line contains a project folder as a whole token.
const IDLE_POLL_MS = 30_000;

type ProjectPortGroup = {
  key: string;
  name: string;
  projectId: string | null;
  ports: PortEntry[];
};

export function PortsMonitor({
  agents,
  projects,
  onSelectProject,
}: {
  agents: Agent[];
  projects: Project[];
  onSelectProject: (projectId: string) => void;
}) {
  const [result, setResult] = useState<PortsResult | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const load = useCallback(async () => {
    try {
      const payload = projectsRef.current
        .filter((project) => !project.sshHostId && project.folder)
        .map((project) => ({ id: project.id, folder: project.folder }));
      const next = await invoke<PortsResult>("list_ports", {
        projects: payload,
      });
      setResult(next);
    } catch {
      // Port scanning is best-effort; keep the last snapshot.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
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
  }, [load, open]);

  const showOpError = useCallback((err: unknown) => {
    setOpError(String(err));
    window.setTimeout(() => setOpError(null), 5000);
  }, []);

  const { groups, externalPorts, workspaceCount } = useMemo(() => {
    const ports = result?.ports ?? [];
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const byProject = new Map<string, ProjectPortGroup>();
    const external: PortEntry[] = [];
    for (const entry of ports) {
      if (entry.kind !== "workspace") {
        external.push(entry);
        continue;
      }
      // Session-owned ports resolve to the session's project.
      const projectId = entry.terminal_id
        ? agentById.get(entry.terminal_id)?.projectId ?? null
        : entry.project_id;
      const key = projectId ?? "__unknown__";
      let group = byProject.get(key);
      if (!group) {
        group = {
          key,
          projectId,
          name: projectId
            ? projectById.get(projectId)?.name ?? "삭제된 프로젝트"
            : "기타 세션",
          ports: [],
        };
        byProject.set(key, group);
      }
      group.ports.push(entry);
    }
    const list = [...byProject.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const group of list) group.ports.sort((a, b) => a.port - b.port);
    external.sort((a, b) => a.port - b.port);
    return {
      groups: list,
      externalPorts: external,
      workspaceCount: ports.length - external.length,
    };
  }, [agents, projects, result]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const addressOf = (entry: PortEntry) => `${entry.connect_host}:${entry.port}`;

  const openInBrowser = (entry: PortEntry) => {
    invoke("open_external_url", {
      url: `http://${addressOf(entry)}`,
    }).catch(showOpError);
  };

  const copyAddress = (entry: PortEntry) => {
    invoke("clipboard_write_text", { text: addressOf(entry) }).catch(
      showOpError
    );
  };

  const stopProcess = async (entry: PortEntry) => {
    try {
      await invoke("kill_port_process", { pid: entry.pid, port: entry.port });
      window.setTimeout(() => void load(), 500);
    } catch (err) {
      showOpError(err);
    }
  };

  const portRow = (entry: PortEntry, showKind: boolean) => (
    <div className="port-row" key={`${entry.connect_host}:${entry.port}:${entry.pid}`}>
      <span className="port-number">{entry.port}</span>
      <span className="port-info">
        <span className="port-process" title={`pid ${entry.pid}`}>
          {entry.process_name || `pid ${entry.pid}`}
        </span>
        <span className="port-address">
          {showKind ? "external" : addressOf(entry)}
        </span>
      </span>
      <span className="port-actions">
        <button
          type="button"
          title="브라우저에서 열기"
          onClick={() => openInBrowser(entry)}
        >
          ↗
        </button>
        <button
          type="button"
          title="주소 복사"
          onClick={() => copyAddress(entry)}
        >
          ⧉
        </button>
        {entry.kind === "workspace" && !entry.own_app && (
          <button
            type="button"
            className="port-action-danger"
            title="프로세스 종료"
            onClick={() => void stopProcess(entry)}
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );

  return (
    <div className="ports-monitor" ref={rootRef}>
      <button
        type="button"
        className={`resource-status ${open ? "resource-status-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title={`Ports — workspace ${workspaceCount}개 · external ${externalPorts.length}개`}
      >
        <span className="resource-status-icon">🔌</span>
        <span>{workspaceCount}</span>
      </button>
      {open && (
        <div className="ports-popover" role="dialog" aria-label="Ports">
          <div className="resource-popover-heading">
            <strong>🔌 Ports</strong>
            <span className="ports-summary">
              {workspaceCount} workspace · {externalPorts.length} external
            </span>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? "갱신 중" : "새로고침"}
            </button>
          </div>
          {opError && <div className="ports-op-error">{opError}</div>}
          <div className="resource-popover-body">
            {result && !result.sampled && (
              <div className="resource-empty">포트 정보를 수집하지 못했습니다.</div>
            )}
            {result?.sampled && groups.length === 0 && (
              <div className="resource-empty">
                프로젝트에 연결된 열린 포트가 없습니다.
              </div>
            )}
            {groups.map((group) => (
              <div key={group.key}>
                <div className="port-group-head">
                  <span className="port-group-name">{group.name}</span>
                  {group.projectId && (
                    <button
                      type="button"
                      className="port-group-goto"
                      title="프로젝트로 이동"
                      onClick={() => {
                        onSelectProject(group.projectId!);
                        setOpen(false);
                      }}
                    >
                      🗀
                    </button>
                  )}
                  <span className="port-group-count">{group.ports.length}</span>
                </div>
                {group.ports.map((entry) => portRow(entry, false))}
              </div>
            ))}
            {result?.sampled && (
              <div className="port-external">
                <button
                  type="button"
                  className="port-external-head"
                  onClick={() => setExternalOpen((value) => !value)}
                >
                  <span className={`port-external-caret ${externalOpen ? "open" : ""}`}>
                    ▸
                  </span>
                  External Ports
                  <span className="port-group-count">{externalPorts.length}</span>
                </button>
                {externalOpen &&
                  (externalPorts.length > 0 ? (
                    externalPorts.map((entry) => portRow(entry, true))
                  ) : (
                    <div className="resource-empty">외부 포트가 없습니다.</div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
