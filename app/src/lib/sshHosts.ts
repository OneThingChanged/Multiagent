import { LS_SSH_HOSTS } from "../types";
import type { SshHost } from "../types";

export function loadSshHosts(): SshHost[] {
  try {
    const raw = localStorage.getItem(LS_SSH_HOSTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SshHost[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h) => h && typeof h.id === "string" && typeof h.host === "string"
    );
  } catch {
    return [];
  }
}

export function saveSshHosts(hosts: SshHost[]) {
  try {
    localStorage.setItem(LS_SSH_HOSTS, JSON.stringify(hosts));
  } catch {}
}

export function findSshHost(id: string | undefined | null): SshHost | null {
  if (!id) return null;
  return loadSshHosts().find((h) => h.id === id) ?? null;
}

// "user@host:port" style summary for display.
export function sshHostSummary(host: SshHost): string {
  const base = `${host.user}@${host.host}`;
  return host.port && host.port !== 22 ? `${base}:${host.port}` : base;
}
