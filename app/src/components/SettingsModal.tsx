import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { APP_THEMES } from "../lib/appTheme";
import type { AppThemeId } from "../lib/appTheme";
import {
  APP_VERSION,
  BUILD_VARIANT,
  IS_COMPANY_BUILD,
  RELEASES_URL,
} from "../lib/appInfo";
import {
  loadNotificationSound,
  saveNotificationSound,
  playNotificationSound,
  type NotificationSoundConfig,
  type NotificationSoundMode,
} from "../lib/notificationSound";
import { loadSshHosts, saveSshHosts } from "../lib/sshHosts";
import { SshSetupGuide } from "./SshSetupGuide";
import type { SshHost } from "../types";

const SOUND_MODES: { id: NotificationSoundMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "custom", label: "Custom" },
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

type SettingsTab = "general" | "dashboard" | "remote" | "ssh" | "about";

const ALL_SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "dashboard", label: "Dashboard" },
  { id: "remote", label: "Remote" },
  { id: "ssh", label: "SSH Hosts" },
  { id: "about", label: "About" },
];
const SETTINGS_TABS = ALL_SETTINGS_TABS.filter(
  (tab) => !IS_COMPANY_BUILD || tab.id !== "remote"
);

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
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsModal({
  theme,
  onThemeChange,
  onClose,
}: {
  theme: AppThemeId;
  onThemeChange: (theme: AppThemeId) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({
    status: "idle",
  });
  const [install, setInstall] = useState<InstallState>({ status: "idle" });
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
    navigator.clipboard
      .writeText(tunnel.publicUrl)
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
    navigator.clipboard
      .writeText(remote.url)
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
    navigator.clipboard
      .writeText(monitor.url)
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
        <div className="app-settings-header">
          <h2 id="app-settings-title" className="modal-title">
            Settings
          </h2>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="app-settings-tabs">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              className={`app-settings-tab ${
                tab === t.id ? "app-settings-tab-active" : ""
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
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
          <div className="app-sound-actions">
            <button
              className="btn-secondary app-sound-test-btn"
              onClick={handleTestSound}
              disabled={sound.mode === "custom" && !sound.customPath}
            >
              Test
            </button>
          </div>
        </div>
        </>
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
          <div className="field-label">Remote access</div>
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
                ? "같은 네트워크의 폰/PC 브라우저에서 위 URL로 접속하세요. 외부에서 접속하려면 Tailscale 같은 VPN을 권장합니다."
                : "원격 모니터링/입력 서버를 켭니다. 같은 Wi-Fi의 브라우저에서 세션을 보고 명령을 보낼 수 있습니다."}
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
                    ? "외부 어디서든 위 HTTPS 주소로 접속할 수 있습니다. 주소는 터널을 새로 켤 때마다 바뀝니다."
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
              https://호스트네임/auth/callback), 비우면 Device Flow를 사용합니다.
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
                {BUILD_VARIANT === "company" ? "Company" : "Standard"}
              </span>
            </div>
            {updateCheck.status === "available" && (
              <div className="app-about-row">
                <span className="app-about-label">Latest</span>
                <span className="app-about-value">
                  v{updateCheck.update.version}
                </span>
              </div>
            )}
            <div
              className={`app-update-message ${
                updateCheck.status === "error" ||
                install.status === "error"
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
              {install.status === "idle" &&
                updateCheck.status === "idle" &&
                "Click Check to see if a new release is available."}
              {install.status === "idle" &&
                updateCheck.status === "checking" &&
                "Checking for updates..."}
              {install.status === "idle" &&
                updateCheck.status === "available" &&
                "A newer release is available."}
              {install.status === "idle" &&
                updateCheck.status === "current" &&
                "You are using the latest release."}
              {install.status === "idle" &&
                updateCheck.status === "error" &&
                `Update check failed: ${updateCheck.message}`}
            </div>
            <div className="app-update-actions">
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
            </div>
          </div>
        </div>
        </>
        )}
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
