import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  detectLocaleFromAcceptLanguage,
  getPlacesApiLanguage,
  isSupportedLocale,
  normalizeLocale,
  SUPPORTED_LOCALES,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

describe("i18n", () => {
  it("uses gl as the primary default locale and preserves pt-PT and es-ES", () => {
    expect(DEFAULT_LOCALE).toBe("gl");
    expect(SUPPORTED_LOCALES).toEqual(["gl", "pt-PT", "es-ES"]);
    expect(isSupportedLocale("gl")).toBe(true);
    expect(isSupportedLocale("pt-PT")).toBe(true);
    expect(isSupportedLocale("es-ES")).toBe(true);
    expect(isSupportedLocale("en")).toBe(false);
  });

  it("normalizes locale values safely with gl fallback", () => {
    expect(normalizeLocale(undefined)).toBe("gl");
    expect(normalizeLocale(null)).toBe("gl");
    expect(normalizeLocale("")).toBe("gl");
    expect(normalizeLocale("gl")).toBe("gl");
    expect(normalizeLocale("gl-ES")).toBe("gl");
    expect(normalizeLocale("pt-PT")).toBe("pt-PT");
    expect(normalizeLocale("pt")).toBe("pt-PT");
    expect(normalizeLocale("es")).toBe("es-ES");
    expect(normalizeLocale("es-ES")).toBe("es-ES");
    expect(normalizeLocale("fr")).toBe("gl");
  });

  it("detects browser language from Accept-Language with silent gl fallback", () => {
    expect(detectLocaleFromAcceptLanguage("es-ES,es;q=0.9,en;q=0.8")).toBe("es-ES");
    expect(detectLocaleFromAcceptLanguage("pt-PT,pt;q=0.9")).toBe("pt-PT");
    expect(detectLocaleFromAcceptLanguage("en-US,en;q=0.9,pt-BR;q=0.7")).toBe("pt-PT");
    expect(detectLocaleFromAcceptLanguage("en-US,en;q=0.9,gl;q=0.8")).toBe("gl");
    expect(detectLocaleFromAcceptLanguage("fr-FR,fr;q=0.9,de;q=0.8")).toBe("gl");
    expect(detectLocaleFromAcceptLanguage(null)).toBe("gl");
  });

  it("maps locale to Open-Meteo geocoding language codes", () => {
    expect(getPlacesApiLanguage("gl")).toBe("gl");
    expect(getPlacesApiLanguage("pt-PT")).toBe("pt");
    expect(getPlacesApiLanguage("es-ES")).toBe("es");
  });

  it("provides complete gl, pt-PT, and es-ES dictionaries with matching sections and Castellano naming", () => {
    const gl = getDictionary("gl");
    const pt = getDictionary("pt-PT");
    const es = getDictionary("es-ES");

    expect(Object.keys(gl).sort()).toEqual(Object.keys(pt).sort());
    expect(Object.keys(gl).sort()).toEqual(Object.keys(es).sort());
    expect(gl.nav.lineup).toBe("Cartaz");
    expect(gl.nav.settings).toBe("Axustes");
    expect(pt.nav.lineup).toBe("Cartaz");
    expect(pt.nav.settings).toBe("Definições");
    expect(es.nav.lineup).toBe("Cartel");
    expect(es.nav.settings).toBe("Ajustes");
    expect(gl.settings.languageEsLabel).toBe("Castellano");
    expect(pt.settings.languageEsLabel).toBe("Castellano");
    expect(es.settings.languageEsLabel).toBe("Castellano");
  });
});
