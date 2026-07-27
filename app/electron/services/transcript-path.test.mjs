import { describe, expect, it } from "vitest";
import { normalizeTranscriptPath } from "./transcript-path.mjs";

describe("normalizeTranscriptPath", () => {
  it("removes a Windows drive namespace prefix", () => {
    expect(
      normalizeTranscriptPath(
        "\\\\?\\G:\\Users\\AI\\.codex\\sessions\\rollout.jsonl",
        "win32",
      ),
    ).toBe("G:\\Users\\AI\\.codex\\sessions\\rollout.jsonl");
  });

  it("converts a Windows UNC namespace path", () => {
    expect(
      normalizeTranscriptPath(
        "\\\\?\\UNC\\server\\share\\.claude\\session.jsonl",
        "win32",
      ),
    ).toBe("\\\\server\\share\\.claude\\session.jsonl");
  });

  it("accepts forward-slash namespace paths and leaves ordinary paths alone", () => {
    expect(normalizeTranscriptPath("//?/G:/Users/AI/session.jsonl", "win32"))
      .toBe("G:/Users/AI/session.jsonl");
    expect(normalizeTranscriptPath("G:\\Users\\AI\\session.jsonl", "win32"))
      .toBe("G:\\Users\\AI\\session.jsonl");
    expect(normalizeTranscriptPath("/home/ai/session.jsonl", "linux"))
      .toBe("/home/ai/session.jsonl");
  });
});
