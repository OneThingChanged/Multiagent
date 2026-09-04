import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

const INSTALLER_PATTERN = /^MultiAgent-Setup-(\d+)\.(\d+)\.(\d+)\.(\d+)-x64\.exe$/i;

export function parseProductVersion(value) {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(".");
  if (parts.length < 3 || parts.length > 4) return null;
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isSafeInteger(part) || part < 0)) return null;
  while (numbers.length < 4) numbers.push(0);
  return numbers;
}

export function compareProductVersions(left, right) {
  const leftParts = parseProductVersion(left);
  const rightParts = parseProductVersion(right);
  if (!leftParts || !rightParts) {
    throw new TypeError("Product versions must contain three or four numeric parts");
  }
  for (let index = 0; index < 4; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

export function parseDeveloperInstallerName(fileName) {
  const match = INSTALLER_PATTERN.exec(fileName);
  if (!match) return null;
  return {
    version: match.slice(1).map(Number).join("."),
    fileName,
  };
}

export class LocalDeveloperUpdateService {
  constructor({ configPath, currentVersion, environmentDirectory = "" }) {
    this.configPath = configPath;
    this.currentVersion = currentVersion;
    this.environmentDirectory = environmentDirectory.trim();
  }

  async settings() {
    const configuredDirectory = await this.#readConfiguredDirectory();
    const directory = this.environmentDirectory || configuredDirectory;
    return {
      directory: directory || null,
      source: this.environmentDirectory
        ? "environment"
        : configuredDirectory
          ? "configured"
          : "none",
    };
  }

  async setDirectory(directory) {
    const resolved = path.resolve(directory.trim());
    const stat = await fsPromises.stat(resolved);
    if (!stat.isDirectory()) throw new Error("업데이트 경로는 폴더여야 합니다.");
    await fsPromises.mkdir(path.dirname(this.configPath), { recursive: true });
    await fsPromises.writeFile(
      this.configPath,
      `${JSON.stringify({ version: 1, directory: resolved }, null, 2)}\n`,
      "utf8"
    );
    return this.settings();
  }

  async check() {
    const settings = await this.settings();
    if (!settings.directory) {
      return { ...settings, currentVersion: this.currentVersion, update: null };
    }

    let entries;
    try {
      entries = await fsPromises.readdir(settings.directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error("지정한 업데이트 폴더를 찾을 수 없습니다.");
      }
      throw error;
    }

    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const parsed = parseDeveloperInstallerName(entry.name);
      if (!parsed || compareProductVersions(parsed.version, this.currentVersion) <= 0) continue;
      const filePath = path.join(settings.directory, entry.name);
      const stat = await fsPromises.stat(filePath);
      candidates.push({
        version: parsed.version,
        path: filePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
    candidates.sort((left, right) => compareProductVersions(right.version, left.version));
    return {
      ...settings,
      currentVersion: this.currentVersion,
      update: candidates[0] ?? null,
    };
  }

  validatePreparedInstaller(candidate, directory) {
    if (!candidate || !directory) return false;
    const resolvedDirectory = path.resolve(directory);
    const resolvedInstaller = path.resolve(candidate.path);
    if (path.dirname(resolvedInstaller).toLowerCase() !== resolvedDirectory.toLowerCase()) {
      return false;
    }
    const parsed = parseDeveloperInstallerName(path.basename(resolvedInstaller));
    if (!parsed || parsed.version !== candidate.version) return false;
    if (compareProductVersions(parsed.version, this.currentVersion) <= 0) return false;
    try {
      return fs.statSync(resolvedInstaller).isFile();
    } catch {
      return false;
    }
  }

  async #readConfiguredDirectory() {
    try {
      const config = JSON.parse(await fsPromises.readFile(this.configPath, "utf8"));
      return typeof config?.directory === "string" && config.directory.trim()
        ? path.resolve(config.directory.trim())
        : "";
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      return "";
    }
  }
}
