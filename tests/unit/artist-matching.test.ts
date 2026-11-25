import { describe, expect, it } from "vitest";
import {
  areArtistNamesEquivalent,
  normalizeArtistName,
  slugifyFestival,
} from "@/domain/artist-matching";

describe("domain/artist-matching", () => {
  it("normalizes casing, diacritics, curly quotes, dashes, and redundant spaces", () => {
    expect(normalizeArtistName("  Diamanda   Galás ")).toBe("diamanda galas");
    expect(normalizeArtistName("Brìghde Chaimbeul")).toBe("brighde chaimbeul");
    expect(normalizeArtistName("L’Rain")).toBe("l'rain");
    expect(normalizeArtistName("Neffa–T")).toBe("neffa-t");
  });

  it("preserves meaningful in-name symbols", () => {
    expect(normalizeArtistName("BIG|BRAVE")).toBe("big|brave");
    expect(normalizeArtistName("B0YG1RL")).toBe("b0yg1rl");
    expect(normalizeArtistName("I'A'V")).toBe("i'a'v");
  });

  it("checks equivalence across accent and casing variants", () => {
    expect(areArtistNamesEquivalent("Diamanda Galás", "DIAMANDA GALAS")).toBe(true);
    expect(areArtistNamesEquivalent("L'Rain", "l’rain")).toBe(true);
    expect(areArtistNamesEquivalent("Tim Hecker", "Sarah Davachi")).toBe(false);
  });

  it("generates clean festival slugs without duplicating the year", () => {
    expect(slugifyFestival("Rewire 2027", 2027)).toBe("rewire-2027");
    expect(slugifyFestival("Rewire", 2027)).toBe("rewire-2027");
    expect(slugifyFestival("Sónar Barcelona", 2026)).toBe("sonar-barcelona-2026");
  });
});
