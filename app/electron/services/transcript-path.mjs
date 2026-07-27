/**
 * Node's Windows realpath implementation can reject extended-length paths
 * (`\\?\C:\...`) even though existsSync accepts them. CLI hooks are allowed
 * to report those paths, so convert them back to their regular Win32 form
 * before canonicalizing or watching a transcript.
 */
export function normalizeTranscriptPath(value, platform = process.platform) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input || platform !== "win32") return input;
  if (input.startsWith("\\\\?\\UNC\\")) return `\\\\${input.slice(8)}`;
  if (input.startsWith("\\\\?\\")) return input.slice(4);
  if (input.startsWith("//?/UNC/")) return `//${input.slice(8)}`;
  if (input.startsWith("//?/")) return input.slice(4);
  return input;
}
