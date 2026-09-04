import { useMemo, useState } from "react";
import {
  COMMAND_DEFINITIONS,
  conflictingShortcutIds,
  defaultCommandShortcuts,
  shortcutFromKeyboardEvent,
  type CommandId,
  type CommandShortcuts,
} from "../lib/commandRegistry";
import { useAppLanguage } from "../lib/appLanguage";

export function KeyboardShortcuts({
  shortcuts,
  onChange,
}: {
  shortcuts: CommandShortcuts;
  onChange: (shortcuts: CommandShortcuts) => void;
}) {
  const { language, text } = useAppLanguage();
  const [recording, setRecording] = useState<CommandId | null>(null);
  const conflicts = useMemo(() => conflictingShortcutIds(shortcuts), [shortcuts]);

  return (
    <div className="shortcut-editor">
      {COMMAND_DEFINITIONS.map((command) => (
        <div className="shortcut-row" key={command.id}>
          <span className="shortcut-copy">
            <strong>{language === "ko" ? command.title : command.titleEn}</strong>
            <small>{language === "ko" ? command.description : command.descriptionEn}</small>
          </span>
          <button
            type="button"
            className={`shortcut-recorder ${recording === command.id ? "shortcut-recording" : ""} ${conflicts.has(command.id) ? "shortcut-conflict" : ""}`}
            onClick={() => setRecording(command.id)}
            onBlur={() => setRecording(null)}
            onKeyDown={(event) => {
              if (recording !== command.id) return;
              event.preventDefault();
              event.stopPropagation();
              if (event.key === "Escape") {
                setRecording(null);
                return;
              }
              if (event.key === "Backspace" || event.key === "Delete") {
                onChange({ ...shortcuts, [command.id]: "" });
                setRecording(null);
                return;
              }
              const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
              if (!shortcut || (!event.ctrlKey && !event.altKey && !event.metaKey)) return;
              onChange({ ...shortcuts, [command.id]: shortcut });
              setRecording(null);
            }}
          >
            {recording === command.id
              ? text("키를 누르세요", "Press keys")
              : shortcuts[command.id] || text("지정 안 함", "Not assigned")}
          </button>
        </div>
      ))}
      {conflicts.size > 0 && (
        <div className="shortcut-warning">{text("같은 단축키가 중복되었습니다. 먼저 등록된 명령이 실행됩니다.", "The same shortcut is assigned more than once. The first registered command will run.")}</div>
      )}
      <div className="app-update-actions">
        <button className="btn-secondary app-update-btn" onClick={() => onChange(defaultCommandShortcuts())}>
          {text("기본값 복원", "Restore defaults")}
        </button>
      </div>
    </div>
  );
}
