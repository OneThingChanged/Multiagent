import { describe, expect, it } from "vitest";
import { sessionDeletionMessage } from "./sessionLifecycle";

describe("session lifecycle", () => {
  it("builds an explicit irreversible deletion confirmation", () => {
    expect(sessionDeletionMessage("메인 개발")).toBe(
      "\"메인 개발\" 세션을 삭제할까요?\n" +
        "실행 중인 프로세스를 종료하고 MultiAgent 목록에서 제거합니다.\n" +
        "이 동작은 되돌릴 수 없습니다."
    );
  });
});
