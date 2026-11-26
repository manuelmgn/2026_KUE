import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  getPlacesApiLanguage,
  isSupportedLocale,
  normalizeLocale,
  SUPPORTED_LOCALES,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

describe("i18n", () => {
  it("uses pt-PT as the primary default locale and preserves es", () => {
    expect(DEFAULT_LOCALE).toBe("pt-PT");
    expect(SUPPORTED_LOCALES).toEqual(["pt-PT", "es"]);
    expect(isSupportedLocale("pt-PT")).toBe(true);
    expect(isSupportedLocale("es")).toBe(true);
    expect(isSupportedLocale("en")).toBe(false);
  });

  it("normalizes locale values safely with pt-PT fallback", () => {
    expect(normalizeLocale(undefined)).toBe("pt-PT");
    expect(normalizeLocale(null)).toBe("pt-PT");
    expect(normalizeLocale("")).toBe("pt-PT");
    expect(normalizeLocale("pt-PT")).toBe("pt-PT");
    expect(normalizeLocale("pt")).toBe("pt-PT");
    expect(normalizeLocale("es")).toBe("es");
    expect(normalizeLocale("es-ES")).toBe("es");
    expect(normalizeLocale("fr")).toBe("pt-PT");
  });

  it("maps locale to Open-Meteo geocoding language codes", () => {
    expect(getPlacesApiLanguage("pt-PT")).toBe("pt");
    expect(getPlacesApiLanguage("es")).toBe("es");
  });

  it("provides complete pt-PT and es dictionaries with matching sections", () => {
    const pt = getDictionary("pt-PT");
    const es = getDictionary("es");

    expect(Object.keys(pt).sort()).toEqual(Object.keys(es).sort());
    expect(pt.nav.lineup).toBe("Cartaz");
    expect(pt.nav.settings).toBe("Definições");
    expect(es.nav.lineup).toBe("Cartel");
    expect(es.nav.settings).toBe("Ajustes");
  });
});
