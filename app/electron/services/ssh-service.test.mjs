import { describe, expect, it } from "vitest";
import {
  buildInteractiveSshArgs,
  buildRemoteCommand,
  splitCommandLine,
  sshConnectionArgs,
} from "./ssh-service.mjs";

describe("Electron SSH service", () => {
  it("parses quoted extra options without shell evaluation", () => {
    expect(splitCommandLine('-o StrictHostKeyChecking=accept-new -J "jump user@host"')).toEqual([
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-J",
      "jump user@host",
    ]);
  });

  it("uses password-only authentication options when requested", () => {
    const args = sshConnectionArgs({ authMethod: "password", port: 2222 });
    expect(args).toContain("PubkeyAuthentication=no");
    expect(args).toContain("2222");
  });

  it("builds an encoded Windows command without exposing hook token", () => {
    const command = buildRemoteCommand(
      { remoteOs: "windows", remoteFolder: "C:\\Work Folder" },
      "codex.cmd",
      { agentId: "agent-1", port: 49152, token: "secret token" }
    );
    expect(command).toMatch(/-EncodedCommand [A-Za-z0-9+/=]+$/);
    expect(command).not.toContain("secret token");
  });

  it("adds reverse hook forwarding and a remote command", () => {
    const args = buildInteractiveSshArgs(
      { host: "example.test", user: "me", remoteOs: "posix", remoteFolder: "/work" },
      "codex",
      { agentId: "a", port: 1234, reversePort: 49152, token: "t", aiToolId: "codex" }
    );
    expect(args).toContain("49152:127.0.0.1:1234");
    expect(args).toContain("me@example.test");
    expect(args.at(-1)).toContain("cd -- '/work'");
    expect(args.at(-1)).toContain("remote-bootstrap");
  });
});
