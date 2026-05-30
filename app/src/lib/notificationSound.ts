import { invoke } from "@tauri-apps/api/core";

const LS_KEY = "multiagent.notificationSound.v1";

export type NotificationSoundMode = "system" | "custom" | "off";

export type NotificationSoundConfig = {
  mode: NotificationSoundMode;
  customPath?: string;
};

const DEFAULT_CONFIG: NotificationSoundConfig = { mode: "system" };

let cachedCustomUrl: { path: string; url: string } | null = null;

export function loadNotificationSound(): NotificationSoundConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as NotificationSoundConfig;
    if (
      parsed.mode === "system" ||
      parsed.mode === "custom" ||
      parsed.mode === "off"
    ) {
      return parsed;
    }
  } catch {}
  return DEFAULT_CONFIG;
}

export function saveNotificationSound(config: NotificationSoundConfig) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {}
  if (cachedCustomUrl && cachedCustomUrl.path !== config.customPath) {
    URL.revokeObjectURL(cachedCustomUrl.url);
    cachedCustomUrl = null;
  }
}

async function getCustomObjectUrl(path: string): Promise<string> {
  if (cachedCustomUrl && cachedCustomUrl.path === path) {
    return cachedCustomUrl.url;
  }
  if (cachedCustomUrl) {
    URL.revokeObjectURL(cachedCustomUrl.url);
    cachedCustomUrl = null;
  }
  const bytes = await invoke<number[]>("read_audio_file", { path });
  const blob = new Blob([new Uint8Array(bytes)]);
  const url = URL.createObjectURL(blob);
  cachedCustomUrl = { path, url };
  return url;
}

export async function playNotificationSound(
  config: NotificationSoundConfig = loadNotificationSound()
) {
  if (config.mode === "off") return;
  if (config.mode === "system") {
    try {
      await invoke("play_system_sound");
    } catch (err) {
      console.error("system sound failed", err);
    }
    return;
  }
  if (config.mode === "custom" && config.customPath) {
    try {
      const url = await getCustomObjectUrl(config.customPath);
      const audio = new Audio(url);
      await audio.play();
    } catch (err) {
      console.error("custom sound failed", err);
      try {
        await invoke("play_system_sound");
      } catch {}
    }
  }
}
