import { electronBridge } from "./electronBridge";
import type {
  RuntimeCommand,
  RuntimeCommandArgs,
  RuntimeCommandResult,
  RuntimeEmittedEventName,
  RuntimeEventName,
  TypedRuntimeCommand,
} from "./ipcContract";

export enum UserAttentionType {
  Critical = 1,
  Informational = 2,
}

export type RuntimeEvent<T> = { payload: T };
export type RuntimeUnlisten = () => void;

export function invoke<C extends TypedRuntimeCommand>(
  command: C,
  args: RuntimeCommandArgs<C>
): Promise<RuntimeCommandResult<C>>;
export function invoke<T = unknown>(
  command: RuntimeCommand,
  args?: Record<string, unknown>
): Promise<T>;
export async function invoke<T = unknown>(
  command: RuntimeCommand,
  args?: Record<string, unknown>
): Promise<T> {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
  return bridge.invoke<T>(command, args);
}

export async function listen<T>(
  eventName: RuntimeEventName,
  listener: (event: RuntimeEvent<T>) => void
): Promise<RuntimeUnlisten> {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
  return bridge.onEvent<T>(eventName, (payload) => listener({ payload }));
}

export async function emit(
  eventName: RuntimeEmittedEventName,
  payload?: unknown
): Promise<void> {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
  return bridge.emit(eventName, payload);
}

export function getCurrentWindow() {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");
  return {
    setAlwaysOnTop: (enabled: boolean) => bridge.window.setAlwaysOnTop(enabled),
    isFocused: () => bridge.window.isFocused(),
    requestUserAttention: (attention: UserAttentionType | null) =>
      bridge.window.requestUserAttention(
        attention === UserAttentionType.Critical
      ),
  };
}

type DragDropPayload = {
  type: "drop";
  paths: string[];
  position: { x: number; y: number };
};

export function getCurrentWebview() {
  const bridge = electronBridge();
  if (!bridge) throw new Error("Electron bridge is unavailable");

  return {
    async onDragDropEvent(
      listener: (event: RuntimeEvent<DragDropPayload>) => void
    ): Promise<RuntimeUnlisten> {
      const prevent = (event: DragEvent) => event.preventDefault();
      const drop = (event: DragEvent) => {
        event.preventDefault();
        const paths = Array.from(event.dataTransfer?.files ?? [])
          .map((file) => bridge.getPathForFile(file))
          .filter(Boolean);
        if (paths.length === 0) return;
        const scale = window.devicePixelRatio || 1;
        listener({
          payload: {
            type: "drop",
            paths,
            position: {
              x: event.clientX * scale,
              y: event.clientY * scale,
            },
          },
        });
      };
      document.addEventListener("dragover", prevent);
      document.addEventListener("drop", drop);
      return () => {
        document.removeEventListener("dragover", prevent);
        document.removeEventListener("drop", drop);
      };
    },
  };
}
