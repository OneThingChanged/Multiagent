const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "10.0.2.2"]);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
}

export function normalizeRemoteUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Remote 주소를 입력하세요.");
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("올바른 Remote 주소가 아닙니다.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("HTTP 또는 HTTPS 주소만 사용할 수 있습니다.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("주소에 계정 정보를 포함할 수 없습니다.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol === "http:" &&
    !LOCAL_HOSTS.has(hostname) &&
    !isPrivateIpv4(hostname)
  ) {
    throw new Error("외부 Remote 서버는 HTTPS 주소를 사용해야 합니다.");
  }
  return `${parsed.origin}/`;
}

export function remoteAppUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("source", "mobile-app");
  return url.toString();
}

export function isAllowedInAppNavigation(baseUrl: string, targetUrl: string) {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}

export function mobileAuthCompleteUrl(baseUrl: string, ticket: string) {
  const url = new URL("/auth/mobile/complete", baseUrl);
  url.searchParams.set("ticket", ticket);
  return url.toString();
}
