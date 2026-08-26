import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function loadMergeChatHistory() {
  const source = fs.readFileSync(fileURLToPath(new URL("./app.js", import.meta.url)), "utf8");
  const start = source.indexOf("function chatBlockKey");
  const end = source.indexOf("function rawChatKey", start);
  if (start < 0 || end < 0) throw new Error("Remote chat history helpers were not found.");
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(
    `${source.slice(start, end)}\nglobalThis.mergeChatHistory = mergeChatHistory;`,
    context,
  );
  return context.mergeChatHistory;
}

const block = (text) => ({ role: "assistant", kind: "text", text });

describe("Remote chat history", () => {
  const mergeChatHistory = loadMergeChatHistory();

  it("retains the prefix that moved out of the server transcript window", () => {
    const previous = [block("a"), block("b"), block("c"), block("d")];
    const incoming = [block("c"), block("d"), block("e")];

    expect(mergeChatHistory(previous, incoming).map((entry) => entry.text))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps cached blocks when a lookup temporarily returns an empty tail", () => {
    const previous = [block("a")];
    expect(mergeChatHistory(previous, [])).toEqual(previous);
  });
});
