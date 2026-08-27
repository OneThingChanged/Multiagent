export type RemoteBackAction = "web-history" | "session-hub";

export function rememberProfileView(profileIds: string[], profileId: string) {
  return profileIds.includes(profileId) ? profileIds : [...profileIds, profileId];
}

export function forgetProfileView(profileIds: string[], profileId: string) {
  return profileIds.filter((id) => id !== profileId);
}

export function resolveRemoteBackAction(canGoBack: boolean): RemoteBackAction {
  return canGoBack ? "web-history" : "session-hub";
}
