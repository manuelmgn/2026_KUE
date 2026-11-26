"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { setLocaleAction } from "@/actions/settings-actions";
import { LOCALE_COOKIE_NAME, type Locale } from "@/i18n/config";
import { type Dictionary, getDictionary } from "@/i18n/dictionaries";

interface I18nContextValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (next: Locale) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  initialLocale: Locale;
  children: ReactNode;
}

export function I18nProvider({ initialLocale, children }: I18nProviderProps) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = async (next: Locale) => {
    if (next === locale) {
      return;
    }
    setLocaleState(next);
    document.documentElement.lang = next;
    // biome-ignore lint/suspicious/noDocumentCookie: Immediate client cookie sync before Server Action completes
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    await setLocaleAction(next);
    router.refresh();
  };

  return (
    <I18nContext.Provider value={{ locale, dict: getDictionary(locale), setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
