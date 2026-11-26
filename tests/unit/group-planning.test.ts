import { describe, expect, it } from "vitest";
import {
  buildComparisonMatrix,
  evaluateFestivalRecommendation,
  FESTIVAL_RECOMMENDATION_THRESHOLD,
  meetsAverageThreshold,
  organizeJointAgendaEntries,
  parseSetTimeMinutes,
  type RawComparisonEntryInput,
  type RawComparisonParticipantInput,
  selectEntriesForJointAgenda,
} from "@/domain/group-planning";

const sampleEdition = {
  id: "ed_rewire_2027",
  festivalId: "fest_rewire",
  brandSlug: "rewire",
  slug: "rewire-2027",
  name: "Rewire",
  year: 2027,
  location: "The Hague",
  startDate: "2027-04-08",
  endDate: "2027-04-11",
};

describe("domain: group-planning recommendation and comparison matrix", () => {
  it("evaluates exact >= 3.2 recommendation boundary without floating-point drift", () => {
    expect(FESTIVAL_RECOMMENDATION_THRESHOLD).toBe(3.2);
    expect(meetsAverageThreshold(16, 5, 3.2)).toBe(true);
    expect(meetsAverageThreshold(19, 6, 3.2)).toBe(false);

    // 16 / 5 = 3.20 -> RECOMMENDED
    const exactBoundary = evaluateFestivalRecommendation([3, 3, 3, 3, 4], {
      totalArtistsCount: 10,
      ratedArtistsCount: 5,
    });
    expect(exactBoundary.averageRating).toBe(3.2);
    expect(exactBoundary.recommended).toBe(true);
    expect(exactBoundary.verdict).toBe("RECOMMENDED");
    expect(exactBoundary.coverageRatio).toBe(0.5);

    // 19 / 6 = 3.1666... -> rounds to 3.17, strictly < 3.2 -> NOT_RECOMMENDED
    const justBelow = evaluateFestivalRecommendation([3, 3, 3, 3, 3, 4], {
      totalArtistsCount: 6,
      ratedArtistsCount: 6,
    });
    expect(justBelow.averageRating).toBe(3.17);
    expect(justBelow.recommended).toBe(false);
    expect(justBelow.verdict).toBe("NOT_RECOMMENDED");

    // Empty ratings -> INSUFFICIENT_DATA
    const empty = evaluateFestivalRecommendation([], {
      totalArtistsCount: 8,
      ratedArtistsCount: 0,
    });
    expect(empty.averageRating).toBeNull();
    expect(empty.recommended).toBe(false);
    expect(empty.verdict).toBe("INSUFFICIENT_DATA");
  });

  it("builds comparative rows, respects private ratings, deduplicates multi-set artists, and sorts", () => {
    const entries: RawComparisonEntryInput[] = [
      {
        id: "entry_kali_solo",
        billingName: "Kali Malone",
        subtitle: "Does Spring Hide Its Joy",
        day: "Viernes",
        stage: "Grote Kerk",
        setTime: "21:00",
        sortOrder: 0,
        artists: [{ id: "art_kali", name: "Kali Malone", imagePath: null }],
      },
      {
        id: "entry_kali_collab",
        billingName: "Kali Malone & Stephen O'Malley",
        subtitle: null,
        day: "Sábado",
        stage: " Nieuwe Kerk",
        setTime: "22:00",
        sortOrder: 1,
        artists: [
          { id: "art_kali", name: "Kali Malone", imagePath: null },
          { id: "art_stephen", name: "Stephen O'Malley", imagePath: null },
        ],
      },
      {
        id: "entry_divisive",
        billingName: "Polarizing Noise Act",
        subtitle: null,
        day: "Viernes",
        stage: "Grey Space",
        setTime: "01:00",
        sortOrder: 2,
        artists: [{ id: "art_noise", name: "Polarizing Noise Act", imagePath: null }],
      },
      {
        id: "entry_unrated",
        billingName: "Mystery Newcomer",
        subtitle: null,
        day: null,
        stage: null,
        setTime: null,
        sortOrder: 3,
        artists: [{ id: "art_mystery", name: "Mystery Newcomer", imagePath: null }],
      },
    ];

    const participants: RawComparisonParticipantInput[] = [
      {
        user: { id: "u_alice", username: "alice", displayName: "Alice", avatarPath: null },
        isViewer: true,
        ratingsVisible: true,
        artistStates: new Map([
          ["art_kali", { rating: 5, status: "RATED" }],
          ["art_stephen", { rating: 4, status: "RATED" }],
          ["art_noise", { rating: 5, status: "RATED" }],
        ]),
        entryLiveRatings: new Map([["entry_kali_solo", 5]]),
      },
      {
        user: { id: "u_bob", username: "bob", displayName: "Bob", avatarPath: null },
        isViewer: false,
        ratingsVisible: true,
        artistStates: new Map([
          ["art_kali", { rating: 4, status: "RATED" }],
          ["art_noise", { rating: 1, status: "RATED" }],
        ]),
        entryLiveRatings: new Map(),
      },
      {
        user: { id: "u_secret", username: "secret", displayName: null, avatarPath: null },
        isViewer: false,
        ratingsVisible: false,
        // Even if map had data, ratingsVisible=false must mask it completely
        artistStates: new Map([["art_kali", { rating: 1, status: "RATED" }]]),
        entryLiveRatings: new Map(),
      },
    ];

    const matrix = buildComparisonMatrix({
      edition: sampleEdition,
      entries,
      participants,
      sortBy: "DISAGREEMENT_DESC",
    });

    // Unique artists: art_kali, art_stephen, art_noise, art_mystery -> 4 total, 3 rated
    // Scores counted once per (visible user, unique artist):
    // Alice: 5 + 4 + 5 = 14; Bob: 4 + 1 = 5 -> total 19 / 5 = 3.8 >= 3.2
    expect(matrix.recommendation.totalArtistsCount).toBe(4);
    expect(matrix.recommendation.ratedArtistsCount).toBe(3);
    expect(matrix.recommendation.totalRatingsCount).toBe(5);
    expect(matrix.recommendation.averageRating).toBe(3.8);
    expect(matrix.recommendation.recommended).toBe(true);

    // Private participant summary is masked
    const secretSummary = matrix.participants.find((p) => p.user.id === "u_secret");
    expect(secretSummary?.ratingsVisible).toBe(false);
    expect(secretSummary?.averageRating).toBeNull();
    expect(secretSummary?.ratedEntriesCount).toBe(0);

    // First row in DISAGREEMENT_DESC must be Polarizing Noise Act (5 vs 1 -> spread 4, DIVISIVE)
    expect(matrix.rows[0]?.entryId).toBe("entry_divisive");
    expect(matrix.rows[0]?.disagreementSpread).toBe(4);
    expect(matrix.rows[0]?.consensusTag).toBe("DIVISIVE");
    expect(matrix.rows[0]?.cells[2]?.ratingsPrivate).toBe(true);
    expect(matrix.rows[0]?.cells[2]?.rating).toBeNull();

    // Kali Malone solo & collab are UNANIMOUS_MUST_SEE (Alice 5, Bob 4)
    const kaliSolo = matrix.rows.find((r) => r.entryId === "entry_kali_solo");
    expect(kaliSolo?.consensusTag).toBe("UNANIMOUS_MUST_SEE");
    expect(kaliSolo?.averageRating).toBe(4.5);
    expect(kaliSolo?.cells[0]?.liveRating).toBe(5);

    // Agenda selection strategies
    expect(selectEntriesForJointAgenda(matrix.rows, { strategy: "RECOMMENDED" }).sort()).toEqual([
      "entry_kali_collab",
      "entry_kali_solo",
    ]);
    expect(selectEntriesForJointAgenda(matrix.rows, { strategy: "MUST_SEE" }).sort()).toEqual([
      "entry_kali_collab",
      "entry_kali_solo",
    ]);
    expect(selectEntriesForJointAgenda(matrix.rows, { strategy: "EMPTY" })).toEqual([]);
    expect(
      selectEntriesForJointAgenda(matrix.rows, {
        strategy: "CUSTOM",
        customEntryIds: ["entry_unrated", "non_existent"],
      }),
    ).toEqual(["entry_unrated"]);
  });

  it("sorts festival day schedules with late-night hours and detects overlapping set clashes", () => {
    expect(parseSetTimeMinutes("21:30")).toEqual({ startMinutes: 1290, endMinutes: 1350 });
    expect(parseSetTimeMinutes("01:15")).toEqual({ startMinutes: 1515, endMinutes: 1575 });
    expect(parseSetTimeMinutes("23:30 - 00:45")).toEqual({ startMinutes: 1410, endMinutes: 1485 });
    expect(parseSetTimeMinutes("TBA")).toBeNull();

    const matrix = buildComparisonMatrix({
      edition: sampleEdition,
      participants: [
        {
          user: { id: "u1", username: "u1", displayName: null, avatarPath: null },
          isViewer: true,
          ratingsVisible: true,
          artistStates: new Map([
            ["a1", { rating: 5, status: "RATED" }],
            ["a2", { rating: 4, status: "RATED" }],
            ["a3", { rating: 5, status: "RATED" }],
          ]),
          entryLiveRatings: new Map(),
        },
      ],
      entries: [
        {
          id: "e_late",
          billingName: "After Midnight Club Set",
          subtitle: null,
          day: "Viernes",
          stage: "Basement",
          setTime: "01:00",
          sortOrder: 0,
          artists: [{ id: "a1", name: "After Midnight", imagePath: null }],
        },
        {
          id: "e_evening_a",
          billingName: "Headliner A",
          subtitle: null,
          day: "Viernes",
          stage: "Main Stage",
          setTime: "22:00",
          sortOrder: 1,
          artists: [{ id: "a2", name: "Headliner A", imagePath: null }],
        },
        {
          id: "e_evening_b",
          billingName: "Overlapping Synth Act",
          subtitle: null,
          day: "Viernes",
          stage: "Church",
          setTime: "22:30",
          sortOrder: 2,
          artists: [{ id: "a3", name: "Overlapping Synth Act", imagePath: null }],
        },
      ],
    });

    const organized = organizeJointAgendaEntries({
      comparisonRows: matrix.rows,
      storedItems: [
        {
          entryId: "e_late",
          note: "Cierre",
          addedById: "u1",
          createdAtIso: "2026-11-26T20:00:00Z",
        },
        {
          entryId: "e_evening_a",
          note: "",
          addedById: "u1",
          createdAtIso: "2026-11-26T20:00:00Z",
        },
        {
          entryId: "e_evening_b",
          note: "",
          addedById: "u1",
          createdAtIso: "2026-11-26T20:00:00Z",
        },
      ],
    });

    // 22:00 -> 22:30 -> 01:00 (late night comes AFTER 22:30 on Viernes!)
    expect(organized.items.map((i) => i.entryId)).toEqual(["e_evening_a", "e_evening_b", "e_late"]);

    // 22:00 (22:00-23:00) clashes with 22:30 (22:30-23:30), but NOT with 01:00
    expect(organized.conflicts).toHaveLength(1);
    expect(organized.conflicts[0]).toMatchObject({
      day: "Viernes",
      entryIdA: "e_evening_a",
      entryIdB: "e_evening_b",
    });
    expect(organized.items[0]?.hasClash).toBe(true);
    expect(organized.items[1]?.hasClash).toBe(true);
    expect(organized.items[2]?.hasClash).toBe(false);
  });
});
