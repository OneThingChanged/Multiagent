export function createTerminalHandlers({
  terminalSessions,
  spawnPty,
  confirmClose,
}) {
  const handlers = new Map([
    ["spawn_pty", (event, args) => spawnPty(args, event)],
    ["attach_terminal", (event, args) =>
      terminalSessions.attach(args.id, event.sender.id, args.afterSequence)],
    ["detach_terminal", (event, args) => {
      terminalSessions.detach(args.id, event.sender.id);
      return null;
    }],
    ["terminal_session_action", (_event, args) =>
      terminalSessions.action(args.id, args.action)],
    ["write_pty", (_event, args) => {
      terminalSessions.write(args.id, args.data);
      return null;
    }],
    ["resize_pty", (_event, args) => {
      terminalSessions.resize(args.id, args.cols, args.rows);
      return null;
    }],
    // Compatibility for the Tauri-era renderer and Electron smoke scripts.
    ["kill_pty", (_event, args) => {
      terminalSessions.close(args.id, "close");
      return null;
    }],
    ["confirm_close", () => {
      return confirmClose();
    }],
  ]);

  return {
    has(command) {
      return handlers.has(command);
    },
    invoke(event, command, args) {
      const handler = handlers.get(command);
      if (!handler) throw new Error(`지원하지 않는 터미널 command: ${command}`);
      return handler(event, args);
    },
  };
}
