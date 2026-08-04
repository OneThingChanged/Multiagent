import { useEffect } from "react";
import type { Agent, Project } from "../types";
import { toolForId } from "../types";
import { findSshHost, sshHostSummary } from "../lib/sshHosts";

function formatDate(ms: number | undefined) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

const STATUS_LABEL: Record<string, string> = {
  idle: "대기",
  starting: "시작 중",
  recovering: "복구 중",
  running: "실행 중",
  working: "작업 중",
  waiting: "응답 대기",
  blocked: "확인 필요",
  exited: "종료됨",
  unreachable: "연결 끊김",
};

export function SessionPropertiesModal({
  agent,
  project,
  onUpdateAgent,
  onClose,
}: {
  agent: Agent;
  project: Project | null;
  onUpdateAgent: (
    id: string,
    patch: Partial<Pick<Agent, "dangerous" | "useAltScreen">>
  ) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tool = toolForId(agent.aiToolId);
  const sshHostId = agent.sshHostId ?? project?.sshHostId;
  const sshHost = sshHostId ? findSshHost(sshHostId) : null;
  const remoteFolder = agent.remoteFolder ?? project?.remoteFolder;
  // Resume/session-id is captured for local sessions and Windows remotes
  // (Phase 2 reverse-tunnel hooks); POSIX remotes are not supported yet.
  const sessionIdSupported = !sshHost || sshHost.remoteOs === "windows";
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "이름", value: agent.name },
    { label: "프로젝트", value: project?.name ?? "—" },
    { label: "도구", value: tool.label },
    { label: "상태", value: STATUS_LABEL[agent.status] ?? agent.status },
    ...(agent.activity
      ? [
          {
            label: "작업 상태",
            value: STATUS_LABEL[agent.activity.workStatus] ?? agent.activity.workStatus,
          },
          {
            label: "최근 Hook",
            value: agent.activity.hookEventName ?? "—",
            mono: true,
          },
        ]
      : []),
    {
      label: "원격 호스트",
      value: sshHost ? sshHostSummary(sshHost) : "로컬",
      mono: !!sshHost,
    },
    ...(sshHost
      ? [{ label: "원격 폴더", value: remoteFolder || "—", mono: true }]
      : []),
    {
      label: "세션 ID",
      value: sessionIdSupported
        ? agent.lastSessionId ?? "(아직 없음)"
        : "(원격 미지원)",
      mono: true,
    },
    { label: "생성 시각", value: formatDate(agent.createdAt), mono: true },
    ...(sshHost
      ? []
      : [
          {
            label: "폴더",
            value: agent.folder || project?.folder || "—",
            mono: true,
          },
        ]),
    { label: "Agent ID", value: agent.id, mono: true },
  ];

  const supportsDangerous = !!tool.dangerousFlag;
  const supportsAltScreen = agent.aiToolId === "codex";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal session-props-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-settings-header">
          <h2 className="modal-title">세션 속성</h2>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="session-props-table">
          {rows.map((r) => (
            <div className="session-props-row" key={r.label}>
              <span className="session-props-label">{r.label}</span>
              <span
                className={`session-props-value ${
                  r.mono ? "session-props-mono" : ""
                }`}
                title={r.value}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
        {(supportsDangerous || supportsAltScreen) && (
          <div className="session-props-toggles">
            {supportsDangerous && (
              <label className="session-props-toggle">
                <input
                  type="checkbox"
                  checked={agent.dangerous}
                  onChange={(e) =>
                    onUpdateAgent(agent.id, { dangerous: e.target.checked })
                  }
                />
                <span className="session-props-toggle-body">
                  <span className="session-props-toggle-title">
                    Dangerous 모드
                  </span>
                  <span className="session-props-toggle-desc">
                    {tool.dangerousFlag} 플래그로 실행 (권한 확인 생략)
                  </span>
                </span>
              </label>
            )}
            {supportsAltScreen && (
              <label className="session-props-toggle">
                <input
                  type="checkbox"
                  checked={agent.useAltScreen === true}
                  onChange={(e) =>
                    onUpdateAgent(agent.id, {
                      useAltScreen: e.target.checked || undefined,
                    })
                  }
                />
                <span className="session-props-toggle-body">
                  <span className="session-props-toggle-title">
                    Alt-screen 모드
                  </span>
                  <span className="session-props-toggle-desc">
                    켜면 Codex 내부 화면·기록만 사용하는 alternate screen으로
                    실행됨. 터미널 스크롤백(Ctrl+F 검색·드래그 복사)을
                    사용하려면 끈 상태(--no-alt-screen)를 유지하세요
                  </span>
                </span>
              </label>
            )}
            <div className="session-props-toggle-note">
              변경은 세션을 비활성화한 뒤 다시 열면 적용됩니다
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
