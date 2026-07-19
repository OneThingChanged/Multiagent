// Flatten a raw PTY byte stream (ANSI colors, cursor moves, and the animated
// status bar / "Working…" spinner that agents redraw in place) into a readable
// plain transcript for the dashboards / Remote PWA, which render output as text.
//
// This is a compact terminal replay — NOT a full VT emulator, but enough of a
// 2D row model that in-place repaints OVERWRITE instead of pile up. The old
// single-line pass ignored vertical cursor motion, so tools like Claude Code
// and Codex — which move the cursor UP to their bottom status box, erase it,
// and reprint it several times a second — flooded the log with duplicate
// status bars. Here we honor relative cursor motion (CUU/CUD/CUF/CUB), line
// erase (EL), display erase (ED), and save/restore, so those repaints land on
// the same rows and collapse to a single final frame.

const ESC = "\x1b";
const BEL = "\x07";

export function sanitizeTerminalOutput(raw) {
  if (!raw) return "";
  const text = String(raw);

  const rows = [""];
  let row = 0;
  let col = 0;
  let savedRow = 0;
  let savedCol = 0;
  // Row that terminal-absolute addressing (CUP/VPA/ED2) treats as "line 1".
  // Advances past existing transcript on a full clear so a mid-stream ESC[2J
  // starts a fresh region instead of erasing everything captured so far.
  let screenTop = 0;

  const ensureRow = (r) => {
    while (rows.length <= r) rows.push("");
  };
  const putChar = (ch) => {
    ensureRow(row);
    let s = rows[row];
    if (s.length < col) s = s.padEnd(col, " ");
    rows[row] = s.slice(0, col) + ch + s.slice(col + 1);
    col += 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === ESC) {
      const next = text[i + 1];
      if (next === "[") {
        // CSI: ESC [ params intermediates final-byte
        let j = i + 2;
        while (j < text.length && text[j] >= "0" && text[j] <= "?") j += 1;
        while (j < text.length && text[j] >= " " && text[j] <= "/") j += 1;
        const final = text[j];
        const paramText = text.slice(i + 2, j);
        const parts = paramText.split(";");
        const n = Math.max(1, parseInt(parts[0], 10) || 0) || 1;
        const first = parts[0] === "" ? 0 : parseInt(parts[0], 10) || 0;

        switch (final) {
          case "A": // CUU — cursor up
            row = Math.max(0, row - n);
            break;
          case "B": // CUD — cursor down
            row += n;
            ensureRow(row);
            break;
          case "C": // CUF — cursor forward
            col += n;
            break;
          case "D": // CUB — cursor back
            col = Math.max(0, col - n);
            break;
          case "E": // CNL — next line
            row += n;
            col = 0;
            ensureRow(row);
            break;
          case "F": // CPL — previous line
            row = Math.max(0, row - n);
            col = 0;
            break;
          case "G": // CHA — absolute column
            col = Math.max(0, (first || 1) - 1);
            break;
          case "d": { // VPA — absolute row
            row = screenTop + Math.max(0, (first || 1) - 1);
            ensureRow(row);
            break;
          }
          case "H": // CUP — cursor position
          case "f": {
            const r = parts.length > 0 && parts[0] !== "" ? parseInt(parts[0], 10) || 1 : 1;
            const c = parts.length > 1 && parts[1] !== "" ? parseInt(parts[1], 10) || 1 : 1;
            row = screenTop + Math.max(0, r - 1);
            col = Math.max(0, c - 1);
            ensureRow(row);
            break;
          }
          case "J": { // ED — erase in display
            if (first === 2 || first === 3) {
              // Clear the whole visible screen and start a fresh region below
              // whatever transcript we've already gathered.
              screenTop = rows.length;
              rows.push("");
              row = screenTop;
              col = 0;
            } else if (first === 1) {
              // start of screen → cursor
              for (let r = screenTop; r < row; r += 1) rows[r] = "";
              rows[row] = " ".repeat(col) + rows[row].slice(col);
            } else {
              // cursor → end of screen
              rows[row] = rows[row].slice(0, col);
              rows.length = row + 1;
            }
            break;
          }
          case "K": { // EL — erase in line
            ensureRow(row);
            if (first === 1) rows[row] = " ".repeat(col) + rows[row].slice(col);
            else if (first === 2) rows[row] = "";
            else rows[row] = rows[row].slice(0, col);
            break;
          }
          case "s": // SCP — save cursor
            savedRow = row;
            savedCol = col;
            break;
          case "u": // RCP — restore cursor
            row = savedRow;
            col = savedCol;
            ensureRow(row);
            break;
          default:
            break; // SGR colors, private-mode set/reset, etc. — dropped
        }
        i = j;
      } else if (next === "]") {
        // OSC: skip to BEL or ST (ESC \)
        let j = i + 2;
        while (j < text.length && text[j] !== BEL) {
          if (text[j] === ESC && text[j + 1] === "\\") {
            j += 1;
            break;
          }
          j += 1;
        }
        i = j;
      } else if (next === "7") { // DECSC — save cursor
        savedRow = row;
        savedCol = col;
        i += 1;
      } else if (next === "8") { // DECRC — restore cursor
        row = savedRow;
        col = savedCol;
        ensureRow(row);
        i += 1;
      } else if (next === "M") { // RI — reverse index
        row = Math.max(0, row - 1);
        i += 1;
      } else {
        // other two-byte escape (charset select, keypad, …): skip one byte
        i += 1;
      }
      continue;
    }

    if (ch === "\n") {
      row += 1;
      col = 0;
      ensureRow(row);
    } else if (ch === "\r") {
      col = 0;
    } else if (ch === "\b") {
      col = Math.max(0, col - 1);
    } else if (ch === "\t") {
      col += 8 - (col % 8);
    } else if (ch >= " ") {
      putChar(ch);
    }
    // other C0 control chars are dropped
  }

  return rows
    .map((entry) => entry.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}
