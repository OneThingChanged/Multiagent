export type QuickOpenKind = "project" | "session" | "screen" | "document" | "command";

export type QuickOpenItem = {
  id: string;
  kind: QuickOpenKind;
  title: string;
  subtitle: string;
  searchText: string;
  projectId?: string;
  agentId?: string;
  groupId?: string;
  relativePath?: string;
  commandId?: string;
};

const PREFIX_KIND: Record<string, QuickOpenKind> = {
  ">": "command",
  "@": "session",
  "#": "screen",
  "/": "document",
};

function fuzzySubsequence(text: string, query: string) {
  let cursor = 0;
  for (const character of query) {
    cursor = text.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

function score(item: QuickOpenItem, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return 1;
  const title = item.title.toLocaleLowerCase();
  const haystack = `${title} ${item.subtitle} ${item.searchText}`.toLocaleLowerCase();
  if (title === query) return 1000;
  if (title.startsWith(query)) return 700 - title.length;
  const index = haystack.indexOf(query);
  if (index >= 0) return 500 - Math.min(index, 100);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.every((token) => haystack.includes(token))) return 300 - tokens.length;
  if (fuzzySubsequence(haystack, query)) return 100 - Math.min(haystack.length, 80);
  return 0;
}

export function rankQuickOpenItems(items: QuickOpenItem[], rawQuery: string) {
  const prefix = rawQuery.trimStart()[0];
  const kind = PREFIX_KIND[prefix];
  const query = kind ? rawQuery.trimStart().slice(1) : rawQuery;
  return items
    .map((item, index) => ({ item, index, score: score(item, query) }))
    .filter((entry) => (!kind || entry.item.kind === kind) && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 60)
    .map((entry) => entry.item);
}
