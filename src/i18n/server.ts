import { cookies, headers } from "next/headers";
import {
  detectLocaleFromAcceptLanguage,
  isSupportedLocale,
  LOCALE_COOKIE_NAME,
  type Locale,
  normalizeLocale,
} from "@/i18n/config";
import { type Dictionary, getDictionary } from "@/i18n/dictionaries";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (saved && isSupportedLocale(saved)) {
    return normalizeLocale(saved);
  }

  const headerStore = await headers();
  return detectLocaleFromAcceptLanguage(headerStore.get("accept-language"));
}

export async function getServerDictionary(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await getServerLocale();
  return { locale, dict: getDictionary(locale) };
}
