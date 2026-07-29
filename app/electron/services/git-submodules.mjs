import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

function decodeValue(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseGitmodules(content) {
  const entries = [];
  let current = null;
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const section = line.match(
      /^\s*\[\s*submodule\s+"((?:\\.|[^"])*)"\s*\]\s*$/
    );
    if (section) {
      current = { name: section[1].replace(/\\"/g, '"'), path: "", url: "" };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const property = line.match(/^\s*(path|url)\s*=\s*(.*?)\s*$/i);
    if (!property) continue;
    current[property[1].toLowerCase()] = decodeValue(property[2]);
  }
  return entries.filter((entry) => entry.path.trim().length > 0);
}

function normalizedRelativePath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return normalized
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .join("/");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function discoverGitSubmodules(folder, maxEntries = 200) {
  const root = await fsPromises.realpath(String(folder));
  const queue = [{ repository: root, prefix: "" }];
  const visitedRepositories = new Set();
  const results = new Map();

  while (queue.length > 0 && results.size < maxEntries) {
    const current = queue.shift();
    const repositoryKey =
      process.platform === "win32"
        ? current.repository.toLowerCase()
        : current.repository;
    if (visitedRepositories.has(repositoryKey)) continue;
    visitedRepositories.add(repositoryKey);

    let definitions;
    try {
      const content = await fsPromises.readFile(
        path.join(current.repository, ".gitmodules"),
        "utf8"
      );
      definitions = parseGitmodules(content);
    } catch {
      continue;
    }

    for (const definition of definitions) {
      if (results.size >= maxEntries) break;
      const childPath = normalizedRelativePath(definition.path);
      if (!childPath) continue;
      const relativePath = current.prefix
        ? `${current.prefix}/${childPath}`
        : childPath;
      const target = path.resolve(root, ...relativePath.split("/"));
      if (!isInside(root, target)) continue;

      let initialized = false;
      let resolvedTarget = target;
      try {
        resolvedTarget = await fsPromises.realpath(target);
        initialized =
          isInside(root, resolvedTarget) &&
          (await fsPromises.stat(resolvedTarget)).isDirectory() &&
          fs.existsSync(path.join(resolvedTarget, ".git"));
      } catch {
        initialized = false;
      }

      results.set(relativePath, {
        name: definition.name || childPath.split("/").at(-1) || childPath,
        relative_path: relativePath,
        url: definition.url || "",
        initialized,
      });
      if (initialized) {
        queue.push({ repository: resolvedTarget, prefix: relativePath });
      }
    }
  }

  return [...results.values()].sort((left, right) =>
    left.relative_path.localeCompare(right.relative_path)
  );
}
