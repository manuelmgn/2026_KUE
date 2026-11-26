import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, type Locale, normalizeLocale } from "@/i18n/config";
import { type Dictionary, getDictionary } from "@/i18n/dictionaries";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getServerDictionary(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await getServerLocale();
  return { locale, dict: getDictionary(locale) };
}
