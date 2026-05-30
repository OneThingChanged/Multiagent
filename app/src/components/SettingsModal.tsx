import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { APP_THEMES } from "../lib/appTheme";
import type { AppThemeId } from "../lib/appTheme";
import { APP_VERSION, RELEASES_URL } from "../lib/appInfo";
import {
  loadNotificationSound,
  saveNotificationSound,
  playNotificationSound,
  type NotificationSoundConfig,
  type NotificationSoundMode,
} from "../lib/notificationSound";

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
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({
    status: "idle",
  });
  const [install, setInstall] = useState<InstallState>({ status: "idle" });
  const [sound, setSound] = useState<NotificationSoundConfig>(() =>
    loadNotificationSound()
  );

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

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
