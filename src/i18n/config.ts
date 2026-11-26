export const SUPPORTED_LOCALES = ["gl", "pt-PT", "es-ES"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "gl";

export const LOCALE_COOKIE_NAME = "kue-locale";

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === "gl" || value === "pt-PT" || value === "es-ES";
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }
  if (isSupportedLocale(value)) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("gl")) {
    return "gl";
  }
  if (lower.startsWith("pt")) {
    return "pt-PT";
  }
  if (lower.startsWith("es")) {
    return "es-ES";
  }
  return DEFAULT_LOCALE;
}

export function getPlacesApiLanguage(locale: Locale): "pt" | "es" {
  return locale === "pt-PT" ? "pt" : "es";
}
