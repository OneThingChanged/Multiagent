import { execFile } from "node:child_process";

export const GIT_COMMAND_TIMEOUT_MS = 30_000;

export function describeGitCommandFailure(error, stderr, timeout) {
  const timedOut =
    Boolean(error?.killed) ||
    error?.code === "ETIMEDOUT" ||
    error?.signal === "SIGTERM";
  if (timedOut) {
    return {
      code: "GIT_TIMEOUT",
      message: `Git 상태 조회가 ${Math.round(timeout / 1000)}초를 초과했습니다. 잠시 후 새로고침해 주세요.`,
    };
  }
  if (error?.code === "ENOENT") {
    return {
      code: "GIT_NOT_FOUND",
      message: "Git 실행 파일을 찾을 수 없습니다.",
    };
  }
  return {
    code: "GIT_FAILED",
    message: String(stderr || error?.message || "Git 명령을 실행하지 못했습니다.").trim(),
  };
}

export function runGit(root, args, timeout = GIT_COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", "core.quotepath=false", ...args],
      { cwd: root, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const failure = describeGitCommandFailure(error, stderr, timeout);
        const wrapped = new Error(failure.message, { cause: error });
        wrapped.code = failure.code;
        reject(wrapped);
      }
    );
  });
}

export async function isGitRepository(root) {
  try {
    const result = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
    return result.trim() === "true";
  } catch (error) {
    // A normal rev-parse failure means the folder is not a repository. Runtime
    // failures must remain visible instead of being mislabeled as non-repo.
    if (error?.code === "GIT_TIMEOUT" || error?.code === "GIT_NOT_FOUND") {
      throw error;
    }
    return false;
  }
}
