import { useEffect, useMemo, useState } from "react";
import type { Agent } from "../types";
import { toolForId } from "../types";
import { isAgentRuntimeActive } from "../lib/agentActivity";
import { electronBridge } from "../platform/electronBridge";
import type {
  SessionStorageEntry,
  SessionStorageQuery,
} from "../platform/ipcContract";

function storageKey(aiToolId: string, sessionId: string) {
  return `${aiToolId}:${sessionId.toLowerCase()}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** index;
  const digits = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatDate(ms: number) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

export function SessionStorageList({
  folder,
  agents,
  scope = "current",
  onSessionDeleted,
}: {
  folder: string;
  agents: Agent[];
  scope?: "project" | "current";
  onSessionDeleted?: (aiToolId: string, sessionId: string) => void;
}) {
  const queries = useMemo<SessionStorageQuery[]>(() => {
    const seen = new Set<string>();
    const next: SessionStorageQuery[] = [];
    for (const agent of agents) {
      if (
        agent.sshHostId ||
        !agent.lastSessionId ||
        (agent.aiToolId !== "codex" && agent.aiToolId !== "claude")
      ) {
        continue;
      }
      const query = {
        aiToolId: agent.aiToolId,
        sessionId: agent.lastSessionId,
      } satisfies SessionStorageQuery;
      const key = storageKey(query.aiToolId, query.sessionId);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(query);
    }
    return next;
  }, [agents]);
  const querySignature = JSON.stringify(queries);
  const [entries, setEntries] = useState<SessionStorageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bridge = electronBridge();
    if (!bridge || !folder || (scope === "current" && queries.length === 0)) {
      setEntries([]);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    const request = scope === "project"
      ? { folder, includeAllProjectSessions: true as const }
      : { folder, sessions: queries };
    bridge
      .invoke("session_storage_list", request)
      .then((result) => {
        if (!cancelled) setEntries(result.sessions);
      })
      .catch((reason) => {
        if (!cancelled) {
          setEntries([]);
          setError(String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // querySignature provides a stable dependency for the current session ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, querySignature, scope]);

  const entryByKey = useMemo(
    () => new Map(entries.map((entry) => [storageKey(entry.aiToolId, entry.sessionId), entry])),
    [entries]
  );
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const displayRows = useMemo(() => {
    const currentAgentByKey = new Map<string, Agent>();
    for (const agent of agents) {
      if (!agent.lastSessionId) continue;
      currentAgentByKey.set(
        storageKey(agent.aiToolId, agent.lastSessionId),
        agent
      );
    }
    if (scope === "current") {
      return agents.map((agent) => ({
        key: `agent:${agent.id}`,
        agent,
        entry: agent.lastSessionId
          ? entryByKey.get(storageKey(agent.aiToolId, agent.lastSessionId))
          : undefined,
      }));
    }

    const rows: Array<{
      key: string;
      agent: Agent | null;
      entry?: SessionStorageEntry;
    }> = entries.map((entry) => {
      const key = storageKey(entry.aiToolId, entry.sessionId);
      return { key: `entry:${key}`, agent: currentAgentByKey.get(key) ?? null, entry };
    });
    const representedAgents = new Set(
      rows.map((row) => row.agent?.id).filter((id): id is string => Boolean(id))
    );
    for (const agent of agents) {
      if (!representedAgents.has(agent.id)) {
        rows.push({ key: `agent:${agent.id}`, agent });
      }
    }
    return rows;
  }, [agents, entries, entryByKey, scope]);

  async function reveal(entry: SessionStorageEntry) {
    if (!entry.primaryPath) return;
    try {
      await electronBridge()?.invoke("reveal_local_path", { path: entry.primaryPath });
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function remove(agent: Agent | null, entry: SessionStorageEntry) {
    const key = storageKey(entry.aiToolId, entry.sessionId);
    const displayName = agent?.name ?? `세션 ${entry.sessionId.slice(0, 8)}`;
    const confirmed = window.confirm(
      `“${displayName}” 기록의 JSONL ${formatBytes(entry.bytes)}를 휴지통으로 이동할까요?\n\n${entry.primaryPath ?? entry.sessionId}`
    );
    if (!confirmed) return;
    setDeletingKey(key);
    setError(null);
    try {
      await electronBridge()?.invoke("session_storage_delete", {
        folder,
        aiToolId: entry.aiToolId,
        sessionId: entry.sessionId,
        ...(agent ? { agentId: agent.id } : {}),
      });
      setEntries((current) =>
        current.filter(
          (candidate) =>
            storageKey(candidate.aiToolId, candidate.sessionId) !== key
        )
      );
      onSessionDeleted?.(entry.aiToolId, entry.sessionId);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <section className="session-storage-section">
      <div className="session-storage-heading">
        <span>JSONL 카탈로그</span>
        <span>{loading ? "계산 중…" : formatBytes(totalBytes)}</span>
      </div>
      <div className="session-storage-hint">
        {scope === "project"
          ? "MultiAgent 카탈로그에서 이 프로젝트(cwd)에 속한 모든 세션 기록을 표시합니다."
          : "선택한 세션에 연결된 현재 sessionId 기록 하나만 표시합니다."}
      </div>
      {error && <div className="session-storage-error">{error}</div>}
      <div className="session-storage-list">
        {displayRows.map((row) => {
          const { agent, entry } = row;
          const sessionId = agent?.lastSessionId ?? entry?.sessionId;
          const aiToolId = agent?.aiToolId ?? entry?.aiToolId ?? "none";
          const supported = aiToolId === "codex" || aiToolId === "claude";
          const active = agent ? isAgentRuntimeActive(agent) : false;
          const key = entry
            ? storageKey(entry.aiToolId, entry.sessionId)
            : row.key;
          const displayName = agent?.name ?? `기록 ${entry?.sessionId.slice(0, 8) ?? "—"}`;
          return (
            <div className="session-storage-card" key={row.key}>
              <div className="session-storage-card-head">
                <span className="session-storage-name">{displayName}</span>
                <span className="session-storage-tool">{toolForId(aiToolId).label}</span>
                {!agent && entry && (
                  <span className="session-storage-unlinked">미연결 기록</span>
                )}
                <span className="session-storage-size">
                  {entry ? formatBytes(entry.bytes) : "—"}
                </span>
              </div>
              {!supported ? (
                <div className="session-storage-empty">이 도구는 JSONL 조회를 지원하지 않습니다.</div>
              ) : agent?.sshHostId ? (
                <div className="session-storage-empty">원격 세션 저장소 조회는 아직 지원하지 않습니다.</div>
              ) : !sessionId ? (
                <div className="session-storage-empty">연결된 현재 세션 기록이 없습니다.</div>
              ) : loading ? (
                <div className="session-storage-empty">세션 파일을 확인하고 있습니다…</div>
              ) : !entry ? (
                <div className="session-storage-empty">현재 sessionId와 일치하는 JSONL을 찾지 못했습니다.</div>
              ) : (
                <>
                  <div className="session-storage-meta session-props-mono" title={entry.sessionId}>
                    {entry.sessionId}
                  </div>
                  <div className="session-storage-path session-props-mono" title={entry.primaryPath ?? ""}>
                    {entry.primaryPath ?? "—"}
                  </div>
                  <div className="session-storage-footer">
                    <span>
                      {entry.fileCount > 1 ? `${entry.fileCount}개 파일 합산 · ` : ""}
                      {formatDate(entry.updatedAt)}
                    </span>
                    <div className="session-storage-actions">
                      <button
                        className="btn-secondary session-storage-button"
                        type="button"
                        onClick={() => void reveal(entry)}
                      >
                        위치 열기
                      </button>
                      <button
                        className="btn-danger session-storage-button"
                        type="button"
                        disabled={active || deletingKey === key}
                        title={active ? "실행 중인 세션은 먼저 비활성화해야 합니다." : "휴지통으로 이동"}
                        onClick={() => void remove(agent, entry)}
                      >
                        {deletingKey === key ? "이동 중…" : "삭제"}
                      </button>
                    </div>
                  </div>
                  {active && (
                    <div className="session-storage-active-note">
                      실행 중인 세션은 비활성화한 뒤 삭제할 수 있습니다.
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {!loading && displayRows.length === 0 && (
          <div className="session-storage-empty">
            {scope === "project" ? "이 프로젝트의 카탈로그 기록이 없습니다." : "등록된 세션이 없습니다."}
          </div>
        )}
      </div>
    </section>
  );
}
