type DroppedFileWithPath = File & {
  path?: string;
  webkitRelativePath?: string;
  mozFullPath?: string;
};

function dataTransferTypes(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types ?? []);
}

export function hasExternalFiles(dataTransfer: DataTransfer) {
  return (
    dataTransfer.files.length > 0 ||
    dataTransferTypes(dataTransfer).includes("Files")
  );
}

function readDataTransferText(dataTransfer: DataTransfer, type: string) {
  try {
    return dataTransfer.getData(type);
  } catch {
    return "";
  }
}

function fileUriToPath(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "file:") return null;
    const host = decodeURIComponent(url.hostname);
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    const path = pathname.replace(/\//g, "\\");
    return host ? `\\\\${host}${path}` : path;
  } catch {
    return null;
  }
}

function looksLikeAbsolutePath(value: string) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

export function extractDroppedFilePaths(
  dataTransfer: DataTransfer,
  resolveFilePath?: (file: File) => string
) {
  const paths: string[] = [];

  for (const file of Array.from(dataTransfer.files) as DroppedFileWithPath[]) {
    let resolvedPath = "";
    try {
      resolvedPath = resolveFilePath?.(file)?.trim() ?? "";
    } catch {
      // Keep the browser/Tauri fallbacks available if a runtime resolver fails.
    }
    const path =
      resolvedPath ||
      file.path?.trim() ||
      file.mozFullPath?.trim() ||
      file.webkitRelativePath?.trim() ||
      "";
    if (path) paths.push(path);
  }

  const uriList = readDataTransferText(dataTransfer, "text/uri-list");
  for (const line of uriList.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const path = fileUriToPath(trimmed);
    if (path) paths.push(path);
  }

  const plainText = readDataTransferText(dataTransfer, "text/plain");
  for (const line of plainText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const uriPath = trimmed.startsWith("file:") ? fileUriToPath(trimmed) : null;
    if (uriPath) {
      paths.push(uriPath);
    } else if (looksLikeAbsolutePath(trimmed)) {
      paths.push(trimmed);
    }
  }

  return Array.from(new Set(paths));
}

export function formatDroppedPathForTerminal(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (!/[\s"'`]/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, '\\"')}"`;
}
