import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico",
]);

function cleanCandidate(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[`"'(<\[]+/, "")
    .replace(/[>`"')\].,;]+$/, "")
    .replace(/(:\d+)(?::\d+)?$/, "")
    .trim();
}

function kindFor(target) {
  if (fs.statSync(target).isDirectory()) return "folder";
  const extension = path.extname(target).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === ".html" || extension === ".htm") return "html";
  if (extension === ".md" || extension === ".markdown") return "markdown";
  return "file";
}

function existing(candidate) {
  try {
    if (!fs.existsSync(candidate)) return null;
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

function absolutePrefix(candidate) {
  let probe = candidate;
  while (probe.length > 2) {
    const target = existing(probe);
    if (target) return target;
    const next = probe.replace(/[\s:;,.)\]}]+[^\s:;,.)\]}]*$/, "").trimEnd();
    if (!next || next === probe) break;
    probe = next;
  }
  return null;
}

export function resolveTerminalPath(folder, rawPath) {
  const candidate = cleanCandidate(rawPath);
  if (!candidate) throw new Error("경로가 비어 있습니다.");
  if (path.isAbsolute(candidate)) {
    const target = absolutePrefix(candidate);
    if (!target) throw new Error("파일 또는 폴더를 찾을 수 없습니다.");
    return { kind: kindFor(target), path: target };
  }

  const segments = candidate.split(/[\\/]/);
  if (segments.includes("..") || segments.includes(".")) {
    throw new Error("상대경로가 올바르지 않습니다.");
  }
  const root = existing(folder);
  if (!root || !fs.statSync(root).isDirectory()) {
    throw new Error("프로젝트 폴더를 찾을 수 없습니다.");
  }
  const probes = [path.join(root, candidate), path.join(root, "Docs", candidate)];
  const parent = path.dirname(root);
  probes.push(path.join(parent, candidate));
  try {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) probes.push(path.join(parent, entry.name, candidate));
    }
  } catch {}
  for (const probe of probes) {
    const target = existing(probe);
    if (target) return { kind: kindFor(target), path: target };
  }
  throw new Error("파일 또는 폴더를 찾을 수 없습니다.");
}
