import { describe, expect, it, vi } from "vitest";
import {
  preparePtySubmission,
  PTY_SUBMIT_DELAY_MS,
  submitPtyMessage,
} from "./pty-submit.mjs";

describe("PTY message submission", () => {
  it("keeps a single-line message as ordinary terminal input", () => {
    expect(preparePtySubmission("상태 확인해줘")).toBe("상태 확인해줘");
  });

  it("wraps an image-tagged multiline message as one bracketed paste", () => {
    const message = [
      "이 이미지 확인해줘",
      "",
      "첨부 이미지:",
      '"C:\\Users\\tester\\App Data\\remote-attachments\\한글 이미지.png"',
      '"C:\\Users\\tester\\App Data\\remote-attachments\\second.jpg"',
    ].join("\r\n");

    expect(preparePtySubmission(message)).toBe(
      "\x1b[200~이 이미지 확인해줘\r\r첨부 이미지:\r"
      + '"C:\\Users\\tester\\App Data\\remote-attachments\\한글 이미지.png"\r'
      + '"C:\\Users\\tester\\App Data\\remote-attachments\\second.jpg"\x1b[201~',
    );
  });

  it("closes the paste before sending Enter as a separate write", async () => {
    const writes = [];
    const wait = vi.fn(async () => {});
    const accepted = await submitPtyMessage({
      ptyProcess: { write: (value) => writes.push(value) },
      message: "설명\n\n첨부 이미지:\n\"C:\\capture.png\"",
      wait,
    });

    expect(accepted).toBe(true);
    expect(wait).toHaveBeenCalledWith(PTY_SUBMIT_DELAY_MS);
    expect(writes).toEqual([
      "\x1b[200~설명\r\r첨부 이미지:\r\"C:\\capture.png\"\x1b[201~",
      "\r",
    ]);
  });

  it("does not send Enter after the target PTY has changed", async () => {
    const write = vi.fn();
    const accepted = await submitPtyMessage({
      ptyProcess: { write },
      message: "설명\n첨부 이미지",
      isCurrent: () => false,
      wait: async () => {},
    });

    expect(accepted).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
