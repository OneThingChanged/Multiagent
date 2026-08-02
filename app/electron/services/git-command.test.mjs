import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GIT_COMMAND_TIMEOUT_MS,
  describeGitCommandFailure,
  isGitRepository,
  runGit,
} from "./git-command.mjs";

const cleanup = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("git command runner", () => {
  it("uses a bounded 30 second default", () => {
    expect(GIT_COMMAND_TIMEOUT_MS).toBe(30_000);
  });

  it("distinguishes timeout and missing-git failures", () => {
    expect(
      describeGitCommandFailure({ killed: true }, "", 30_000)
    ).toEqual({
      code: "GIT_TIMEOUT",
      message:
        "Git 상태 조회가 30초를 초과했습니다. 잠시 후 새로고침해 주세요.",
    });
    expect(describeGitCommandFailure({ code: "ENOENT" }, "", 30_000)).toEqual({
      code: "GIT_NOT_FOUND",
      message: "Git 실행 파일을 찾을 수 없습니다.",
    });
  });

  it("separates real repositories from ordinary folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "multiagent-git-command-"));
    cleanup.push(root);
    expect(await isGitRepository(root)).toBe(false);

    execFileSync("git", ["init", "--quiet"], { cwd: root, windowsHide: true });
    expect(await isGitRepository(root)).toBe(true);
    const expectedRoot = (await realpath(root)).replace(/\\/g, "/");
    expect((await runGit(root, ["rev-parse", "--show-toplevel"])).trim()).toBe(
      expectedRoot
    );
  });
});
