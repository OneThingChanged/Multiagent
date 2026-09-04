import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppLanguagePreference = "system" | "ko" | "en";
export type ResolvedAppLanguage = Exclude<AppLanguagePreference, "system">;

export const LS_APP_LANGUAGE = "multiagent.appLanguage.v1";

export function normalizeAppLanguagePreference(
  value: unknown,
): AppLanguagePreference {
  return value === "ko" || value === "en" || value === "system"
    ? value
    : "system";
}

export function resolveAppLanguage(
  preference: AppLanguagePreference,
  locales: readonly string[] = [],
): ResolvedAppLanguage {
  if (preference !== "system") return preference;
  return locales.some((locale) => /^ko(?:-|$)/i.test(locale)) ? "ko" : "en";
}

export function loadAppLanguagePreference(): AppLanguagePreference {
  try {
    return normalizeAppLanguagePreference(localStorage.getItem(LS_APP_LANGUAGE));
  } catch {
    return "system";
  }
}

function browserLocales(): string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length
    ? [...navigator.languages]
    : navigator.language
      ? [navigator.language]
      : [];
}

type AppLanguageContextValue = {
  preference: AppLanguagePreference;
  language: ResolvedAppLanguage;
  setPreference: (preference: AppLanguagePreference) => void;
  text: (korean: string, english: string) => string;
};

const FALLBACK_CONTEXT: AppLanguageContextValue = {
  preference: "system",
  language: "ko",
  setPreference: () => {},
  text: (korean) => korean,
};

// The fallback keeps isolated component previews and server-rendered tests
// compatible with the app's historical Korean UI. The real application root
// always installs AppLanguageProvider.
const AppLanguageContext = createContext<AppLanguageContextValue>(FALLBACK_CONTEXT);

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppLanguagePreference>(
    loadAppLanguagePreference,
  );
  const [systemLocales, setSystemLocales] = useState(browserLocales);
  const language = resolveAppLanguage(preference, systemLocales);

  const setPreference = useCallback((next: AppLanguagePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(LS_APP_LANGUAGE, next);
    } catch {
      // The selection still applies to the current window if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const handleLanguageChange = () => setSystemLocales(browserLocales());
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LS_APP_LANGUAGE) return;
      setPreferenceState(normalizeAppLanguagePreference(event.newValue));
    };
    window.addEventListener("languagechange", handleLanguageChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("languagechange", handleLanguageChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "ko" ? "ko-KR" : "en-US";
  }, [language]);

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      preference,
      language,
      setPreference,
      text: (korean, english) => (language === "ko" ? korean : english),
    }),
    [language, preference, setPreference],
  );

  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

export function useAppLanguage(): AppLanguageContextValue {
  return useContext(AppLanguageContext);
}
