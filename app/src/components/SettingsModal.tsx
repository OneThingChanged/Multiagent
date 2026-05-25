import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { APP_THEMES } from "../lib/appTheme";
import type { AppThemeId } from "../lib/appTheme";
import {
  APP_VERSION,
  LATEST_RELEASE_API_URL,
  RELEASES_URL,
  isNewerVersion,
} from "../lib/appInfo";

const CREATOR_NAME = "OneThingChanged";
const CREATOR_GITHUB = "https://github.com/OneThingChanged";
const CREATOR_GITHUB_LABEL = "@OneThingChanged";

type ReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type LatestRelease = {
  tag_name?: string;
  html_url?: string;
  name?: string;
  assets?: ReleaseAsset[];
};

type SetupAsset = { name: string; url: string };

type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current"; latestVersion: string; latestUrl: string }
  | {
      status: "available";
      latestVersion: string;
      latestUrl: string;
      setup?: SetupAsset;
    }
  | { status: "ahead"; latestVersion: string; latestUrl: string }
  | { status: "error"; message: string };

type InstallState =
  | { status: "idle" }
  | { status: "downloading" }
  | { status: "installing" }
  | { status: "error"; message: string };

function pickSetupAsset(assets: ReleaseAsset[] | undefined): SetupAsset | undefined {
  if (!assets) return undefined;
  const nsis = assets.find(
    (a) =>
      a.browser_download_url &&
      a.name &&
      /x64-setup\.exe$/i.test(a.name)
  );
  if (nsis && nsis.name && nsis.browser_download_url) {
    return { name: nsis.name, url: nsis.browser_download_url };
  }
  return undefined;
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

  const handleOpenGitHub = () => {
    openUrl(CREATOR_GITHUB).catch((error) => {
      console.error("Failed to open creator GitHub", error);
    });
  };

  const handleOpenReleases = (url = RELEASES_URL) => {
    openUrl(url).catch((error) => {
      console.error("Failed to open release page", error);
    });
  };

  const handleInstallUpdate = async (setup: SetupAsset) => {
    setInstall({ status: "downloading" });
    try {
      const path = await invoke<string>("download_installer", {
        url: setup.url,
        fileName: setup.name,
      });
      setInstall({ status: "installing" });
      await invoke("run_installer_and_quit", { path });
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

  const handleCheckForUpdates = async () => {
    setUpdateCheck({ status: "checking" });
    try {
      const response = await fetch(LATEST_RELEASE_API_URL, {
        headers: { Accept: "application/vnd.github+json" },
      });

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }

      const latest = (await response.json()) as LatestRelease;
      const latestVersion = latest.tag_name ?? latest.name ?? "";
      const latestUrl = latest.html_url ?? RELEASES_URL;
      if (!latestVersion) {
        throw new Error("Latest release version is missing");
      }

      if (isNewerVersion(latestVersion, APP_VERSION)) {
        const setup = pickSetupAsset(latest.assets);
        setUpdateCheck({
          status: "available",
          latestVersion,
          latestUrl,
          setup,
        });
      } else if (isNewerVersion(APP_VERSION, latestVersion)) {
        setUpdateCheck({ status: "ahead", latestVersion, latestUrl });
      } else {
        setUpdateCheck({ status: "current", latestVersion, latestUrl });
      }
    } catch (error) {
      setUpdateCheck({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to check for updates",
      });
    }
  };

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
            {updateCheck.status !== "idle" &&
              updateCheck.status !== "checking" &&
              updateCheck.status !== "error" && (
                <div className="app-about-row">
                  <span className="app-about-label">Latest</span>
                  <span className="app-about-value">
                    {updateCheck.latestVersion}
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
              {install.status === "downloading" && "Downloading installer..."}
              {install.status === "installing" &&
                "Launching installer. The app will close."}
              {install.status === "error" &&
                `Update install failed: ${install.message}`}
              {install.status === "idle" &&
                updateCheck.status === "idle" &&
                "Check GitHub Releases manually."}
              {install.status === "idle" &&
                updateCheck.status === "checking" &&
                "Checking releases..."}
              {install.status === "idle" &&
                updateCheck.status === "available" &&
                (updateCheck.setup
                  ? "A newer release is available."
                  : "A newer release is available, but no installer asset was found.")}
              {install.status === "idle" &&
                updateCheck.status === "current" &&
                "You are using the latest release."}
              {install.status === "idle" &&
                updateCheck.status === "ahead" &&
                "This build is newer than the latest release."}
              {install.status === "idle" &&
                updateCheck.status === "error" &&
                `Update check failed: ${updateCheck.message}`}
            </div>
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleCheckForUpdates}
                disabled={
                  updateCheck.status === "checking" ||
                  install.status === "downloading" ||
                  install.status === "installing"
                }
              >
                Check
              </button>
              {updateCheck.status === "available" && updateCheck.setup && (
                <button
                  className="btn-primary app-update-btn"
                  onClick={() =>
                    updateCheck.setup &&
                    handleInstallUpdate(updateCheck.setup)
                  }
                  disabled={
                    install.status === "downloading" ||
                    install.status === "installing"
                  }
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
                onClick={() =>
                  handleOpenReleases(
                    updateCheck.status === "available" ||
                      updateCheck.status === "current" ||
                      updateCheck.status === "ahead"
                      ? updateCheck.latestUrl
                      : RELEASES_URL
                  )
                }
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
