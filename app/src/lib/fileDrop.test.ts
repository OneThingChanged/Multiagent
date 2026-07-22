import { describe, expect, it, vi } from "vitest";
import {
  extractDroppedFilePaths,
  formatDroppedPathForTerminal,
} from "./fileDrop";

function dataTransfer(
  files: File[],
  data: Record<string, string> = {}
): DataTransfer {
  return {
    files,
    types: files.length > 0 ? ["Files", ...Object.keys(data)] : Object.keys(data),
    getData: (type: string) => data[type] ?? "",
  } as unknown as DataTransfer;
}

describe("file drop paths", () => {
  it("uses the Electron runtime resolver for real disk paths", () => {
    const first = { name: "first file.txt" } as File;
    const second = { name: "second.txt" } as File;
    const resolveFilePath = vi.fn((file: File) =>
      file === first
        ? "C:\\Work Folder\\first file.txt"
        : "D:\\Assets\\second.txt"
    );

    expect(
      extractDroppedFilePaths(
        dataTransfer([first, second]),
        resolveFilePath
      )
    ).toEqual([
      "C:\\Work Folder\\first file.txt",
      "D:\\Assets\\second.txt",
    ]);
    expect(resolveFilePath).toHaveBeenCalledTimes(2);
  });

  it("falls back to browser and URI paths when the runtime resolver fails", () => {
    const legacyFile = {
      name: "legacy.txt",
      path: "C:\\Legacy\\legacy.txt",
    } as File & { path: string };

    expect(
      extractDroppedFilePaths(
        dataTransfer([legacyFile], {
          "text/uri-list": "file:///D:/Shared/report.txt",
        }),
        () => {
          throw new Error("resolver unavailable");
        }
      )
    ).toEqual([
      "C:\\Legacy\\legacy.txt",
      "D:\\Shared\\report.txt",
    ]);
  });

  it("quotes paths containing spaces before terminal paste", () => {
    expect(formatDroppedPathForTerminal("C:\\Work Folder\\first file.txt")).toBe(
      '"C:\\Work Folder\\first file.txt"'
    );
  });
});
