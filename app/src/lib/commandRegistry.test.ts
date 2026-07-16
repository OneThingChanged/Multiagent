import { describe, expect, it } from "vitest";
import {
  commandForKeyboardEvent,
  conflictingShortcutIds,
  defaultCommandShortcuts,
  normalizeShortcut,
  shortcutFromKeyboardEvent,
} from "./commandRegistry";

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
});
