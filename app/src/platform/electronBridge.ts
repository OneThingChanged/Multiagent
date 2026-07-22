import type {
  RuntimeCommand,
  RuntimeCommandArgs,
  RuntimeCommandResult,
  RuntimeEmittedEventName,
  RuntimeEventName,
  TypedRuntimeCommand,
} from "./ipcContract";

export type ElectronBridge = {
  invoke<C extends TypedRuntimeCommand>(
    command: C,
    args: RuntimeCommandArgs<C>
  ): Promise<RuntimeCommandResult<C>>;
  invoke<T>(command: RuntimeCommand, args?: Record<string, unknown>): Promise<T>;
  onEvent<T>(eventName: RuntimeEventName, listener: (payload: T) => void): () => void;
  emit(eventName: RuntimeEmittedEventName, payload?: unknown): Promise<void>;
  getPathForFile(file: File): string;
  showOpenDialog(options: {
    directory?: boolean;
    multiple?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | string[] | null>;
  window: {
    setAlwaysOnTop(enabled: boolean): Promise<void>;
    isFocused(): Promise<boolean>;
    requestUserAttention(critical: boolean): Promise<void>;
  };
};

declare global {
  interface Window {
    multiAgentElectron?: ElectronBridge;
  }
}

export function electronBridge() {
  return window.multiAgentElectron;
}

export function isElectronRuntime() {
  return electronBridge() !== undefined;
}
