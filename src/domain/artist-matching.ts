const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const CURLY_APOSTROPHE_REGEX = /[\u2018\u2019\u02BC\u00B4]/g;
const CURLY_QUOTE_REGEX = /[\u201C\u201D]/g;
const DASH_REGEX = /[\u2013\u2014]/g;
const MULTI_SPACE_REGEX = /\s+/g;

/**
 * Normalizes an artist name for case-insensitive, diacritic-insensitive deduplication
 * while preserving meaningful in-name symbols (e.g. `BIG|BRAVE`, `B0YG1RL`, `I'A'V`).
 */
export function normalizeArtistName(name: string): string {
  return name
    .trim()
    .normalize("NFKD")
    .replace(DIACRITICS_REGEX, "")
    .replace(CURLY_APOSTROPHE_REGEX, "'")
    .replace(CURLY_QUOTE_REGEX, '"')
    .replace(DASH_REGEX, "-")
    .replace(MULTI_SPACE_REGEX, " ")
    .toLowerCase();
}

export function areArtistNamesEquivalent(a: string, b: string): boolean {
  return normalizeArtistName(a) === normalizeArtistName(b);
}

export function normalizeFestivalName(name: string): string {
  return normalizeArtistName(name);
}

export function slugifyFestivalBrand(name: string): string {
  const base = normalizeArtistName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "festival";
}

export function slugifyFestival(name: string, year: number): string {
  const base = slugifyFestivalBrand(name);
  const yearStr = String(year);
  if (base.endsWith(`-${yearStr}`) || base === yearStr) {
    return base || `festival-${yearStr}`;
  }
  return base ? `${base}-${yearStr}` : `festival-${yearStr}`;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
