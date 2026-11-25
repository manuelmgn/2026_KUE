import { describe, expect, it } from "vitest";
import {
  type FilterableEntry,
  getEffectiveEntryRating,
  getEffectiveEntryStatus,
  matchesEntryFilters,
  matchesRatingFilter,
  resolveStatusOnRating,
  sortAlbumsForShelf,
} from "@/domain/rating";

describe("domain/rating", () => {
  it("promotes PENDING and LISTENING to RATED when a rating 1..5 is assigned", () => {
    expect(resolveStatusOnRating("PENDING", 4)).toBe("RATED");
    expect(resolveStatusOnRating("LISTENING", 5)).toBe("RATED");
    expect(resolveStatusOnRating("RATED", 3)).toBe("RATED");
    expect(resolveStatusOnRating("DISCARDED", 2)).toBe("DISCARDED");
    expect(resolveStatusOnRating("PENDING", null)).toBe("PENDING");
    expect(resolveStatusOnRating("RATED", null)).toBe("LISTENING");
  });

  it("computes effective rating and status for collaborations", () => {
    expect(getEffectiveEntryRating([{ rating: null }, { rating: 4 }])).toBe(4);
    expect(getEffectiveEntryRating([{ rating: 3 }, { rating: 5 }])).toBe(5);
    expect(getEffectiveEntryRating([{ rating: null }])).toBeNull();

    expect(getEffectiveEntryStatus([{ status: "DISCARDED" }, { status: "DISCARDED" }])).toBe(
      "DISCARDED",
    );
    expect(getEffectiveEntryStatus([{ status: "DISCARDED" }, { status: "RATED" }])).toBe("RATED");
    expect(getEffectiveEntryStatus([{ status: "PENDING" }, { status: "LISTENING" }])).toBe(
      "LISTENING",
    );
    expect(getEffectiveEntryStatus([{ status: "PENDING" }])).toBe("PENDING");
  });

  it("evaluates all rating filter buckets accurately", () => {
    expect(matchesRatingFilter(5, "MUST")).toBe(true);
    expect(matchesRatingFilter(4, "MUST")).toBe(true);
    expect(matchesRatingFilter(3, "MUST")).toBe(false);
    expect(matchesRatingFilter(null, "MUST")).toBe(false);
    expect(matchesRatingFilter(2, "LOW")).toBe(true);
    expect(matchesRatingFilter(1, "LOW")).toBe(true);
    expect(matchesRatingFilter(3, "LOW")).toBe(false);
    expect(matchesRatingFilter(null, "UNRATED")).toBe(true);
    expect(matchesRatingFilter(5, "5")).toBe(true);
    expect(matchesRatingFilter(4, "4")).toBe(true);
    expect(matchesRatingFilter(3, "3")).toBe(true);
  });

  it("filters entries by search query (including personal notes), status, and rating", () => {
    const entry: FilterableEntry = {
      billingName: "Mabe Fratti & Bill Orcutt",
      subtitle: "Collaborative Set",
      day: "Sábado 10",
      stage: "Korzo",
      artists: [
        {
          name: "Mabe Fratti",
          rating: 5,
          status: "RATED",
          notes: "Cello eléctrico hipnótico imprescindible",
        },
        {
          name: "Bill Orcutt",
          rating: 4,
          status: "LISTENING",
          notes: "Escuchar Music for Four Guitars",
        },
      ],
    };

    expect(matchesEntryFilters(entry, { query: "hipnotico" })).toBe(true);
    expect(matchesEntryFilters(entry, { query: "four guitars" })).toBe(true);
    expect(matchesEntryFilters(entry, { query: "korzo" })).toBe(true);
    expect(matchesEntryFilters(entry, { query: "techno" })).toBe(false);
    expect(matchesEntryFilters(entry, { status: "LISTENING", rating: "MUST" })).toBe(true);
    expect(matchesEntryFilters(entry, { status: "DISCARDED" })).toBe(false);
    expect(matchesEntryFilters(entry, { rating: "UNRATED" })).toBe(false);
  });

  it("sorts discography shelf with pinned albums first, then newest release year", () => {
    const sorted = sortAlbumsForShelf([
      { id: "1", title: "No Highs", releaseYear: 2023, isPinned: false },
      { id: "2", title: "Virgins", releaseYear: 2013, isPinned: true },
      { id: "3", title: "Ravedeath, 1972", releaseYear: 2011, isPinned: false },
      { id: "4", title: "Unknown Year", releaseYear: null, isPinned: false },
      { id: "5", title: "Konoyo", releaseYear: 2018, isPinned: true },
    ]);

    expect(sorted.map((album) => album.id)).toEqual(["5", "2", "1", "3", "4"]);
  });
});
