import { Terminal } from "@xterm/xterm/lib/xterm.mjs";

const ESC = "\u001b";
const ERASE_VIEWPORT = `${ESC}[2J`;
const ERASE_SCROLLBACK = `${ESC}[3J`;
const SYNC_OUTPUT_START = `${ESC}[?2026h`;
const SYNC_OUTPUT_END = `${ESC}[?2026l`;
const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 120;
const SHADOW_SCROLLBACK = 5000;

function asDimension(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.trunc(parsed))
    : fallback;
}

function createShadowTerminal(cols, rows) {
  return new Terminal({
    cols,
    rows,
    scrollback: SHADOW_SCROLLBACK,
    allowProposedApi: true,
  });
}

function writeShadowSync(terminal, data) {
  if (!data) return;
  const writeSync = terminal?._core?.writeSync;
  if (typeof writeSync !== "function") {
    throw new Error(
      "현재 @xterm/xterm 버전은 Codex scrollback shadow 동기 쓰기를 지원하지 않습니다.",
    );
  }
  writeSync.call(terminal._core, data);
}

function isStringTerminator(input, index) {
  return input[index] === ESC && input[index + 1] === "\\";
}

function readEscapeSequence(input, index) {
  if (input[index] !== ESC) return null;
  if (index + 1 >= input.length) return { complete: false };

  const kind = input[index + 1];
  if (kind === "[") {
    for (let cursor = index + 2; cursor < input.length; cursor += 1) {
      const code = input.charCodeAt(cursor);
      if (code >= 0x40 && code <= 0x7e) {
        return {
          complete: true,
          end: cursor + 1,
          value: input.slice(index, cursor + 1),
        };
      }
    }
    return { complete: false };
  }

  if (kind === "]" || kind === "P" || kind === "X" || kind === "^" || kind === "_") {
    for (let cursor = index + 2; cursor < input.length; cursor += 1) {
      if (kind === "]" && input.charCodeAt(cursor) === 0x07) {
        return {
          complete: true,
          end: cursor + 1,
          value: input.slice(index, cursor + 1),
        };
      }
      if (isStringTerminator(input, cursor)) {
        return {
          complete: true,
          end: cursor + 2,
          value: input.slice(index, cursor + 2),
        };
      }
    }
    return { complete: false };
  }

  if (" #%()*+-./".includes(kind)) {
    if (index + 2 >= input.length) return { complete: false };
    return {
      complete: true,
      end: index + 3,
      value: input.slice(index, index + 3),
    };
  }

  return {
    complete: true,
    end: index + 2,
    value: input.slice(index, index + 2),
  };
}

function captureViewport(terminal) {
  const buffer = terminal.buffer.active;
  const rows = [];
  for (let row = 0; row < terminal.rows; row += 1) {
    const line = buffer.getLine(buffer.baseY + row);
    rows.push({
      text: line?.translateToString(true) ?? "",
      wrapped: line?.isWrapped === true,
    });
  }
  return {
    type: buffer.type,
    baseY: buffer.baseY,
    cursorX: buffer.cursorX,
    cursorY: buffer.cursorY,
    rows,
  };
}

function lineKey(line) {
  return `${line.wrapped ? "1" : "0"}:${line.text}`;
}

function isBlankLine(line) {
  return !line.wrapped && line.text.length === 0;
}

function effectiveRowCount(viewport) {
  if (viewport.type !== "normal") return 0;
  for (let index = viewport.rows.length - 1; index >= 0; index -= 1) {
    if (!isBlankLine(viewport.rows[index])) return index + 1;
  }
  return 0;
}

function detectUpwardShift(before, after) {
  if (before.type !== "normal" || after.type !== "normal") return 0;
  if (
    before.rows.length === after.rows.length &&
    before.rows.every(
      (line, index) => lineKey(line) === lineKey(after.rows[index]),
    )
  ) {
    return 0;
  }

  const beforeCount = effectiveRowCount(before);
  const afterCount = effectiveRowCount(after);
  if (beforeCount < 2 || afterCount === 0) return 0;

  for (let shift = 1; shift < beforeCount; shift += 1) {
    const overlapCount = beforeCount - shift;
    if (overlapCount < 2 || afterCount < overlapCount) continue;

    let matches = true;
    for (let index = 0; index < overlapCount; index += 1) {
      if (
        lineKey(before.rows[index + shift]) !== lineKey(after.rows[index])
      ) {
        matches = false;
        break;
      }
    }
    if (matches) return shift;
  }
  return 0;
}

function viewportMatches(left, right) {
  if (
    left.type !== right.type ||
    left.cursorX !== right.cursorX ||
    left.cursorY !== right.cursorY ||
    left.rows.length !== right.rows.length
  ) {
    return false;
  }
  return left.rows.every(
    (line, index) => lineKey(line) === lineKey(right.rows[index]),
  );
}

function createScrollbackAdvance(rows, count) {
  const safeCount = Math.min(rows, Math.max(0, Math.trunc(count)));
  if (safeCount === 0) return "";
  return `${ESC}7${ESC}[${rows};1H${"\r\n".repeat(safeCount)}${ESC}8`;
}

function insertAfterSyncStart(frame, insertion) {
  if (!insertion) return frame;
  return frame.startsWith(SYNC_OUTPUT_START)
    ? `${SYNC_OUTPUT_START}${insertion}${frame.slice(SYNC_OUTPUT_START.length)}`
    : `${insertion}${frame}`;
}

/**
 * Codex runs on the normal buffer with --no-alt-screen, but redraws the
 * conversation with CSI 2 J/CSI 3 J and synchronized-output frames. Those
 * controls overwrite xterm's viewport instead of growing native scrollback.
 *
 * Keep an xterm shadow of the exact data sent to the renderer. Before a clear,
 * advance the viewport into scrollback. For synchronized repaint frames, use a
 * second shadow as a probe and preserve only rows that the repaint shifted off
 * the top. Claude and plain shells use PassThroughTerminalFilter instead.
 */
export class CodexScrollbackFilter {
  constructor(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
    this.rows = asDimension(rows, DEFAULT_ROWS);
    this.cols = asDimension(cols, DEFAULT_COLS);
    this.pending = "";
    this.syncParts = null;
    this.shadow = createShadowTerminal(this.cols, this.rows);
    this.probe = createShadowTerminal(this.cols, this.rows);
    this.disposed = false;
  }

  push(chunk) {
    if (this.disposed) return String(chunk ?? "");

    const input = this.pending + String(chunk ?? "");
    this.pending = "";
    const output = [];
    let textStart = 0;
    let cursor = 0;

    while (cursor < input.length) {
      const escapeIndex = input.indexOf(ESC, cursor);
      if (escapeIndex < 0) {
        this.#acceptPart(input.slice(textStart), false, output);
        return output.join("");
      }

      if (escapeIndex > textStart) {
        this.#acceptPart(input.slice(textStart, escapeIndex), false, output);
      }
      const sequence = readEscapeSequence(input, escapeIndex);
      if (!sequence?.complete) {
        this.pending = input.slice(escapeIndex);
        return output.join("");
      }
      this.#acceptPart(sequence.value, true, output);
      cursor = sequence.end;
      textStart = cursor;
    }

    if (textStart < input.length) {
      this.#acceptPart(input.slice(textStart), false, output);
    }
    return output.join("");
  }

  finish() {
    if (this.disposed) return "";
    const output = [];
    if (this.pending) {
      if (this.syncParts) {
        this.syncParts.push({ value: this.pending, isEscape: false });
      } else {
        this.#writeBoth(this.pending);
        output.push(this.pending);
      }
    }
    this.pending = "";
    if (this.syncParts) {
      output.push(this.#flushSyncFrame(false));
    }
    return output.join("");
  }

  resize(cols, rows) {
    if (this.disposed) return;
    this.cols = asDimension(cols, this.cols);
    this.rows = asDimension(rows, this.rows);
    this.shadow.resize(this.cols, this.rows);
    this.probe.resize(this.cols, this.rows);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = "";
    this.syncParts = null;
    this.shadow.dispose();
    this.probe.dispose();
  }

  #acceptPart(value, isEscape, output) {
    if (!value) return;
    if (this.syncParts) {
      this.syncParts.push({ value, isEscape });
      if (isEscape && value === SYNC_OUTPUT_END) {
        output.push(this.#flushSyncFrame(true));
      }
      return;
    }

    if (isEscape && value === SYNC_OUTPUT_START) {
      this.syncParts = [{ value, isEscape }];
      return;
    }
    output.push(this.#processDirectPart(value, isEscape));
  }

  #processDirectPart(value, isEscape) {
    if (isEscape && value === ERASE_SCROLLBACK) return "";

    let transformed = value;
    if (isEscape && value === ERASE_VIEWPORT) {
      transformed = `${createScrollbackAdvance(
        this.rows,
        effectiveRowCount(captureViewport(this.shadow)),
      )}${value}`;
    }
    this.#writeBoth(transformed);
    return transformed;
  }

  #flushSyncFrame(complete) {
    const parts = this.syncParts ?? [];
    this.syncParts = null;
    const sanitized = parts.filter(
      ({ value, isEscape }) => !(isEscape && value === ERASE_SCROLLBACK),
    );
    const hasViewportErase = sanitized.some(
      ({ value, isEscape }) => isEscape && value === ERASE_VIEWPORT,
    );

    if (hasViewportErase || !complete) {
      const output = [];
      for (const { value, isEscape } of sanitized) {
        output.push(this.#processDirectPart(value, isEscape));
      }
      return output.join("");
    }

    const frame = sanitized.map(({ value }) => value).join("");
    const before = captureViewport(this.shadow);
    const probeBaseY = this.probe.buffer.active.baseY;
    writeShadowSync(this.probe, frame);
    const after = captureViewport(this.probe);
    const shift =
      after.baseY > probeBaseY ? 0 : detectUpwardShift(before, after);
    const advance = createScrollbackAdvance(this.rows, shift);
    const transformed = insertAfterSyncStart(frame, advance);
    writeShadowSync(this.shadow, transformed);
    this.#alignProbe();
    return transformed;
  }

  #writeBoth(data) {
    writeShadowSync(this.shadow, data);
    writeShadowSync(this.probe, data);
  }

  #alignProbe() {
    const target = captureViewport(this.shadow);
    const current = captureViewport(this.probe);
    if (viewportMatches(target, current)) return;

    const output = [`${ESC}[2J${ESC}[H`];
    target.rows.forEach((line, index) => {
      if (!line.text) return;
      output.push(`${ESC}[${index + 1};1H${line.text}`);
    });
    output.push(
      `${ESC}[${target.cursorY + 1};${target.cursorX + 1}H`,
    );
    writeShadowSync(this.probe, output.join(""));
  }
}

export class PassThroughTerminalFilter {
  push(chunk) {
    return String(chunk ?? "");
  }

  finish() {
    return "";
  }

  resize() {}

  dispose() {}
}

export class SequencedTerminalBuffer {
  constructor(maxCharacters = 512 * 1024) {
    this.maxCharacters = Math.max(1024, maxCharacters);
    this.chunks = [];
    this.length = 0;
    this.baseSequence = 0;
    this.nextSequence = 0;
  }

  append(chunk) {
    const value = String(chunk ?? "");
    const sequenceStart = this.nextSequence;
    if (!value) {
      return {
        sequenceStart,
        sequenceEnd: sequenceStart,
        data: "",
      };
    }
    this.chunks.push(value);
    this.length += value.length;
    this.nextSequence += value.length;
    while (this.length > this.maxCharacters && this.chunks.length > 0) {
      const overflow = this.length - this.maxCharacters;
      const first = this.chunks[0];
      if (first.length <= overflow) {
        this.chunks.shift();
        this.length -= first.length;
        this.baseSequence += first.length;
      } else {
        this.chunks[0] = first.slice(overflow);
        this.length -= overflow;
        this.baseSequence += overflow;
      }
    }
    return {
      sequenceStart,
      sequenceEnd: this.nextSequence,
      data: value,
    };
  }

  snapshot() {
    return this.chunks.join("");
  }

  readSince(rawSequence = this.baseSequence) {
    const requested = Number.isFinite(rawSequence)
      ? Math.max(0, Math.trunc(rawSequence))
      : this.baseSequence;
    const resetRequired =
      requested < this.baseSequence || requested > this.nextSequence;
    const sequenceStart = resetRequired ? this.baseSequence : requested;
    const offset = sequenceStart - this.baseSequence;
    return {
      sequenceStart,
      sequenceEnd: this.nextSequence,
      data: this.snapshot().slice(offset),
      resetRequired,
      truncated: requested < this.baseSequence,
    };
  }
}

// Kept as a compatibility export for older service tests and imports. New PTY
// ownership uses SequencedTerminalBuffer directly.
export class BoundedTerminalBuffer extends SequencedTerminalBuffer {}
