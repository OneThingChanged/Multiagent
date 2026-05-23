export function folderTail(p: string): string {
  const normalized = p.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return ".../" + parts.slice(-2).join("/");
}
