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

export function detectLocaleFromAcceptLanguage(headerValue: string | null | undefined): Locale {
  if (!headerValue) {
    return DEFAULT_LOCALE;
  }

  const parsed = headerValue
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const tag = (rawTag ?? "").trim().toLowerCase();
      let q = 1;
      for (const param of params) {
        const trimmed = param.trim();
        if (trimmed.startsWith("q=")) {
          const parsedQ = Number.parseFloat(trimmed.slice(2));
          if (!Number.isNaN(parsedQ)) {
            q = parsedQ;
          }
        }
      }
      return { tag, q, index };
    })
    .filter((item) => item.tag.length > 0 && item.q > 0)
    .sort((a, b) => (b.q !== a.q ? b.q - a.q : a.index - b.index));

  for (const { tag } of parsed) {
    if (tag === "gl" || tag.startsWith("gl-")) {
      return "gl";
    }
    if (tag === "pt" || tag.startsWith("pt-")) {
      return "pt-PT";
    }
    if (tag === "es" || tag.startsWith("es-")) {
      return "es-ES";
    }
  }

  return DEFAULT_LOCALE;
}

export function getPlacesApiLanguage(locale: Locale): "gl" | "pt" | "es" {
  if (locale === "pt-PT") {
    return "pt";
  }
  if (locale === "es-ES") {
    return "es";
  }
  return "gl";
}
