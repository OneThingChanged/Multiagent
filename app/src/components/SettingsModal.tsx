import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
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

type LatestRelease = {
  tag_name?: string;
  html_url?: string;
  name?: string;
};

type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current"; latestVersion: string; latestUrl: string }
  | { status: "available"; latestVersion: string; latestUrl: string }
  | { status: "ahead"; latestVersion: string; latestUrl: string }
  | { status: "error"; message: string };

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
        setUpdateCheck({ status: "available", latestVersion, latestUrl });
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
                updateCheck.status === "error" ? "app-update-error" : ""
              }`}
            >
              {updateCheck.status === "idle" &&
                "Check GitHub Releases manually."}
              {updateCheck.status === "checking" && "Checking releases..."}
              {updateCheck.status === "available" &&
                "A newer release is available."}
              {updateCheck.status === "current" &&
                "You are using the latest release."}
              {updateCheck.status === "ahead" &&
                "This build is newer than the latest release."}
              {updateCheck.status === "error" &&
                `Update check failed: ${updateCheck.message}`}
            </div>
            <div className="app-update-actions">
              <button
                className="btn-secondary app-update-btn"
                onClick={handleCheckForUpdates}
                disabled={updateCheck.status === "checking"}
              >
                Check
              </button>
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
