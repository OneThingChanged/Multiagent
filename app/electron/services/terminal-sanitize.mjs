// Flatten a raw PTY byte stream (ANSI colors, cursor moves, and the animated
// "Working…" spinner that rewrites one line with \r + erase-line) into a
// readable plain transcript for the dashboards / Remote PWA, which render
// output as text.
//
// This is NOT a full grid emulator, but a single pass that: drops escape
// sequences, honors carriage-return / backspace / tab line discipline, and —
// crucially — acts on the erase-in-line CSI (ESC [ K) so an in-place spinner
// collapses cleanly to its final frame instead of leaving trailing junk.
// Alt-screen TUIs that cursor-address a 2D grid won't reconstruct perfectly,
// but the result is legible instead of fragmented into single characters.

const ESC = "\x1b";
const BEL = "\x07";

export function sanitizeTerminalOutput(raw) {
  if (!raw) return "";
  const text = String(raw);
  const lines = [];
  let line = "";
  let col = 0;

  const put = (ch) => {
    line = line.slice(0, col) + ch + line.slice(col + 1);
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
        const params = text.slice(i + 2, j);
        if (final === "K") {
          // erase in line: 0/none = cursor→end, 1 = start→cursor, 2 = whole
          if (params === "1") line = " ".repeat(col) + line.slice(col);
          else if (params === "2") line = "";
          else line = line.slice(0, col);
        }
        // all other CSI (color, cursor move, erase-display, …) are dropped
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
      } else {
        // two-byte escape (charset select, keypad, ESC M, …): skip one byte
        i += 1;
      }
      continue;
    }

    if (ch === "\n") {
      lines.push(line);
      line = "";
      col = 0;
    } else if (ch === "\r") {
      col = 0;
    } else if (ch === "\b") {
      col = Math.max(0, col - 1);
    } else if (ch === "\t") {
      const stop = col + (4 - (col % 4));
      while (col < stop) put(" ");
    } else if (ch >= " ") {
      put(ch);
    }
    // other C0 control chars are dropped
  }
  lines.push(line);

  return lines
    .map((entry) => entry.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
}
