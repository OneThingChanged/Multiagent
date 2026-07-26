import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReopenJournal,
  reopenJournalInternals,
} from "./reopen-journal.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("ReopenJournal", () => {
  it("atomically stores, reloads, and clears the last live agent ids", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "multiagent-reopen-journal-")
    );
    temporaryDirectories.push(directory);
    const journal = new ReopenJournal(path.join(directory, "reopen.json"));

    expect(journal.load()).toBeNull();
    expect(journal.write(["agent-a", "agent-b", "agent-a"])?.agentIds).toEqual([
      "agent-a",
      "agent-b",
    ]);
    expect(journal.load()?.agentIds).toEqual(["agent-a", "agent-b"]);
    expect(journal.clear()?.agentIds).toEqual([]);
  });

  it("rejects malformed ids without rejecting the whole journal", () => {
    expect(
      reopenJournalInternals.sanitizeAgentIds([
        " agent-a ",
        "",
        null,
        "x".repeat(257),
      ])
    ).toEqual(["agent-a"]);
  });
});
