import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function loadChatFileLinkFunctions() {
  const source = fs.readFileSync(fileURLToPath(new URL("./app.js", import.meta.url)), "utf8");
  const start = source.indexOf("const CHAT_FILE_PATH_RE");
  const end = source.indexOf("function mdToHtml", start);
  if (start < 0 || end < 0) throw new Error("Remote chat file-link helpers were not found.");
  const context = {
    escapeHtml: (value) => String(value).replace(/[&<>\"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
    })[character]),
    text: (value) => String(value ?? "").trim(),
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${source.slice(start, end)}\n` +
      "globalThis.chatFileLinks = { cleanChatFilePath, chatFileKind, inlineMd };",
    context,
  );
  return context.chatFileLinks;
}

describe("Remote chat file links", () => {
  const links = loadChatFileLinkFunctions();
  const agent = { projectId: "project-1" };

  it("links plain, code-formatted, and Markdown-linked project files", () => {
    const html = links.inlineMd([
      "docs/README.md",
      "`images/result.png`",
      "[상세 문서](docs/guide.markdown)",
    ].join("\n"), agent);

    expect(html).toContain('data-chat-file-path="docs/README.md"');
    expect(html).toContain('data-chat-file-kind="markdown"');
    expect(html).toContain('data-chat-file-path="images/result.png"');
    expect(html).toContain('data-chat-file-kind="image"');
    expect(html).toContain(">상세 문서</button>");
    expect(html.match(/class="chat-file-link/g)).toHaveLength(3);
  });

  it("normalizes terminal line suffixes and preserves Windows paths", () => {
    expect(links.cleanChatFilePath("C:\\Project\\docs\\README.md:72:4"))
      .toBe("C:\\Project\\docs\\README.md");
    expect(links.chatFileKind("C:\\Project\\shots\\result.webp")).toBe("image");
  });

  it("keeps external image URLs external and does not link without a project", () => {
    const external = links.inlineMd("https://example.com/result.png", agent);
    const noProject = links.inlineMd("docs/README.md", null);

    expect(external).toContain('href="https://example.com/result.png"');
    expect(external).not.toContain("data-chat-file-path");
    expect(noProject).not.toContain("data-chat-file-path");
  });
});
