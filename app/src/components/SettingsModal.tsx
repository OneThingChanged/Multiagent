import { useEffect, useState, type ReactNode } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { invoke } from "../platform/runtime";
import {
  check,
  openDialog,
  openStoreProduct,
  openUrl,
  relaunch,
  writeClipboardText,
  type Update,
} from "../platform/plugins";
import { APP_THEMES } from "../lib/appTheme";
import type { AppThemeId } from "../lib/appTheme";
import {
  APP_VERSION,
  formatProductVersion,
  IS_COMPANY_BUILD,
  RELEASES_URL,
} from "../lib/appInfo";
import {
  loadNotificationSound,
  saveNotificationSound,
  playNotificationSound,
  DEFAULT_TTS_MESSAGE,
  type NotificationSoundConfig,
  type NotificationSoundMode,
} from "../lib/notificationSound";
import { loadSshHosts, saveSshHosts } from "../lib/sshHosts";
import { loadDiffToolCommand, saveDiffToolCommand } from "../lib/diffTool";
import { SshSetupGuide } from "./SshSetupGuide";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import type { CommandShortcuts } from "../lib/commandRegistry";
import type { SshHost } from "../types";
import { toolForId } from "../types";
import type { ConversationStorageStatus } from "../platform/ipcContract";

const SOUND_MODES: { id: NotificationSoundMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "custom", label: "Custom" },
  { id: "tts", label: "TTS" },
  { id: "off", label: "Off" },
];

function tailPath(path: string) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const CREATOR_NAME = "OneThingChanged";
const CREATOR_GITHUB = "https://github.com/OneThingChanged";
const CREATOR_GITHUB_LABEL = "@OneThingChanged";

type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "available"; update: Update }
  | { status: "error"; message: string };

type InstallState =
  | { status: "idle" }
  | { status: "downloading"; downloaded: number; total: number | null }
  | { status: "installing" }
  | { status: "error"; message: string };

type StoreLaunchState =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "error"; message: string };

type RemoteStatus = {
  running: boolean;
  url: string | null;
  port: number | null;
};

type TunnelStatus = {
  running: boolean;
  publicUrl: string | null;
};

type AccessList = {
  pending: string[];
  approved: string[];
};

type RemoteConfig = {
  client_id: string;
  owner: string;
  tunnel_token: string;
  public_hostname: string;
  server_port: number;
  client_secret: string;
};

type MonitorStatus = {
  running: boolean;
  url: string | null;
  port: number | null;
};

type MonitorConfig = {
  enabled: boolean;
  serverPort: number;
};

type UsageIngestSummary = {
  files: number;
  events: number;
  errors: string[];
};

type HookRepairSummary = {
  activeSessions: number;
  supportedSessions: number;
  repaired: number;
  alreadyHealthy: number;
  skipped: number;
  restartRequired: number;
  serverRestarted: boolean;
  failures: Array<{ agentId: string; name: string; message: string }>;
};

type HookRepairState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; summary: HookRepairSummary }
  | { status: "error"; message: string };

type DiagnosticExportState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "done";
      path: string;
      terminalCount: number;
      hookHealthy: boolean;
    }
  | { status: "cancelled" }
  | { status: "error"; message: string };

type SettingsCategory =
  | "general"
  | "agents"
  | "data"
  | "shortcuts"
  | "hooks"
  | "dashboard"
  | "remote"
  | "vcs"
  | "ssh"
  | "about";

const svgProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IconSliders = () => (
  <svg {...svgProps}><line x1="4" y1="8" x2="20" y2="8" /><circle cx="9" cy="8" r="2.4" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="15" cy="16" r="2.4" /></svg>
);
const IconKeyboard = () => (
  <svg {...svgProps}><rect x="3" y="6" width="18" height="12" rx="2" /><line x1="7" y1="10" x2="7" y2="10" /><line x1="11" y1="10" x2="11" y2="10" /><line x1="15" y1="10" x2="15" y2="10" /><line x1="8" y1="14" x2="16" y2="14" /></svg>
);
const IconActivity = () => (
  <svg {...svgProps}><polyline points="3,13 8,13 10,7 14,17 16,13 21,13" /></svg>
);
const IconGrid = () => (
  <svg {...svgProps}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
);
const IconGlobe = () => (
  <svg {...svgProps}><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3" y1="12" x2="21" y2="12" /></svg>
);
const IconServer = () => (
  <svg {...svgProps}><rect x="3" y="4" width="18" height="7" rx="1.6" /><rect x="3" y="13" width="18" height="7" rx="1.6" /><line x1="7" y1="7.5" x2="7" y2="7.5" /><line x1="7" y1="16.5" x2="7" y2="16.5" /></svg>
);
const IconInfo = () => (
  <svg {...svgProps}><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="7.6" x2="12" y2="7.6" /></svg>
);
const IconBranch = () => (
  <svg {...svgProps}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="9" r="2.5" /><path d="M6 8.5v7" /><path d="M18 11.5v1a4 4 0 0 1-4 4H6" /></svg>
);
const IconDatabase = () => (
  <svg {...svgProps}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
);

type NavEntry = {
  id: SettingsCategory;
  group: string;
  label: string;
  title: string;
  sub: string;
  keywords: string;
  icon: ReactNode;
};

const ALL_NAV_ENTRIES: NavEntry[] = [
  { id: "general", group: "Workspace", label: "General", title: "General", sub: "테마 · 알림음 · 데스크톱 펫", keywords: "theme 테마 appearance sound 알림음 notification pet 펫", icon: <IconSliders /> },
  { id: "agents", group: "Workspace", label: "Agents", title: "Agents", sub: "연결 상황 · 사용량 바 · Qwen 리전", keywords: "agent 에이전트 연결 connection status usage 사용량 bar qwen region 리전 나라 country", icon: <IconActivity /> },
  { id: "data", group: "Workspace", label: "Data & Sessions", title: "Data & Sessions", sub: "세션별 대화 · 산출물 저장 위치", keywords: "data 데이터 conversation 대화 session 세션 storage 저장소 path 경로 artifact 산출물", icon: <IconDatabase /> },
  { id: "shortcuts", group: "Workspace", label: "Shortcuts", title: "Shortcuts", sub: "명령별 키보드 단축키", keywords: "keyboard 단축키 hotkey shortcut", icon: <IconKeyboard /> },
  { id: "hooks", group: "Workspace", label: "Agent Hooks", title: "Agent Hooks", sub: "Codex/Claude Hook 자동 점검·복구", keywords: "agent hook codex claude repair 복구", icon: <IconActivity /> },
  { id: "dashboard", group: "Services", label: "Dashboard", title: "Dashboard", sub: "로컬 모니터링 서버 · 사용량", keywords: "dashboard monitor usage 사용량 port", icon: <IconGrid /> },
  { id: "remote", group: "Services", label: "Remote", title: "Remote", sub: "모바일 PWA · 터널 · 접근 승인", keywords: "remote pwa tunnel cloudflare github oauth 모바일 mobile access", icon: <IconGlobe /> },
  { id: "vcs", group: "Services", label: "Version Control", title: "Version Control", sub: "외부 diff 프로그램", keywords: "version control git diff 비교 프로그램 tool difftool 소스", icon: <IconBranch /> },
  { id: "ssh", group: "Services", label: "SSH Hosts", title: "SSH Hosts", sub: "원격 실행 호스트", keywords: "ssh host server 원격", icon: <IconServer /> },
  { id: "about", group: "Info", label: "About", title: "About", sub: "버전 · 업데이트 · 진단", keywords: "about version 버전 update 업데이트 diagnostics 진단 creator", icon: <IconInfo /> },
];
const NAV_ENTRIES = ALL_NAV_ENTRIES.filter(
  (entry) => !IS_COMPANY_BUILD || entry.id !== "remote"
);
const NAV_GROUPS = [...new Set(NAV_ENTRIES.map((entry) => entry.group))];

function emptySshDraft(): SshHost {
  return {
    id: "",
    label: "",
    host: "",
    user: "",
    port: undefined,
    identityFile: "",
    extraOptions: "",
    remoteOs: "posix",
    authMethod: "key",
    preferCmdShim: true,
  };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type QwenRegionInfo = {
  available: boolean;
  region: string | null;
  regions: { id: string; label: string }[];
};

type ToolAvailability = Record<string, { available: boolean; path: string | null }>;

// Tools that can be availability-checked + offered in the new-session picker.
const CHECKABLE_TOOL_IDS = ["claude", "codex", "qwen", "cline"];

function AgentsSettings({
  disabledTools,
  onToggleTool,
  showUsageBar,
  onShowUsageBarChange,
}: {
  disabledTools: string[];
  onToggleTool: (toolId: string, enabled: boolean) => void;
  showUsageBar: boolean;
  onShowUsageBarChange: (show: boolean) => void;
}) {
  const [avail, setAvail] = useState<ToolAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const refreshAvail = () => {
    setChecking(true);
    void invoke<ToolAvailability>("check_tools")
      .then(setAvail)
      .catch(() => setAvail(null))
      .finally(() => setChecking(false));
  };
  useEffect(refreshAvail, []);

  const [qwen, setQwen] = useState<QwenRegionInfo | null>(null);
  const [qwenBusy, setQwenBusy] = useState(false);
  const [qwenMsg, setQwenMsg] = useState("");
  useEffect(() => {
    void invoke<QwenRegionInfo>("qwen_region_get")
      .then(setQwen)
      .catch(() => setQwen(null));
  }, []);
  const chooseRegion = (region: string) => {
    setQwenBusy(true);
    setQwenMsg("");
    void invoke<{ ok: boolean; changed: boolean }>("qwen_region_set", { region })
      .then((r) => {
        setQwen((q) => (q ? { ...q, region } : q));
        setQwenMsg(r.changed ? "변경됨 · 실행 중 Qwen 세션은 재시작해야 적용됩니다" : "이미 해당 리전입니다");
      })
      .catch((e) => setQwenMsg(`실패: ${String(e)}`))
      .finally(() => setQwenBusy(false));
  };

  return (
    <div className="app-settings-section">
      <div className="agent-block">
        <div className="agent-row-title-wrap">
          <div className="agent-row-title">사용 가능한 도구</div>
          <button type="button" className="agent-refresh" onClick={refreshAvail} disabled={checking}>
            {checking ? "확인 중…" : "새로고침"}
          </button>
        </div>
        <div className="agent-row-sub">
          체크한 도구만 새 세션 만들기 드롭박스에 표시됩니다. (설치 여부는 오른쪽에 표시)
        </div>
        <div className="agent-tool-list">
          {CHECKABLE_TOOL_IDS.map((id) => {
            const tool = toolForId(id);
            const info = avail?.[id];
            const enabled = !disabledTools.includes(id);
            return (
              <label className="agent-tool-row" key={id}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => onToggleTool(id, e.target.checked)}
                />
                <span className="agent-conn-icon" style={{ color: tool.iconColor }}>
                  {tool.icon}
                </span>
                <span className="agent-tool-name">{tool.label}</span>
                <span
                  className="agent-tool-avail"
                  style={{
                    color: avail == null ? "#8b949e" : info?.available ? "#3fb950" : "#f0883e",
                  }}
                  title={info?.path ?? ""}
                >
                  {avail == null ? "확인 중…" : info?.available ? "✓ 사용 가능" : "✗ 미설치"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <label className="agent-toggle-row">
        <div>
          <div className="agent-row-title">작업표시줄 사용량 표시</div>
          <div className="agent-row-sub">하단 바에 Codex/Claude 사용량·한도를 표시합니다.</div>
        </div>
        <input
          type="checkbox"
          checked={showUsageBar}
          onChange={(e) => onShowUsageBarChange(e.target.checked)}
        />
      </label>

      <div className="agent-block">
        <div className="agent-row-title">Qwen 리전 (나라)</div>
        <div className="agent-row-sub">
          Qwen Code(~/.qwen/settings.json)의 ModelStudio 엔드포인트 리전. 계정 지역과 맞춰야 합니다.
        </div>
        {qwen == null ? (
          <div className="agent-hint">불러오는 중…</div>
        ) : !qwen.available ? (
          <div className="agent-hint">~/.qwen/settings.json 이 없습니다 (Qwen 미설정).</div>
        ) : (
          <div className="agent-region-row">
            {qwen.regions.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={qwenBusy}
                className={`agent-region-btn ${qwen.region === r.id ? "on" : ""}`}
                onClick={() => chooseRegion(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        {qwenMsg && <div className="agent-hint">{qwenMsg}</div>}
      </div>
    </div>
  );
}

export function SettingsModal({
  theme,
  onThemeChange,
  desktopPetEnabled,
  desktopPetAvailable,
  onDesktopPetEnabledChange,
  onResetDesktopPetPosition,
  commandShortcuts,
  onCommandShortcutsChange,
  disabledTools,
  onToggleTool,
  showUsageBar,
  onShowUsageBarChange,
  buildVariant,
  updateProvider,
  onClose,
}: {
  theme: AppThemeId;
  onThemeChange: (theme: AppThemeId) => void;
  desktopPetEnabled: boolean;
  desktopPetAvailable: boolean;
  onDesktopPetEnabledChange: (enabled: boolean) => void;
  onResetDesktopPetPosition: () => void;
  commandShortcuts: CommandShortcuts;
  onCommandShortcutsChange: (shortcuts: CommandShortcuts) => void;
  disabledTools: string[];
  onToggleTool: (toolId: string, enabled: boolean) => void;
  showUsageBar: boolean;
  onShowUsageBarChange: (show: boolean) => void;
  buildVariant: "standard" | "company" | "store";
  updateProvider: "github" | "microsoft-store";
  onClose: () => void;
}) {
  useNativeViewOcclusion();

  const [tab, setTab] = useState<SettingsCategory>("general");
  const [search, setSearch] = useState("");
  const [diffTool, setDiffTool] = useState<string>(() => loadDiffToolCommand());
  const [diffToolSaved, setDiffToolSaved] = useState(false);

  const handleSaveDiffTool = () => {
    saveDiffToolCommand(diffTool.trim());
    setDiffToolSaved(true);
    setTimeout(() => setDiffToolSaved(false), 1500);
  };

  const handlePickDiffProgram = async () => {
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        filters:
          navigator.userAgent.includes("Windows")
            ? [{ name: "Programs", extensions: ["exe", "cmd", "bat"] }]
            : undefined,
      });
      if (typeof selected === "string" && selected) {
        // Quote the program path if it contains spaces so the two file-path
        // arguments we append stay separate.
        setDiffTool(/\s/.test(selected) ? `"${selected}"` : selected);
      }
    } catch {
      // Dialog cancelled or unavailable — leave the field unchanged.
    }
  };
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({
    status: "idle",
  });
  const [install, setInstall] = useState<InstallState>({ status: "idle" });
  const [storeLaunch, setStoreLaunch] = useState<StoreLaunchState>({ status: "idle" });
  const [sound, setSound] = useState<NotificationSoundConfig>(() =>
    loadNotificationSound()
  );
  const [remote, setRemote] = useState<RemoteStatus>({
    running: false,
    url: null,
    port: null,
  });
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteCopied, setRemoteCopied] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelStatus>({
    running: false,
    publicUrl: null,
  });
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [tunnelCopied, setTunnelCopied] = useState(false);

  const [access, setAccess] = useState<AccessList>({
    pending: [],
    approved: [],
  });
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>({
    client_id: "",
    owner: "",
    tunnel_token: "",
    public_hostname: "",
    server_port: 0,
    client_secret: "",
  });
  const [configSaved, setConfigSaved] = useState(false);
  const [monitor, setMonitor] = useState<MonitorStatus>({
    running: false,
    url: null,
    port: null,
  });
  const [monitorConfig, setMonitorConfig] = useState<MonitorConfig>({
    enabled: true,
    serverPort: 4421,
  });
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [monitorCopied, setMonitorCopied] = useState(false);
  const [monitorSaved, setMonitorSaved] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageIngest, setUsageIngest] = useState<UsageIngestSummary | null>(
    null
  );
  const [usageError, setUsageError] = useState<string | null>(null);
  const [hookRepair, setHookRepair] = useState<HookRepairState>({
    status: "idle",
  });
  const [diagnosticExport, setDiagnosticExport] =
    useState<DiagnosticExportState>({ status: "idle" });
  const [conversationStorage, setConversationStorage] =
    useState<ConversationStorageStatus | null>(null);
  const [conversationStorageBusy, setConversationStorageBusy] = useState(false);
  const [conversationStorageError, setConversationStorageError] = useState<string | null>(null);

  const refreshConversationStorage = () => {
    setConversationStorageError(null);
    void invoke("conversation_storage_get", {})
      .then(setConversationStorage)
      .catch((error) => setConversationStorageError(String(error)));
  };

  useEffect(refreshConversationStorage, []);

  const applyConversationStoragePath = async (nextPath: string | null) => {
    setConversationStorageBusy(true);
    setConversationStorageError(null);
    try {
      const next = await invoke("conversation_storage_set", { path: nextPath });
      setConversationStorage(next);
    } catch (error) {
      setConversationStorageError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setConversationStorageBusy(false);
    }
  };

  const handlePickConversationStorage = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) {
        await applyConversationStoragePath(selected);
      }
    } catch (error) {
      setConversationStorageError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleResetConversationStorage = () => {
    if (!conversationStorage?.custom) return;
    if (!window.confirm("기존 대화 저장소를 기본 Local AppData 경로로 안전하게 복사할까요?")) return;
    void applyConversationStoragePath(null);
  };

  const handleOpenConversationStorage = () => {
    if (!conversationStorage?.path) return;
    void invoke("open_local_path", { path: conversationStorage.path }).catch((error) => {
      setConversationStorageError(error instanceof Error ? error.message : String(error));
    });
  };

  const [sshHosts, setSshHosts] = useState<SshHost[]>(() => loadSshHosts());
  const [sshDraft, setSshDraft] = useState<SshHost>(() => emptySshDraft());
  const [sshTest, setSshTest] = useState<
    { status: "idle" | "testing" } | { status: "ok" | "error"; message: string }
  >({ status: "idle" });
  const [sshGuideOpen, setSshGuideOpen] = useState(false);
  // Password for the host being edited. Never stored in the host object /
  // localStorage — persisted via the ssh_password_* commands (Rust-side file).
  const [sshPasswordInput, setSshPasswordInput] = useState("");
  const [sshPasswordSaved, setSshPasswordSaved] = useState(false);

  const persistSshHosts = (next: SshHost[]) => {
    setSshHosts(next);
    saveSshHosts(next);
  };

  const handleSshDraftChange = (patch: Partial<SshHost>) => {
    setSshDraft((prev) => ({ ...prev, ...patch }));
    setSshTest({ status: "idle" });
  };

  const handleSshEdit = (host: SshHost) => {
    setSshDraft({ ...host });
    setSshTest({ status: "idle" });
    setSshPasswordInput("");
    invoke<boolean>("ssh_password_has", { hostId: host.id })
      .then(setSshPasswordSaved)
      .catch(() => setSshPasswordSaved(false));
  };

  const handleSshReset = () => {
    setSshDraft(emptySshDraft());
    setSshTest({ status: "idle" });
    setSshPasswordInput("");
    setSshPasswordSaved(false);
  };

  const handleSshSave = () => {
    const host = sshDraft.host.trim();
    const user = sshDraft.user.trim();
    if (!host || !user) return;
    const entry: SshHost = {
      id: sshDraft.id || crypto.randomUUID(),
      label: sshDraft.label.trim() || `${user}@${host}`,
      host,
      user,
      port: sshDraft.port ? Number(sshDraft.port) : undefined,
      identityFile: sshDraft.identityFile?.trim() || undefined,
      extraOptions: sshDraft.extraOptions?.trim() || undefined,
      remoteOs: sshDraft.remoteOs ?? "posix",
      authMethod: sshDraft.authMethod ?? "key",
      preferCmdShim:
        (sshDraft.remoteOs ?? "posix") === "windows"
          ? sshDraft.preferCmdShim ?? true
          : undefined,
    };
    const exists = sshHosts.some((h) => h.id === entry.id);
    persistSshHosts(
      exists
        ? sshHosts.map((h) => (h.id === entry.id ? entry : h))
        : [...sshHosts, entry]
    );
    // Store the password only if one was typed (empty = keep existing).
    if (entry.authMethod === "password" && sshPasswordInput) {
      invoke("ssh_password_set", {
        hostId: entry.id,
        password: sshPasswordInput,
      }).catch(() => {});
    }
    handleSshReset();
  };

  const handleSshClearPassword = () => {
    if (!sshDraft.id) {
      setSshPasswordInput("");
      return;
    }
    invoke("ssh_password_clear", { hostId: sshDraft.id }).catch(() => {});
    setSshPasswordSaved(false);
    setSshPasswordInput("");
  };

  const handleSshDelete = (id: string) => {
    invoke("ssh_password_clear", { hostId: id }).catch(() => {});
    persistSshHosts(sshHosts.filter((h) => h.id !== id));
    if (sshDraft.id === id) handleSshReset();
  };

  const handleSshPickIdentity = async () => {
    try {
      const selected = await openDialog({ directory: false, multiple: false });
      if (typeof selected === "string") handleSshDraftChange({ identityFile: selected });
    } catch {}
  };

  const handleSshTest = async () => {
    const host = sshDraft.host.trim();
    const user = sshDraft.user.trim();
    if (!host || !user) return;
    setSshTest({ status: "testing" });
    try {
      const msg = await invoke<string>("ssh_test", {
        ssh: {
          host,
          user,
          port: sshDraft.port ? Number(sshDraft.port) : undefined,
          identityFile: sshDraft.identityFile?.trim() || undefined,
          extraOptions: sshDraft.extraOptions?.trim() || undefined,
          remoteFolder: null,
          authMethod: sshDraft.authMethod ?? "key",
          hostId: sshDraft.id,
          password: sshPasswordInput || undefined,
        },
      });
      setSshTest({ status: "ok", message: msg });
    } catch (err) {
      setSshTest({ status: "error", message: String(err) });
    }
  };

  useEffect(() => {
    if (!IS_COMPANY_BUILD) {
      invoke<RemoteConfig>("remote_config_get")
        .then(setRemoteConfig)
        .catch(() => {});
    }
    invoke<MonitorConfig>("monitor_config_get")
      .then(setMonitorConfig)
      .catch(() => {});
  }, []);

  const handleSaveRemoteConfig = () => {
    if (IS_COMPANY_BUILD) return;
    invoke<RemoteConfig>("remote_config_set", { config: remoteConfig })
      .then((saved) => {
        setRemoteConfig(saved);
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 1500);
      })
      .catch(() => {});
  };

  useEffect(() => {
    invoke<MonitorStatus>("monitor_server_status")
      .then(setMonitor)
      .catch(() => {});
    if (IS_COMPANY_BUILD) return;

    invoke<RemoteStatus>("remote_server_status")
      .then(setRemote)
      .catch(() => {});
    invoke<TunnelStatus>("tunnel_status")
      .then(setTunnel)
      .catch(() => {});
    const loadAccess = () =>
      invoke<AccessList>("remote_access_list")
        .then(setAccess)
        .catch(() => {});
    loadAccess();
    const interval = setInterval(loadAccess, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = (login: string) => {
    if (IS_COMPANY_BUILD) return;
    invoke<AccessList>("remote_access_approve", { login })
      .then(setAccess)
      .catch(() => {});
  };

  const handleRevoke = (login: string) => {
    if (IS_COMPANY_BUILD) return;
    invoke<AccessList>("remote_access_revoke", { login })
      .then(setAccess)
      .catch(() => {});
  };

  const handleTunnelToggle = async () => {
    if (IS_COMPANY_BUILD) return;
    setTunnelBusy(true);
    setTunnelError(null);
    try {
      if (tunnel.running) {
        setTunnel(await invoke<TunnelStatus>("stop_tunnel"));
      } else {
        setTunnel(await invoke<TunnelStatus>("start_tunnel"));
        const status = await invoke<RemoteStatus>("remote_server_status");
        setRemote(status);
      }
    } catch (err) {
      setTunnelError(
        err instanceof Error ? err.message : typeof err === "string" ? err : "tunnel failed"
      );
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleCopyTunnelUrl = () => {
    if (!tunnel.publicUrl) return;
    writeClipboardText(tunnel.publicUrl)
      .then(() => {
        setTunnelCopied(true);
        setTimeout(() => setTunnelCopied(false), 1500);
      })
      .catch(() => {});
  };

  const handleRemoteToggle = async () => {
    if (IS_COMPANY_BUILD) return;
    setRemoteBusy(true);
    try {
      const next = remote.running
        ? await invoke<RemoteStatus>("stop_remote_server")
        : await invoke<RemoteStatus>("start_remote_server");
      setRemote(next);
    } catch (err) {
      console.error("remote server toggle failed", err);
    } finally {
      setRemoteBusy(false);
    }
  };

  const handleCopyRemoteUrl = () => {
    if (!remote.url) return;
    writeClipboardText(remote.url)
      .then(() => {
        setRemoteCopied(true);
        setTimeout(() => setRemoteCopied(false), 1500);
      })
      .catch(() => {});
  };

  const handleMonitorToggle = async () => {
    setMonitorBusy(true);
    setMonitorError(null);
    try {
      const next = monitor.running
        ? await invoke<MonitorStatus>("stop_monitor_server")
        : await invoke<MonitorStatus>("start_monitor_server");
      setMonitor(next);
    } catch (err) {
      setMonitorError(
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "monitor dashboard failed"
      );
    } finally {
      setMonitorBusy(false);
    }
  };

  const handleSaveMonitorConfig = () => {
    invoke<MonitorConfig>("monitor_config_set", { config: monitorConfig })
      .then((saved) => {
        setMonitorConfig(saved);
        setMonitorSaved(true);
        setTimeout(() => setMonitorSaved(false), 1500);
      })
      .catch((err) => {
        setMonitorError(
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "monitor config save failed"
        );
      });
  };

  const handleCopyMonitorUrl = () => {
    if (!monitor.url) return;
    writeClipboardText(monitor.url)
      .then(() => {
        setMonitorCopied(true);
        setTimeout(() => setMonitorCopied(false), 1500);
      })
      .catch(() => {});
  };

  const handleOpenMonitor = () => {
    if (!monitor.url) return;
    openUrl(monitor.url).catch((error) => {
      console.error("Failed to open monitor dashboard", error);
    });
  };

  const handleUsageReindex = async () => {
    setUsageBusy(true);
    setUsageError(null);
    try {
      const summary = await invoke<UsageIngestSummary>("usage_ingest_now");
      setUsageIngest(summary);
    } catch (err) {
      setUsageError(
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "usage reindex failed"
      );
    } finally {
      setUsageBusy(false);
    }
  };

  const handleHookRepair = async () => {
    setHookRepair({ status: "running" });
    try {
      const summary = await invoke<HookRepairSummary>("repair_active_hooks");
      setHookRepair({ status: "done", summary });
    } catch (err) {
      setHookRepair({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Hook 복구에 실패했습니다.",
      });
    }
  };

  const handleDiagnosticExport = async () => {
    setDiagnosticExport({ status: "running" });
    try {
      const result = await invoke<{
        path: string;
        terminalCount: number;
        hookHealthy: boolean;
      } | null>("export_diagnostics");
      setDiagnosticExport(
        result ? { status: "done", ...result } : { status: "cancelled" }
      );
    } catch (err) {
      setDiagnosticExport({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "진단 번들을 저장하지 못했습니다.",
      });
    }
  };

  const applySound = (next: NotificationSoundConfig) => {
    setSound(next);
    saveNotificationSound(next);
  };

  const handleSoundModeChange = (mode: NotificationSoundMode) => {
    applySound({ ...sound, mode });
  };

  const handlePickCustomFile = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "Audio", extensions: ["wav", "mp3", "ogg", "m4a", "flac"] },
        ],
      });
      if (typeof selected === "string" && selected) {
        applySound({ mode: "custom", customPath: selected });
      }
    } catch (err) {
      console.error("pick sound file failed", err);
    }
  };

  const handleTestSound = () => {
    playNotificationSound(sound).catch((err) =>
      console.error("test sound failed", err)
    );
  };

  const handleOpenGitHub = () => {
    openUrl(CREATOR_GITHUB).catch((error) => {
      console.error("Failed to open creator GitHub", error);
    });
  };

  const handleOpenReleases = () => {
    openUrl(RELEASES_URL).catch((error) => {
      console.error("Failed to open release page", error);
    });
  };

  const handleOpenStoreProduct = async () => {
    setStoreLaunch({ status: "opening" });
    try {
      await openStoreProduct();
      setStoreLaunch({ status: "idle" });
    } catch (error) {
      setStoreLaunch({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Microsoft Store를 열 수 없습니다.",
      });
    }
  };

  const handleCheckForUpdates = async () => {
    setInstall({ status: "idle" });
    setUpdateCheck({ status: "checking" });
    try {
      const update = await check();
      if (update) {
        setUpdateCheck({ status: "available", update });
      } else {
        setUpdateCheck({ status: "current" });
      }
    } catch (error) {
      setUpdateCheck({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to check for updates",
      });
    }
  };

  const handleInstallUpdate = async (update: Update) => {
    setInstall({ status: "downloading", downloaded: 0, total: null });
    try {
      let total: number | null = null;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          setInstall({ status: "downloading", downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setInstall({ status: "downloading", downloaded, total });
        } else if (event.event === "Finished") {
          setInstall({ status: "installing" });
        }
      });
      await relaunch();
    } catch (error) {
      setInstall({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to install update",
      });
    }
  };

  const isBusy =
    updateCheck.status === "checking" ||
    install.status === "downloading" ||
    install.status === "installing";

  const query = search.trim().toLowerCase();
  const matchesSearch = (entry: NavEntry) =>
    !query ||
    entry.label.toLowerCase().includes(query) ||
    entry.keywords.toLowerCase().includes(query);
  const activeEntry =
    NAV_ENTRIES.find((entry) => entry.id === tab) ?? NAV_ENTRIES[0];

  const handleSearch = (value: string) => {
    setSearch(value);
    const next = value.trim().toLowerCase();
    if (!next) return;
    const firstHit = NAV_ENTRIES.find(
      (entry) =>
        entry.label.toLowerCase().includes(next) ||
        entry.keywords.toLowerCase().includes(next)
    );
    if (firstHit) setTab(firstHit.id);
  };

  return (
    <>
    {sshGuideOpen && <SshSetupGuide onClose={() => setSshGuideOpen(false)} />}
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal app-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="app-settings-side">
          <div className="app-settings-side-head">
            <span className="app-settings-brand">M</span>
            <h2 id="app-settings-title" className="modal-title">Settings</h2>
          </div>
          <label className="app-settings-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
            <input
              type="search"
              value={search}
              placeholder="설정 검색…"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </label>
          <nav className="app-settings-nav">
            {NAV_GROUPS.map((group) => {
              const entries = NAV_ENTRIES.filter(
                (entry) => entry.group === group && matchesSearch(entry)
              );
              if (entries.length === 0) return null;
              return (
                <div className="app-settings-nav-group" key={group}>
                  <div className="app-settings-nav-label">{group}</div>
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      className={`app-settings-nav-item ${
                        tab === entry.id ? "app-settings-nav-item-active" : ""
                      }`}
                      onClick={() => setTab(entry.id)}
                    >
                      <span className="app-settings-nav-icon">{entry.icon}</span>
                      {entry.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="app-settings-side-foot">
            <span className="app-settings-ver">v{APP_VERSION}</span>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </aside>

        <div className="app-settings-main">
        <div className="app-settings-content-head">
          <div>
            <h2 className="modal-title">{activeEntry.title}</h2>
            <div className="app-settings-content-sub">{activeEntry.sub}</div>
          </div>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="app-settings-body">
        {tab === "general" && (
        <>
        <div className="app-settings-section">
          <div className="field-label">Theme</div>
          <div className="app-theme-options">
            {APP_THEMES.map((option) => (
              <button
                key={option.id}
                className={`app-theme-option ${
                  option.id === theme ? "app-theme-option-active" : ""
                }`}
                onClick={() => onThemeChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="app-settings-section">
          <div className="field-label">Notification sound</div>
          <div className="app-theme-options">
            {SOUND_MODES.map((option) => (
              <button
                key={option.id}
                className={`app-theme-option ${
                  option.id === sound.mode ? "app-theme-option-active" : ""
                }`}
                onClick={() => handleSoundModeChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {sound.mode === "custom" && (
            <div className="app-sound-custom-row">
              <span
                className="app-sound-custom-path"
                title={sound.customPath ?? ""}
              >
                {sound.customPath
                  ? tailPath(sound.customPath)
                  : "No file selected"}
              </span>
              <button
                className="btn-secondary app-sound-pick-btn"
                onClick={handlePickCustomFile}
              >
                Choose...
              </button>
            </div>
          )}
          {sound.mode === "tts" && (
            <div className="app-sound-custom-row">
              <input
                type="text"
                className="app-sound-tts-input"
                value={sound.ttsMessage ?? DEFAULT_TTS_MESSAGE}
                placeholder={DEFAULT_TTS_MESSAGE}
                onChange={(e) =>
                  applySound({ ...sound, ttsMessage: e.target.value })
                }
              />
            </div>
          )}
          <div className="app-sound-actions">
            <button
              className="btn-secondary app-sound-test-btn"
              onClick={handleTestSound}
              disabled={sound.mode === "custom" && !sound.customPath}
            >
              Test
            </button>
          </div>
          <label className="app-checkbox-row">
            <input
              type="checkbox"
              checked={sound.osNotification !== false}
              onChange={(e) =>
                applySound({ ...sound, osNotification: e.target.checked })
              }
            />
            Windows 알림 표시 (소리 중복 방지: 앱 사운드가 켜져 있으면 무음)
          </label>
        </div>

        <div className="app-settings-section">
          <div className="field-label">Desktop Pet</div>
          <div className="app-about-card app-pet-settings-card">
            <label className="app-checkbox-row app-pet-toggle-row">
              <input
                type="checkbox"
                checked={desktopPetEnabled}
                disabled={!desktopPetAvailable}
                onChange={(event) =>
                  onDesktopPetEnabledChange(event.target.checked)
                }
              />
              <span>화면 위에 작업 상태 펫 표시</span>
            </label>
            <div className="app-update-message">
              {desktopPetAvailable
                ? "작업 중에는 움직이고, 완료되면 세션 이름과 완료 배지를 표시합니다. 펫 아래의 점을 끌어서 이동할 수 있습니다."
                : "Desktop Pet은 중복 표시를 막기 위해 주 MultiAgent 창에서만 설정할 수 있습니다."}
            </div>
            <div className="app-sound-actions">
              <button
                className="btn-secondary app-sound-test-btn"
                disabled={!desktopPetAvailable || !desktopPetEnabled}
                onClick={onResetDesktopPetPosition}
              >
                위치 초기화
              </button>
            </div>
          </div>
        </div>

        </>
        )}

        {tab === "agents" && (
          <AgentsSettings
            disabledTools={disabledTools}
            onToggleTool={onToggleTool}
            showUsageBar={showUsageBar}
            onShowUsageBarChange={onShowUsageBarChange}
          />
        )}

        {tab === "data" && (
        <div className="app-settings-section">
          <div className="field-label">대화·산출물 저장 위치</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">현재 위치</span>
              <span className="app-about-value">
                {conversationStorage?.custom ? "사용자 지정" : "Local AppData (기본값)"}
              </span>
            </div>
            <label className="field app-remote-field">
              <span className="field-label">Storage root</span>
              <div className="folder-row">
                <input
                  value={conversationStorage?.path ?? "불러오는 중…"}
                  readOnly
                  spellCheck={false}
                  title={conversationStorage?.path ?? ""}
                />
                <button
                  type="button"
                  className="browse-btn"
                  onClick={handlePickConversationStorage}
                  disabled={conversationStorageBusy}
                >
                  Choose…
                </button>
              </div>
            </label>
            <div className="app-update-message">
              세션별 사용자 메시지·AI 응답·도구 실행·발견된 산출물 경로를 MultiAgent 전용
              SQLite에 저장합니다. 새 위치를 선택하면 기존 데이터를 검증한 뒤 복사하고,
              이전 저장소는 백업으로 남깁니다. 전용 빈 폴더를 선택해 주세요.
            </div>
            {conversationStorageError && (
              <div className="app-update-message app-update-error">
                {conversationStorageError}
              </div>
            )}
            {conversationStorage && !conversationStorage.available && (
              <div className="app-update-message app-update-error">
                저장소 연결 안 됨: {conversationStorage.error}. 원본 Codex·Claude 기록으로 임시 표시하며,
                이 위치를 다시 선택하거나 다른 전용 폴더로 변경해 주세요.
              </div>
            )}
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleOpenConversationStorage}
                disabled={!conversationStorage || conversationStorageBusy}
              >
                폴더 열기
              </button>
              <button
                className="btn-secondary app-update-btn"
                onClick={handleResetConversationStorage}
                disabled={!conversationStorage?.custom || conversationStorageBusy}
              >
                기본 경로 복원
              </button>
              <button
                className="btn-secondary app-update-btn"
                onClick={refreshConversationStorage}
                disabled={conversationStorageBusy}
              >
                {conversationStorageBusy ? "이동 중…" : "새로고침"}
              </button>
            </div>
          </div>

          <div className="field-label" style={{ marginTop: 14 }}>저장 현황</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">대화</span>
              <span className="app-about-value">
                {conversationStorage ? `${conversationStorage.conversations.toLocaleString()}개` : "—"}
              </span>
            </div>
            <div className="app-about-row">
              <span className="app-about-label">대화 블록</span>
              <span className="app-about-value">
                {conversationStorage ? `${conversationStorage.blocks.toLocaleString()}개` : "—"}
              </span>
            </div>
            <div className="app-about-row">
              <span className="app-about-label">산출물 인덱스</span>
              <span className="app-about-value">
                {conversationStorage ? `${conversationStorage.artifacts.toLocaleString()}개` : "—"}
              </span>
            </div>
            <div className="app-about-row">
              <span className="app-about-label">사용 용량</span>
              <span className="app-about-value">
                {conversationStorage ? formatBytes(conversationStorage.bytes) : "—"}
              </span>
            </div>
            <div className="app-update-message">
              기본 위치는 Windows Local AppData이며 Git 저장소나 설치 파일에는 포함되지 않습니다.
              원본 Codex·Claude JSONL이 없어져도 이미 수집한 대화는 이 저장소에서 계속 볼 수 있습니다.
            </div>
          </div>
        </div>
        )}

        {tab === "shortcuts" && (
        <div className="app-settings-section">
          <div className="field-label">Keyboard shortcuts</div>
          <div className="app-about-card">
            <div className="app-update-message">
              버튼을 누른 뒤 새 단축키를 입력하세요. Backspace로 해제하고 Esc로 취소할 수 있습니다.
            </div>
            <KeyboardShortcuts
              shortcuts={commandShortcuts}
              onChange={onCommandShortcutsChange}
            />
          </div>
        </div>
        )}

        {tab === "hooks" && (
        <div className="app-settings-section">
          <div className="field-label">Agent Hooks</div>
          <div className="app-about-card">
            <div className="app-update-message">
              {hookRepair.status === "idle" &&
                "실행 중인 PTY와 Codex/Claude Hook 상태를 1분마다 자동 점검합니다. 아래 버튼은 helper·설정·로컬 연결을 즉시 다시 구성합니다. Codex가 변경된 Hook 검토를 알리면 /hooks에서 MultiAgent 항목을 확인해 신뢰해야 합니다."}
              {hookRepair.status === "running" && "Hook 상태를 점검하고 복구하는 중입니다..."}
              {hookRepair.status === "error" && (
                <span className="app-update-error">{hookRepair.message}</span>
              )}
              {hookRepair.status === "done" && (
                <>
                  활성 {hookRepair.summary.activeSessions}개 중 지원 세션 {hookRepair.summary.supportedSessions}개를 확인했습니다. 복구 {hookRepair.summary.repaired}개, 정상 {hookRepair.summary.alreadyHealthy}개
                  {hookRepair.summary.serverRestarted ? ", Hook 서버 재연결 완료" : ""}.
                  {hookRepair.summary.skipped > 0
                    ? ` Hook 미사용 세션 ${hookRepair.summary.skipped}개는 제외했습니다.`
                    : ""}
                  {hookRepair.summary.restartRequired > 0 && (
                    <div className="app-update-error">
                      Hook 정의 또는 SSH 연결이 바뀐 세션 {hookRepair.summary.restartRequired}개는 다시 열어주세요. Codex가 Hook 검토를 알리면 /hooks에서 MultiAgent 항목을 확인해 신뢰해야 합니다.
                    </div>
                  )}
                  {hookRepair.summary.failures.map((failure) => (
                    <div className="app-update-error" key={failure.agentId}>
                      {failure.name}: {failure.message}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="app-update-actions">
              <button
                className="btn-primary app-update-btn"
                onClick={handleHookRepair}
                disabled={hookRepair.status === "running"}
              >
                {hookRepair.status === "running" ? "복구 중..." : "Hook 점검 및 복구"}
              </button>
            </div>
          </div>
        </div>
        )}

        {tab === "dashboard" && (
        <>
        <div className="app-settings-section">
          <div className="field-label">Dashboard server</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">Status</span>
              <span className="app-about-value">
                {monitor.running ? `running (port ${monitor.port})` : "off"}
              </span>
            </div>
            {monitor.running && monitor.url && (
              <div className="app-remote-url-row">
                <span className="app-remote-url" title={monitor.url}>
                  {monitor.url}
                </span>
                <button
                  className="btn-secondary app-update-btn"
                  onClick={handleCopyMonitorUrl}
                >
                  {monitorCopied ? "Copied!" : "Copy"}
                </button>
                <button
                  className="btn-secondary app-update-btn"
                  onClick={handleOpenMonitor}
                >
                  Open
                </button>
              </div>
            )}
            <div
              className={`app-update-message ${monitorError ? "app-update-error" : ""}`}
            >
              {monitorError
                ? `Monitor error: ${monitorError}`
                : "하나의 로컬 웹에서 세션 모니터링, split 그룹, hook 상태, docs/phase, 사용량을 함께 봅니다."}
            </div>
            <div className="app-update-actions">
              <button
                className={
                  monitor.running
                    ? "btn-secondary app-update-btn"
                    : "btn-primary app-update-btn"
                }
                onClick={handleMonitorToggle}
                disabled={monitorBusy}
              >
                {monitorBusy ? "..." : monitor.running ? "Stop" : "Start"}
              </button>
            </div>

            <div className="app-remote-divider" />
            <label className="field app-remote-field">
              <span className="field-label">Local dashboard port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={monitorConfig.serverPort}
                onChange={(e) =>
                  setMonitorConfig((c) => ({
                    ...c,
                    serverPort: Math.max(
                      1,
                      Math.min(65535, Number(e.target.value) || 4421)
                    ),
                  }))
                }
              />
            </label>
            <label className="app-checkbox-row">
              <input
                type="checkbox"
                checked={monitorConfig.enabled}
                onChange={(e) =>
                  setMonitorConfig((c) => ({
                    ...c,
                    enabled: e.target.checked,
                  }))
                }
              />
              <span>Start dashboard when MultiAgent starts</span>
            </label>
            <div className="app-update-message">
              기본값은 4421입니다. 포트 변경은 다음 Start부터 적용됩니다.
            </div>
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleSaveMonitorConfig}
              >
                {monitorSaved ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>

        <div className="app-settings-section">
          <div className="field-label">Usage data</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">Website</span>
              <span className="app-about-value">
                {monitor.running ? "included in Dashboard" : "Dashboard off"}
              </span>
            </div>
            <div
              className={`app-update-message ${usageError ? "app-update-error" : ""}`}
            >
              {usageError
                ? `Usage error: ${usageError}`
                : "Claude/Codex JSONL transcript 사용량은 위 Dashboard 서버 안의 Usage 화면에서 함께 봅니다."}
            </div>
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleUsageReindex}
                disabled={usageBusy}
              >
                Reindex
              </button>
            </div>
            {usageIngest && (
              <>
                <div className="app-remote-divider" />
                <div className="app-about-row">
                  <span className="app-about-label">Last reindex</span>
                  <span className="app-about-value">
                    {usageIngest.files} files · {usageIngest.events} new events
                  </span>
                </div>
                {usageIngest.errors.length > 0 && (
                  <div className="app-update-message app-update-error">
                    {usageIngest.errors.slice(0, 3).join(" / ")}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        </>
        )}

        {tab === "remote" && (
        <div className="app-settings-section">
          <div className="field-label">Remote PWA</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">Status</span>
              <span className="app-about-value">
                {remote.running ? `running (port ${remote.port})` : "off"}
              </span>
            </div>
            {remote.running && remote.url && (
              <div className="app-remote-url-row">
                <span className="app-remote-url" title={remote.url}>
                  {remote.url}
                </span>
                <button
                  className="btn-secondary app-update-btn"
                  onClick={handleCopyRemoteUrl}
                >
                  {remoteCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
            <div className="app-update-message">
              {remote.running
                ? "모바일 리모컨 서버가 준비됐습니다. 위 주소는 이 PC에서 확인할 때 사용하고, 휴대폰에서는 아래 HTTPS 터널 주소를 사용하세요."
                : "세션 상태·최근 출력·질문을 확인하고 짧은 지시를 보낼 수 있는 모바일 PWA 서버를 켭니다."}
            </div>
            <div className="app-update-actions">
              <button
                className={
                  remote.running
                    ? "btn-secondary app-update-btn"
                    : "btn-primary app-update-btn"
                }
                onClick={handleRemoteToggle}
                disabled={remoteBusy}
              >
                {remoteBusy ? "..." : remote.running ? "Stop" : "Start"}
              </button>
            </div>

            <div className="app-remote-divider" />
            <div className="app-about-row">
              <span className="app-about-label">External</span>
              <span className="app-about-value">
                {tunnel.running ? "public tunnel on" : "off"}
              </span>
            </div>
            {tunnel.running && tunnel.publicUrl && (
              <div className="app-remote-url-row">
                <span className="app-remote-url" title={tunnel.publicUrl}>
                  {tunnel.publicUrl}
                </span>
                <button
                  className="btn-secondary app-update-btn"
                  onClick={handleCopyTunnelUrl}
                >
                  {tunnelCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
            <div
              className={`app-update-message ${tunnelError ? "app-update-error" : ""}`}
            >
              {tunnelError
                ? `Tunnel error: ${tunnelError}`
                : tunnelBusy && !tunnel.running
                  ? "터널 시작 중... 처음이면 cloudflared 다운로드(~60MB) 때문에 오래 걸릴 수 있어요."
                  : tunnel.running
                    ? "휴대폰에서 위 HTTPS 주소를 열고 브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요. Quick tunnel 주소는 다시 켤 때 바뀝니다."
                    : "Cloudflare Tunnel로 공개 HTTPS 주소를 발급해 외부 인터넷에서 접속할 수 있게 합니다."}
            </div>
            <div className="app-update-actions">
              <button
                className={
                  tunnel.running
                    ? "btn-secondary app-update-btn"
                    : "btn-primary app-update-btn"
                }
                onClick={handleTunnelToggle}
                disabled={tunnelBusy}
              >
                {tunnelBusy
                  ? "..."
                  : tunnel.running
                    ? "Stop tunnel"
                    : "Start tunnel"}
              </button>
            </div>

            <div className="app-remote-divider" />
            <div className="app-about-row">
              <span className="app-about-label">GitHub OAuth</span>
            </div>
            <label className="field app-remote-field">
              <span className="field-label">Client ID</span>
              <input
                value={remoteConfig.client_id}
                placeholder="Ov23li..."
                onChange={(e) =>
                  setRemoteConfig((c) => ({ ...c, client_id: e.target.value }))
                }
              />
            </label>
            <label className="field app-remote-field">
              <span className="field-label">Owner GitHub username (항상 허용)</span>
              <input
                value={remoteConfig.owner}
                placeholder="my-github-id"
                onChange={(e) =>
                  setRemoteConfig((c) => ({ ...c, owner: e.target.value }))
                }
              />
            </label>
            <label className="field app-remote-field">
              <span className="field-label">
                Client Secret (선택 — 고정 도메인일 때 리다이렉트 로그인)
              </span>
              <input
                type="password"
                value={remoteConfig.client_secret}
                placeholder="비우면 Device Flow 사용"
                onChange={(e) =>
                  setRemoteConfig((c) => ({
                    ...c,
                    client_secret: e.target.value,
                  }))
                }
              />
            </label>
            <div className="app-update-message">
              github.com/settings/developers에서 OAuth App을 만들고 Client ID를
              입력하세요. Client Secret + Public hostname까지 설정하면 코드 입력
              없는 리다이렉트 로그인이 되고 (callback URL:
              https://호스트네임/auth/github/callback), 비우면 Device Flow를 사용합니다.
              Owner 계정은 승인 없이 항상 접속할 수 있습니다.
            </div>

            <div className="app-remote-divider" />
            <div className="app-about-row">
              <span className="app-about-label">Fixed domain (named tunnel)</span>
            </div>
            <label className="field app-remote-field">
              <span className="field-label">Cloudflare tunnel token (비우면 quick tunnel)</span>
              <input
                value={remoteConfig.tunnel_token}
                placeholder="eyJhIjoi..."
                onChange={(e) =>
                  setRemoteConfig((c) => ({ ...c, tunnel_token: e.target.value }))
                }
              />
            </label>
            <label className="field app-remote-field">
              <span className="field-label">Public hostname</span>
              <input
                value={remoteConfig.public_hostname}
                placeholder="agent.example.com"
                onChange={(e) =>
                  setRemoteConfig((c) => ({
                    ...c,
                    public_hostname: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field app-remote-field">
              <span className="field-label">로컬 서버 포트 (0 = 랜덤, named tunnel은 고정 필요)</span>
              <input
                type="number"
                min={0}
                max={65535}
                value={remoteConfig.server_port}
                onChange={(e) =>
                  setRemoteConfig((c) => ({
                    ...c,
                    server_port: Math.max(
                      0,
                      Math.min(65535, Number(e.target.value) || 0)
                    ),
                  }))
                }
              />
            </label>
            <div className="app-update-message">
              Cloudflare Zero Trust → Networks → Tunnels에서 만든 토큰을
              입력하면 고정 도메인으로 서비스됩니다. 대시보드의 Public hostname
              service는 여기 설정한 포트의 http://localhost를 가리켜야 합니다.
            </div>
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleSaveRemoteConfig}
              >
                {configSaved ? "Saved!" : "Save"}
              </button>
            </div>

            <div className="app-remote-divider" />
            <div className="app-about-row">
              <span className="app-about-label">Access</span>
              <span className="app-about-value">
                승인 대기 {access.pending.length} · 승인됨 {access.approved.length}
              </span>
            </div>
            {access.pending.map((login) => (
              <div className="app-access-row" key={`p-${login}`}>
                <span className="app-access-user app-access-pending">
                  @{login}
                </span>
                <button
                  className="btn-primary app-access-btn"
                  onClick={() => handleApprove(login)}
                >
                  승인
                </button>
                <button
                  className="btn-secondary app-access-btn"
                  onClick={() => handleRevoke(login)}
                >
                  거절
                </button>
              </div>
            ))}
            {access.approved.map((login) => (
              <div className="app-access-row" key={`a-${login}`}>
                <span className="app-access-user">@{login}</span>
                <button
                  className="btn-secondary app-access-btn"
                  onClick={() => handleRevoke(login)}
                >
                  해제
                </button>
              </div>
            ))}
            {access.pending.length === 0 && access.approved.length === 0 && (
              <div className="app-update-message">
                외부 사용자가 GitHub로 로그인하면 여기에 승인 요청이 표시됩니다.
              </div>
            )}
          </div>
        </div>
        )}

        {tab === "vcs" && (
        <div className="app-settings-section">
          <div className="field-label">External diff program</div>
          <div className="app-about-card">
            <div className="app-update-message">
              Source Control에서 텍스트 파일을 더블클릭하거나 diff 아이콘(⇄)·우클릭 메뉴를 누르면 이
              프로그램에 비교할 파일 두 개(변경 전 · 작업 트리)를 인자로 넘겨 실행합니다. HTML과 이미지,
              바이너리 파일의 더블클릭은 기존처럼 문서 뷰어로 엽니다.
            </div>
            <label className="field app-remote-field">
              <span className="field-label">Diff program</span>
              <div className="folder-row">
                <input
                  value={diffTool}
                  placeholder={`예: "C:\\Program Files\\Beyond Compare 4\\BComp.exe"`}
                  onChange={(e) => setDiffTool(e.target.value)}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="browse-btn"
                  onClick={handlePickDiffProgram}
                >
                  Browse...
                </button>
              </div>
            </label>
            <div className="app-update-message">
              프로그램만 지정하면 <code>프로그램 "변경전" "작업트리"</code> 형태로 실행됩니다. 인자 순서를
              직접 정하려면 <code>$LOCAL</code>(변경 전)·<code>$REMOTE</code>(작업 트리)를 쓰세요.
              예 · Beyond Compare: <code>BComp.exe</code> · WinMerge: <code>WinMergeU.exe</code> ·
              VS Code(플래그 필요): <code>code --wait --diff "$LOCAL" "$REMOTE"</code>
            </div>
            <div className="app-update-actions">
              <button className="btn-secondary app-update-btn" onClick={handleSaveDiffTool}>
                {diffToolSaved ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>
        )}

        {tab === "ssh" && (
        <div className="app-settings-section app-ssh-tab">
          <div className="app-ssh-intro-row">
            <div className="app-update-message">
              새 프로젝트의 "Run on remote host"에서 선택. 인증은 시스템 ssh-agent/키에 위임(비밀번호 미저장).
            </div>
            <button
              className="btn-secondary app-ssh-guide-btn"
              onClick={() => setSshGuideOpen(true)}
            >
              사용 방법
            </button>
          </div>

          <div className="app-ssh-list">
            {sshHosts.map((h) => (
              <div key={h.id} className="app-ssh-row">
                <div className="app-ssh-row-main">
                  <span className="app-ssh-row-label">{h.label}</span>
                  <span className="app-ssh-row-target">
                    {h.user}@{h.host}
                    {h.port && h.port !== 22 ? `:${h.port}` : ""}
                  </span>
                </div>
                <div className="app-ssh-row-actions">
                  <button className="btn-secondary" onClick={() => handleSshEdit(h)}>
                    Edit
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleSshDelete(h.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {sshHosts.length === 0 && (
              <div className="app-update-message">아직 등록된 호스트가 없습니다.</div>
            )}
          </div>

          <div className="field-label app-ssh-form-title">
            {sshDraft.id ? "Edit host" : "Add host"}
          </div>
          <div className="folder-row">
            <label className="field" style={{ flex: 3 }}>
              <span className="field-label">Label</span>
              <input
                value={sshDraft.label}
                onChange={(e) => handleSshDraftChange({ label: e.target.value })}
                placeholder="e.g. Lab server"
              />
            </label>
            <label className="field" style={{ flex: 2 }}>
              <span className="field-label">Remote OS</span>
              <select
                value={sshDraft.remoteOs ?? "posix"}
                onChange={(e) =>
                  handleSshDraftChange({
                    remoteOs: e.target.value as SshHost["remoteOs"],
                  })
                }
              >
                <option value="posix">Linux / macOS</option>
                <option value="windows">Windows</option>
              </select>
            </label>
          </div>
          <div className="folder-row">
            <label className="field" style={{ flex: 2 }}>
              <span className="field-label">User</span>
              <input
                value={sshDraft.user}
                onChange={(e) => handleSshDraftChange({ user: e.target.value })}
                placeholder="ubuntu"
              />
            </label>
            <label className="field" style={{ flex: 3 }}>
              <span className="field-label">Host</span>
              <input
                value={sshDraft.host}
                onChange={(e) => handleSshDraftChange({ host: e.target.value })}
                placeholder="192.168.0.10"
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Port</span>
              <input
                value={sshDraft.port ?? ""}
                onChange={(e) =>
                  handleSshDraftChange({
                    port: e.target.value
                      ? Number(e.target.value.replace(/[^0-9]/g, ""))
                      : undefined,
                  })
                }
                placeholder="22"
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Auth method</span>
            <select
              value={sshDraft.authMethod ?? "key"}
              onChange={(e) =>
                handleSshDraftChange({
                  authMethod: e.target.value as SshHost["authMethod"],
                })
              }
            >
              <option value="key">Key (recommended)</option>
              <option value="password">Password</option>
            </select>
          </label>
          {(sshDraft.remoteOs ?? "posix") === "windows" && (
            <label className="field-check field-check-neutral">
              <input
                type="checkbox"
                checked={sshDraft.preferCmdShim ?? true}
                onChange={(e) =>
                  handleSshDraftChange({ preferCmdShim: e.target.checked })
                }
              />
              <span>
                <span className="check-label">Use .cmd shims for npm CLIs</span>
                <span className="check-hint">
                  PowerShell execution policy can block codex.ps1/claude.ps1.
                  This starts codex.cmd/claude.cmd instead.
                </span>
              </span>
            </label>
          )}
          {(sshDraft.authMethod ?? "key") === "key" ? (
            <label className="field">
              <span className="field-label">Identity file (optional)</span>
              <div className="folder-row">
                <input
                  value={sshDraft.identityFile ?? ""}
                  onChange={(e) =>
                    handleSshDraftChange({ identityFile: e.target.value })
                  }
                  placeholder="C:\\Users\\me\\.ssh\\id_ed25519"
                />
                <button
                  type="button"
                  className="browse-btn"
                  onClick={handleSshPickIdentity}
                >
                  Browse...
                </button>
              </div>
            </label>
          ) : (
            <label className="field">
              <span className="field-label">
                Password{sshPasswordSaved ? " (저장됨 — 비워두면 유지)" : ""}
              </span>
              <div className="folder-row">
                <input
                  type="password"
                  value={sshPasswordInput}
                  onChange={(e) => setSshPasswordInput(e.target.value)}
                  placeholder={sshPasswordSaved ? "•••••••• (저장됨)" : "비밀번호"}
                />
                {sshPasswordSaved && (
                  <button
                    type="button"
                    className="browse-btn"
                    onClick={handleSshClearPassword}
                  >
                    지움
                  </button>
                )}
              </div>
              <span className="check-hint">
                로컬에만 저장되며 연결 시 자동 입력됩니다(localStorage·동기화에 포함 안 됨).
              </span>
            </label>
          )}
          <label className="field">
            <span className="field-label">Extra ssh options (optional)</span>
            <input
              value={sshDraft.extraOptions ?? ""}
              onChange={(e) =>
                handleSshDraftChange({ extraOptions: e.target.value })
              }
              placeholder="-o StrictHostKeyChecking=accept-new"
            />
          </label>

          <div className="app-sound-actions">
            <button
              className="btn-primary"
              onClick={handleSshSave}
              disabled={!sshDraft.host.trim() || !sshDraft.user.trim()}
            >
              {sshDraft.id ? "Save" : "Add"}
            </button>
            {sshDraft.id && (
              <button className="btn-secondary" onClick={handleSshReset}>
                Cancel
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={handleSshTest}
              disabled={
                sshTest.status === "testing" ||
                !sshDraft.host.trim() ||
                !sshDraft.user.trim()
              }
            >
              {sshTest.status === "testing" ? "Testing..." : "Test connection"}
            </button>
          </div>
          {(sshTest.status === "ok" || sshTest.status === "error") && (
            <div
              className="app-update-message"
              style={{
                color: sshTest.status === "ok" ? "#3fb950" : "#f85149",
              }}
            >
              {sshTest.message}
            </div>
          )}
        </div>
        )}

        {tab === "about" && (
        <>
        <div className="app-settings-section">
          <div className="field-label">Creator</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">Name</span>
              <span className="app-about-value">{CREATOR_NAME}</span>
            </div>
            <div className="app-about-row">
              <span className="app-about-label">GitHub</span>
              <button
                className="app-about-link"
                type="button"
                onClick={handleOpenGitHub}
                title={CREATOR_GITHUB}
              >
                {CREATOR_GITHUB_LABEL}
              </button>
            </div>
          </div>
        </div>

        <div className="app-settings-section">
          <div className="field-label">Update</div>
          <div className="app-about-card">
            <div className="app-about-row">
              <span className="app-about-label">Current</span>
              <span className="app-about-value">v{APP_VERSION}</span>
            </div>
            <div className="app-about-row">
              <span className="app-about-label">Channel</span>
              <span className="app-about-value">
                {buildVariant === "company"
                  ? "Company"
                  : buildVariant === "store"
                    ? "Microsoft Store"
                    : "Standard"}
              </span>
            </div>
            {updateCheck.status === "available" && (
              <div className="app-about-row">
                <span className="app-about-label">Latest</span>
                <span className="app-about-value">
                  v{formatProductVersion(updateCheck.update.version)}
                </span>
              </div>
            )}
            <div
              className={`app-update-message ${
                updateCheck.status === "error" ||
                install.status === "error" ||
                storeLaunch.status === "error"
                  ? "app-update-error"
                  : ""
              }`}
            >
              {install.status === "downloading" &&
                (install.total
                  ? `Downloading... ${formatBytes(install.downloaded)} / ${formatBytes(install.total)}`
                  : `Downloading... ${formatBytes(install.downloaded)}`)}
              {install.status === "installing" &&
                "Installing. The app will restart shortly."}
              {install.status === "error" &&
                `Update install failed: ${install.message}`}
              {updateProvider === "microsoft-store" && storeLaunch.status === "error" &&
                `Microsoft Store 열기 실패: ${storeLaunch.message}`}
              {updateProvider === "microsoft-store" && storeLaunch.status !== "error" &&
                "업데이트는 Microsoft Store에서 자동으로 관리됩니다. 새 버전을 직접 확인하려면 Store 제품 페이지를 여세요."}
              {updateProvider !== "microsoft-store" && install.status === "idle" &&
                updateCheck.status === "idle" &&
                "Click Check to see if a new release is available."}
              {updateProvider !== "microsoft-store" && install.status === "idle" &&
                updateCheck.status === "checking" &&
                "Checking for updates..."}
              {updateProvider !== "microsoft-store" && install.status === "idle" &&
                updateCheck.status === "available" &&
                "A newer release is available."}
              {updateProvider !== "microsoft-store" && install.status === "idle" &&
                updateCheck.status === "current" &&
                "You are using the latest release."}
              {updateProvider !== "microsoft-store" && install.status === "idle" &&
                updateCheck.status === "error" &&
                `Update check failed: ${updateCheck.message}`}
            </div>
            {updateProvider === "microsoft-store" && (
              <div className="app-update-actions">
                <button
                  className="btn-primary app-update-btn"
                  onClick={handleOpenStoreProduct}
                  disabled={storeLaunch.status === "opening"}
                >
                  {storeLaunch.status === "opening"
                    ? "Microsoft Store 여는 중..."
                    : "Microsoft Store에서 업데이트 확인"}
                </button>
              </div>
            )}
            {updateProvider !== "microsoft-store" && <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleCheckForUpdates}
                disabled={isBusy}
              >
                Check
              </button>
              {updateCheck.status === "available" && (
                <button
                  className="btn-primary app-update-btn"
                  onClick={() => handleInstallUpdate(updateCheck.update)}
                  disabled={isBusy}
                >
                  {install.status === "downloading"
                    ? "Downloading..."
                    : install.status === "installing"
                      ? "Installing..."
                      : "Update"}
                </button>
              )}
              <button
                className="btn-secondary app-update-btn"
                onClick={handleOpenReleases}
              >
                Releases
              </button>
            </div>}
          </div>
        </div>

        <div className="app-settings-section">
          <div className="field-label">Support diagnostics</div>
          <div className="app-about-card">
            <div
              className={`app-update-message ${
                diagnosticExport.status === "error" ? "app-update-error" : ""
              }`}
            >
              {diagnosticExport.status === "idle" &&
                "앱·터미널·Hook·업데이트 상태와 제한된 로그를 JSON으로 저장합니다. 토큰·비밀번호와 사용자 홈 경로는 자동으로 제거됩니다."}
              {diagnosticExport.status === "running" && "진단 정보를 수집하는 중입니다..."}
              {diagnosticExport.status === "cancelled" && "저장을 취소했습니다."}
              {diagnosticExport.status === "error" && diagnosticExport.message}
              {diagnosticExport.status === "done" && (
                <>
                  저장 완료 · 터미널 {diagnosticExport.terminalCount}개 · Hook {diagnosticExport.hookHealthy ? "정상" : "점검 필요"}
                  <div title={diagnosticExport.path}>{diagnosticExport.path}</div>
                </>
              )}
            </div>
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleDiagnosticExport}
                disabled={diagnosticExport.status === "running"}
              >
                {diagnosticExport.status === "running"
                  ? "수집 중..."
                  : "진단 번들 저장"}
              </button>
            </div>
          </div>
        </div>
        </>
        )}
        </div>
        </div>
      </div>
    </div>
    </>
  );
}
