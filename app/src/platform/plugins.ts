import { open as tauriOpenDialog } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted as tauriIsPermissionGranted,
  requestPermission as tauriRequestPermission,
} from "@tauri-apps/plugin-notification";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import { relaunch as tauriRelaunch } from "@tauri-apps/plugin-process";
import { check as tauriCheck } from "@tauri-apps/plugin-updater";
import { electronBridge } from "./electronBridge";
import { listen } from "./runtime";

export type UpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data: Record<string, never> };

export type Update = {
  version: string;
  downloadAndInstall(
    listener?: (event: UpdateDownloadEvent) => void
  ): Promise<void>;
};

export async function openDialog(options: {
  directory?: boolean;
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | string[] | null> {
  const bridge = electronBridge();
  if (bridge) return bridge.showOpenDialog(options);
  return tauriOpenDialog(options);
}

export async function openUrl(url: string) {
  const bridge = electronBridge();
  if (bridge) {
    await bridge.invoke("open_external_url", { url });
    return;
  }
  await tauriOpenUrl(url);
}

export async function writeClipboardText(text: string) {
  const bridge = electronBridge();
  if (bridge) {
    await bridge.invoke("clipboard_write_text", { text });
    return;
  }
  await navigator.clipboard.writeText(text);
}

export async function isPermissionGranted() {
  if (electronBridge()) return true;
  return tauriIsPermissionGranted();
}

export async function requestPermission() {
  if (electronBridge()) return "granted" as const;
  return tauriRequestPermission();
}

export async function check(): Promise<Update | null> {
  const bridge = electronBridge();
  if (bridge) {
    const info = await bridge.invoke<{ version: string } | null>("check_for_update");
    if (!info) return null;
    return {
      version: info.version,
      async downloadAndInstall(listener) {
        const unlisten = listener
          ? await listen<UpdateDownloadEvent>("update:progress", (event) =>
              listener(event.payload)
            )
          : null;
        try {
          await bridge.invoke("download_and_install_update");
        } finally {
          unlisten?.();
        }
      },
    };
  }
  return (await tauriCheck()) as Update | null;
}

export async function relaunch() {
  const bridge = electronBridge();
  if (bridge) {
    await bridge.invoke("relaunch");
    return;
  }
  await tauriRelaunch();
}
