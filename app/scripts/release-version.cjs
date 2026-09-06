function parseReleaseVersion(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Release version must use four numeric parts: ${normalized || "empty"}`);
  }
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 65_535)) {
    throw new Error(`Release version component is outside 0-65535: ${normalized}`);
  }
  if (parts[0] === 0) {
    throw new Error(`Release version must start at 1 or higher: ${normalized}`);
  }
  return parts;
}

function releaseVersionToUpdaterVersion(value) {
  const [major, minor, patch] = parseReleaseVersion(value);
  return `${major}.${minor}.${patch}`;
}

function resolveReleaseVersions(packageMetadata) {
  const updaterVersion = String(packageMetadata?.version || "").trim();
  const releaseVersion = String(packageMetadata?.multiAgentReleaseVersion || "").trim();
  const expectedUpdaterVersion = releaseVersionToUpdaterVersion(releaseVersion);
  if (updaterVersion !== expectedUpdaterVersion) {
    throw new Error(
      `package.json version ${updaterVersion || "empty"} must match release ${releaseVersion} as ${expectedUpdaterVersion}.`,
    );
  }
  return { releaseVersion, updaterVersion };
}

module.exports = {
  parseReleaseVersion,
  releaseVersionToUpdaterVersion,
  resolveReleaseVersions,
};
