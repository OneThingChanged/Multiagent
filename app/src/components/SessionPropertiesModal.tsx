import { useEffect, useId, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Agent, Project } from "../types";
import { toolForId } from "../types";
import { findSshHost, sshHostSummary } from "../lib/sshHosts";
import { SessionWorkerFields } from "./SessionWorkerFields";
import { SessionStorageList } from "./SessionStorageList";
import { useAppLanguage } from "../lib/appLanguage";

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

type SessionPropertiesTabId = "overview" | "storage" | "options";

type SessionPropertiesTab = {
  id: SessionPropertiesTabId;
  label: string;
};

export function nextSessionPropertiesTabIndex(
  currentIndex: number,
  key: string,
  tabCount: number
) {
  if (tabCount <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  return currentIndex;
}

export function SessionPropertiesModal({
  agent,
  project,
  onUpdateAgent,
  onSessionDeleted,
  disabledTools = [],
  onClose,
}: {
  agent: Agent;
  project: Project | null;
  onUpdateAgent: (
    id: string,
    patch: Partial<
      Pick<Agent, "dangerous" | "useAltScreen" | "workerSettings">
    >
  ) => void;
  onSessionDeleted?: (aiToolId: string, sessionId: string) => void;
  disabledTools?: string[];
  onClose: () => void;
}) {
  useNativeViewOcclusion();
  const { language, text } = useAppLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tool = toolForId(agent.aiToolId);
  const supportsDangerous = !!tool.dangerousFlag;
  const supportsAltScreen = agent.aiToolId === "codex";
  const supportsWorkers = agent.aiToolId === "codex";
  const supportsOptions =
    supportsDangerous || supportsAltScreen || supportsWorkers;
  const tabs: SessionPropertiesTab[] = [
    { id: "overview", label: text("기본 정보", "Overview") },
    { id: "storage", label: text("세션 데이터", "Session data") },
    ...(supportsOptions
      ? ([{ id: "options", label: text("실행 옵션", "Launch options") }] satisfies SessionPropertiesTab[])
      : []),
  ];
  const [activeTab, setActiveTab] =
    useState<SessionPropertiesTabId>("overview");
  const tabIdPrefix = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sshHostId = agent.sshHostId ?? project?.sshHostId;
  const sshHost = sshHostId ? findSshHost(sshHostId) : null;
  const remoteFolder = agent.remoteFolder ?? project?.remoteFolder;
  // Resume/session-id is captured for local sessions and Windows remotes
  // (Phase 2 reverse-tunnel hooks); POSIX remotes are not supported yet.
  const sessionIdSupported = !sshHost || sshHost.remoteOs === "windows";
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: text("이름", "Name"), value: agent.name },
    { label: text("프로젝트", "Project"), value: project?.name ?? "—" },
    { label: text("도구", "Tool"), value: tool.label },
    { label: text("상태", "Status"), value: language === "ko" ? STATUS_LABEL[agent.status] ?? agent.status : agent.status },
    ...(agent.activity
      ? [
          {
            label: text("작업 상태", "Work status"),
            value: language === "ko" ? STATUS_LABEL[agent.activity.workStatus] ?? agent.activity.workStatus : agent.activity.workStatus,
          },
          {
            label: text("최근 Hook", "Latest hook"),
            value: agent.activity.hookEventName ?? "—",
            mono: true,
          },
        ]
      : []),
    {
      label: text("원격 호스트", "Remote host"),
      value: sshHost ? sshHostSummary(sshHost) : text("로컬", "Local"),
      mono: !!sshHost,
    },
    ...(sshHost
      ? [{ label: text("원격 폴더", "Remote folder"), value: remoteFolder || "—", mono: true }]
      : []),
    {
      label: text("세션 ID", "Session ID"),
      value: sessionIdSupported
        ? agent.lastSessionId ?? text("(아직 없음)", "(not available yet)")
        : text("(원격 미지원)", "(not supported remotely)"),
      mono: true,
    },
    { label: text("생성 시각", "Created"), value: formatDate(agent.createdAt), mono: true },
    ...(sshHost
      ? []
      : [
          {
            label: text("폴더", "Folder"),
            value: agent.folder || project?.folder || "—",
            mono: true,
          },
        ]),
    { label: "Agent ID", value: agent.id, mono: true },
  ];

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) {
    const nextIndex = nextSessionPropertiesTabIndex(
      currentIndex,
      event.key,
      tabs.length
    );
    if (nextIndex === currentIndex && !["Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal session-props-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-settings-header">
          <h2 className="modal-title">{text("세션 속성", "Session properties")}</h2>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div
          className="session-props-tabs"
          role="tablist"
          aria-label={text("세션 속성 항목", "Session property sections")}
        >
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={`${tabIdPrefix}-${tab.id}-tab`}
                className={`session-props-tab ${
                  selected ? "session-props-tab-active" : ""
                }`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          id={`${tabIdPrefix}-overview-panel`}
          className="session-props-panel"
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-overview-tab`}
          hidden={activeTab !== "overview"}
          tabIndex={0}
        >
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
        </div>
        <div
          id={`${tabIdPrefix}-storage-panel`}
          className="session-props-panel"
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-storage-tab`}
          hidden={activeTab !== "storage"}
          tabIndex={0}
        >
          <SessionStorageList
            folder={agent.folder || project?.folder || ""}
            agents={[
              sshHostId && !agent.sshHostId ? { ...agent, sshHostId } : agent,
            ]}
            onSessionDeleted={onSessionDeleted}
          />
        </div>
        {supportsOptions && (
          <div
            id={`${tabIdPrefix}-options-panel`}
            className="session-props-panel"
            role="tabpanel"
            aria-labelledby={`${tabIdPrefix}-options-tab`}
            hidden={activeTab !== "options"}
            tabIndex={0}
          >
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
                      {text("Dangerous 모드", "Dangerous mode")}
                    </span>
                    <span className="session-props-toggle-desc">
                      {text(`${tool.dangerousFlag} 플래그로 실행 (권한 확인 생략)`, `Launch with ${tool.dangerousFlag} and skip permission prompts`)}
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
                      {text("Alt-screen 모드", "Alt-screen mode")}
                    </span>
                    <span className="session-props-toggle-desc">
                      {text(
                        "켜면 Codex 내부 화면·기록만 사용하는 alternate screen으로 실행됩니다. 터미널 스크롤백(Ctrl+F 검색·드래그 복사)을 사용하려면 끈 상태(--no-alt-screen)를 유지하세요.",
                        "When enabled, Codex uses its internal alternate screen. Keep it disabled (--no-alt-screen) to use terminal scrollback, Ctrl+F search, and drag-to-copy.",
                      )}
                    </span>
                  </span>
                </label>
              )}
              {supportsWorkers && (
                <SessionWorkerFields
                  settings={agent.workerSettings}
                  disabledTools={disabledTools}
                  onChange={(workerSettings) =>
                    onUpdateAgent(agent.id, { workerSettings })
                  }
                  className="session-worker-fields session-worker-fields-props"
                />
              )}
              <div className="session-props-toggle-note">
                {text("변경은 세션을 비활성화한 뒤 다시 열면 적용됩니다", "Changes apply after deactivating and reopening the session")}
              </div>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            {text("닫기", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
