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
  if (!bridge) throw new Error("Electron bridge is unavailable");
  return bridge.showOpenDialog(options);
}

export async function openUrl(url: string) {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
  await bridge.invoke("open_external_url", { url });
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
  return Boolean(electronBridge());
}

export async function requestPermission() {
  return electronBridge() ? "granted" as const : "denied" as const;
}

export async function check(): Promise<Update | null> {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
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

export async function relaunch() {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
  await bridge.invoke("relaunch");
}
