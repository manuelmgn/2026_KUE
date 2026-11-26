export const SUPPORTED_LOCALES = ["pt-PT", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-PT";

export const LOCALE_COOKIE_NAME = "kue-locale";

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === "pt-PT" || value === "es";
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  if (isSupportedLocale(value)) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("es")) {
    return "es";
  }
  if (lower.startsWith("pt")) {
    return "pt-PT";
  }
  return DEFAULT_LOCALE;
}

export function getPlacesApiLanguage(locale: Locale): "pt" | "es" {
  return locale === "es" ? "es" : "pt";
}
