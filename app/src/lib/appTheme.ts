export const LS_APP_THEME = "multiagent.appTheme.v1";
const LS_LEGACY_DOCS_THEME = "multiagent.docsTheme.v1";

export const APP_THEMES = [
  { id: "soft", label: "Soft" },
  { id: "github", label: "GitHub" },
  { id: "warm", label: "Warm" },
  { id: "light", label: "Light" },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export function isAppThemeId(value: string): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function loadAppTheme(): AppThemeId {
  try {
    const value =
      localStorage.getItem(LS_APP_THEME) ??
      localStorage.getItem(LS_LEGACY_DOCS_THEME);
    return value && isAppThemeId(value) ? value : "soft";
  } catch {
    return "soft";
  }
}

export function saveAppTheme(theme: AppThemeId) {
  try {
    localStorage.setItem(LS_APP_THEME, theme);
    localStorage.setItem(LS_LEGACY_DOCS_THEME, theme);
  } catch {}
}
