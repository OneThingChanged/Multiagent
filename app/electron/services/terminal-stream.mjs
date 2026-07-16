const ERASE_SCROLLBACK = "\u001b[3J";

/**
 * Codex redraws its TUI with CSI 3 J. xterm.js correctly interprets that as
 * "erase saved lines", but in an embedded terminal that also destroys the
 * conversation history users expect to keep. This streaming filter removes
 * only that exact sequence and keeps every other escape sequence intact.
 */
export class CodexScrollbackFilter {
  constructor() {
    this.pending = "";
  }

  push(chunk) {
    let input = this.pending + String(chunk ?? "");
    this.pending = "";
    let output = "";

    while (input.length > 0) {
      const matchIndex = input.indexOf(ERASE_SCROLLBACK);
      if (matchIndex >= 0) {
        output += input.slice(0, matchIndex);
        input = input.slice(matchIndex + ERASE_SCROLLBACK.length);
        continue;
      }

      let suffixLength = 0;
      const maxPrefix = Math.min(ERASE_SCROLLBACK.length - 1, input.length);
      for (let length = maxPrefix; length > 0; length -= 1) {
        if (ERASE_SCROLLBACK.startsWith(input.slice(-length))) {
          suffixLength = length;
          break;
        }
      }
      if (suffixLength > 0) {
        output += input.slice(0, -suffixLength);
        this.pending = input.slice(-suffixLength);
      } else {
        output += input;
      }
      break;
    }
    return output;
  }

  finish() {
    const remaining = this.pending;
    this.pending = "";
    return remaining;
  }
}

export class PassThroughTerminalFilter {
  push(chunk) {
    return String(chunk ?? "");
  }

  finish() {
    return "";
  }
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
