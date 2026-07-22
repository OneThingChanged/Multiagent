import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LS_COMMAND_SHORTCUTS,
  commandForKeyboardEvent,
  conflictingShortcutIds,
  defaultCommandShortcuts,
  loadCommandShortcuts,
  normalizeShortcut,
  shortcutFromKeyboardEvent,
} from "./commandRegistry";

afterEach(() => vi.unstubAllGlobals());

describe("command registry", () => {
  it("normalizes and matches keyboard shortcuts", () => {
    expect(normalizeShortcut("shift+ctrl+k")).toBe("Ctrl+Shift+K");
    expect(shortcutFromKeyboardEvent({
      ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: ",",
    })).toBe("Ctrl+Comma");
    expect(commandForKeyboardEvent({
      ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "k",
    }, defaultCommandShortcuts())).toBe("quick-open");
  });

  it("reports conflicting user bindings", () => {
    const shortcuts = defaultCommandShortcuts();
    shortcuts["attention-center"] = shortcuts["quick-open"];
    expect(conflictingShortcutIds(shortcuts)).toEqual(
      new Set(["quick-open", "attention-center"])
    );
  });

  it("uses Ctrl+Shift+T to reopen a closed tab", () => {
    const shortcuts = defaultCommandShortcuts();
    expect(shortcuts["reopen-closed-tab"]).toBe("Ctrl+Shift+T");
    expect(shortcuts["new-project"]).toBe("Ctrl+Shift+P");
  });

  it("migrates the previous new-project default without creating a conflict", () => {
    const stored = JSON.stringify({ "new-project": "Ctrl+Shift+T" });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === LS_COMMAND_SHORTCUTS ? stored : null,
    });

    const shortcuts = loadCommandShortcuts();
    expect(shortcuts["new-project"]).toBe("Ctrl+Shift+P");
    expect(shortcuts["reopen-closed-tab"]).toBe("Ctrl+Shift+T");
    expect(conflictingShortcutIds(shortcuts)).toEqual(new Set());
  });
});
