import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { translate, type Language } from "./translations";
import { loadLanguage, saveLanguage } from "./language-storage";

interface LanguageContextValue {
  language: Language;
  /** False until the person has explicitly picked one — used to decide whether the album-creation prompt still needs to ask. */
  hasChosenLanguage: boolean;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function detectDefaultLanguage(): Language {
  try {
    return navigator.language.toLowerCase().startsWith("ro") ? "ro" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = loadLanguage();
  const [language, setLanguageState] = useState<Language>(stored ?? detectDefaultLanguage());
  const [hasChosenLanguage, setHasChosenLanguage] = useState(stored !== null);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      hasChosenLanguage,
      setLanguage: (next) => {
        saveLanguage(next);
        setLanguageState(next);
        setHasChosenLanguage(true);
      },
      t: (key, vars) => translate(language, key, vars),
    }),
    [language, hasChosenLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside a LanguageProvider.");
  return context;
}
