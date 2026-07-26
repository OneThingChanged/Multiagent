import fs from "node:fs";
import path from "node:path";

function sanitizeAgentIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value && value.length <= 256)
        .slice(0, 10_000)
    ),
  ];
}

export class ReopenJournal {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (parsed?.version !== 1 || !Array.isArray(parsed.agentIds)) return null;
      return {
        version: 1,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
        agentIds: sanitizeAgentIds(parsed.agentIds),
      };
    } catch {
      return null;
    }
  }

  write(agentIds) {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    const body = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      agentIds: sanitizeAgentIds(agentIds),
    });
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(temporary, body, "utf8");
      fs.renameSync(temporary, this.filePath);
    } catch (error) {
      try {
        fs.rmSync(temporary, { force: true });
        fs.writeFileSync(this.filePath, body, "utf8");
      } catch (fallbackError) {
        throw new Error("reopen journal write failed", {
          cause: fallbackError ?? error,
        });
      }
    }
    return this.load();
  }

  clear() {
    return this.write([]);
  }
}

export const reopenJournalInternals = { sanitizeAgentIds };
