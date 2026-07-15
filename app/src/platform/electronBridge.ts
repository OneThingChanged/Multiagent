export type ElectronBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  onEvent<T>(eventName: string, listener: (payload: T) => void): () => void;
  emit(eventName: string, payload?: unknown): Promise<void>;
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
