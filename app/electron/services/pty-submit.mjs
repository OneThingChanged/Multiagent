const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

export const PTY_SUBMIT_DELAY_MS = 80;

export function preparePtySubmission(message) {
  const value = String(message ?? "");
  if (!/[\r\n]/.test(value)) return value;
  const normalized = value.replace(/\r\n|\r|\n/g, "\r");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}`;
}

export async function submitPtyMessage({
  ptyProcess,
  message,
  isCurrent = () => true,
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
}) {
  const value = String(message ?? "");
  if (!ptyProcess || !value.trim()) return false;
  try {
    // A terminal paste is one ordered input event. The explicit closing marker
    // lets Codex/Claude finish a multiline paste before the discrete Enter.
    ptyProcess.write(preparePtySubmission(value));
    await wait(PTY_SUBMIT_DELAY_MS);
    if (!isCurrent()) return false;
    ptyProcess.write("\r");
    return true;
  } catch {
    return false;
  }
}
