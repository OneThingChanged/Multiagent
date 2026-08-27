import type { RemoteProfile } from "./profiles.ts";

export type HubSessionStatus =
  | "working"
  | "attention"
  | "recovering"
  | "starting"
  | "done"
  | "idle"
  | "offline";

export type HubSession = {
  profileId: string;
  profileName: string;
  baseUrl: string;
  id: string;
  name: string;
  project: string;
  tool: string;
  status: HubSessionStatus;
  active: boolean;
};

export type HubProfileState = {
  profile: RemoteProfile;
  state: "online" | "offline" | "login-required";
  error: string;
  sessions: HubSession[];
};

export type HubSnapshotRow = {
  profileId: string;
  baseUrl: string;
  ok: boolean;
  authRequired?: boolean;
  body?: string;
  error?: string;
};

const STATUS_ORDER: HubSessionStatus[] = [
  "working",
  "attention",
  "recovering",
  "starting",
  "done",
  "idle",
  "offline",
];

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function status(value: unknown): HubSessionStatus {
  const candidate = text(value).toLowerCase() as HubSessionStatus;
  return STATUS_ORDER.includes(candidate) ? candidate : "offline";
}

export function mergeHubSnapshots(
  profiles: RemoteProfile[],
  rows: HubSnapshotRow[],
): HubProfileState[] {
  const rowByProfile = new Map(rows.map((row) => [row.profileId, row]));
  return profiles.map((profile) => {
    const row = rowByProfile.get(profile.id);
    if (!row) {
      return {
        profile,
        state: "login-required",
        error: "서버를 열어 로그인과 기기 승인을 완료해 주세요.",
        sessions: [],
      };
    }
    if (!row.ok) {
      return {
        profile,
        state: row.authRequired ? "login-required" : "offline",
        error: text(row.error, row.authRequired ? "로그인이 필요합니다." : "서버에 연결하지 못했습니다."),
        sessions: [],
      };
    }
    try {
      const payload = JSON.parse(String(row.body || "{}"));
      const sessions: HubSession[] = (Array.isArray(payload.sessions) ? payload.sessions : [])
        .filter((entry: unknown) => entry && typeof entry === "object" && text((entry as { id?: unknown }).id))
        .map((entry: Record<string, unknown>) => {
          const sessionStatus = status(entry.status);
          return {
            profileId: profile.id,
            profileName: profile.name,
            baseUrl: profile.baseUrl,
            id: text(entry.id).slice(0, 128),
            name: text(entry.name, text(entry.id)).slice(0, 120),
            project: text(entry.project, "기타").slice(0, 120),
            tool: text(entry.tool, "shell").slice(0, 60),
            status: sessionStatus,
            active: entry.active === true && sessionStatus !== "offline",
          };
        })
        .sort((left: HubSession, right: HubSession) => (
          STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status) ||
          left.project.localeCompare(right.project, "ko") ||
          left.name.localeCompare(right.name, "ko")
        ));
      return { profile, state: "online", error: "", sessions };
    } catch {
      return {
        profile,
        state: "offline",
        error: "서버의 세션 응답을 읽지 못했습니다.",
        sessions: [],
      };
    }
  });
}
