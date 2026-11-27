import { describe, expect, it } from "vitest";
import {
  createFestivalSchema,
  createInvitationSchema,
  disambiguateArtistSchema,
  INVITATION_DEFAULT_DURATION,
  INVITATION_DEFAULT_MAX_USES,
  INVITATION_DURATION_MS,
  importLineupSchema,
  musicBrainzArtistSearchResponseSchema,
  nullableRatingSchema,
  ratingSchema,
  updateAlbumCustomUrlSchema,
  updateEntryScheduleSchema,
} from "@/domain/schemas";

describe("domain/schemas", () => {
  it("validates integer ratings 1..5 and rejects out-of-range or decimal values", () => {
    expect(ratingSchema.safeParse(1).success).toBe(true);
    expect(ratingSchema.safeParse(5).success).toBe(true);
    expect(ratingSchema.safeParse(0).success).toBe(false);
    expect(ratingSchema.safeParse(6).success).toBe(false);
    expect(ratingSchema.safeParse(4.5).success).toBe(false);
    expect(nullableRatingSchema.safeParse(null).success).toBe(true);
  });

  it("validates festival creation inputs with location metadata and dates", () => {
    const valid = createFestivalSchema.safeParse({
      name: "  Rewire 2027  ",
      year: "2027",
      location: "La Haya",
      locationProvince: "Gemeente Den Haag",
      locationRegion: "Holanda Meridional",
      locationCountry: "Países Bajos",
      locationCountryCode: "NL",
      locationLatitude: 52.07667,
      locationLongitude: 4.29861,
      locationPlaceId: "2747373",
      startDate: "2027-04-08",
      endDate: "2027-04-11",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.name).toBe("Rewire 2027");
      expect(valid.data.year).toBe(2027);
      expect(valid.data.locationRegion).toBe("Holanda Meridional");
      expect(valid.data.locationCountryCode).toBe("NL");
      expect(valid.data.startDate?.toISOString().slice(0, 10)).toBe("2027-04-08");
      expect(valid.data.endDate?.toISOString().slice(0, 10)).toBe("2027-04-11");
    }

    expect(createFestivalSchema.safeParse({ name: "", year: 2027 }).success).toBe(false);
    expect(createFestivalSchema.safeParse({ name: "Rewire", year: 1800 }).success).toBe(false);
    expect(
      createFestivalSchema.safeParse({
        name: "Rewire",
        year: 2027,
        startDate: "2027-04-11",
        endDate: "2027-04-08",
      }).success,
    ).toBe(false);
  });

  it("validates album custom URLs and rejects javascript: or invalid schemes", () => {
    expect(
      updateAlbumCustomUrlSchema.safeParse({
        albumId: "alb_1",
        customUrl: "https://artist.bandcamp.com/album/test",
      }).success,
    ).toBe(true);
    expect(
      updateAlbumCustomUrlSchema.safeParse({
        albumId: "alb_1",
        customUrl: "",
      }).success,
    ).toBe(true);
    expect(
      updateAlbumCustomUrlSchema.safeParse({
        albumId: "alb_1",
        customUrl: null,
      }).success,
    ).toBe(true);
    expect(
      updateAlbumCustomUrlSchema.safeParse({
        albumId: "alb_1",
        customUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      updateAlbumCustomUrlSchema.safeParse({
        albumId: "alb_1",
        customUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("validates disambiguation UUID and entry schedule/live rating", () => {
    expect(
      disambiguateArtistSchema.safeParse({
        artistId: "art_1",
        mbid: "550e8400-e29b-41d4-a716-446655440000",
        country: "CA",
      }).success,
    ).toBe(true);
    expect(
      disambiguateArtistSchema.safeParse({
        artistId: "art_1",
        mbid: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      updateEntryScheduleSchema.safeParse({
        entryId: "ent_1",
        day: "Viernes 09",
        stage: "Grote Kerk",
        setTime: "22:30",
        liveRating: 5,
        liveNotes: "Sonido descomunal",
      }).success,
    ).toBe(true);
  });

  it("validates lineup import payload and strips unknown MusicBrainz fields (no tags)", () => {
    const lineup = importLineupSchema.safeParse({
      festivalId: "fest_1",
      rows: [
        {
          billingName: "BIG|BRAVE",
          artistNames: ["BIG|BRAVE"],
          subtitle: null,
          day: "Sábado",
          stage: "PAARD",
          setTime: null,
          included: true,
        },
      ],
    });
    expect(lineup.success).toBe(true);

    const mb = musicBrainzArtistSearchResponseSchema.parse({
      artists: [
        {
          id: "abc",
          name: "Tim Hecker",
          country: "CA",
          disambiguation: "Canadian electronic musician",
          tags: [{ name: "ambient" }],
        },
      ],
    });
    expect(mb.artists[0]).toEqual({
      id: "abc",
      name: "Tim Hecker",
      country: "CA",
      disambiguation: "Canadian electronic musician",
    });
    expect("tags" in (mb.artists[0] ?? {})).toBe(false);
  });

  it("validates invitation creation defaults, uses 1..5, and supported durations", () => {
    const defaults = createInvitationSchema.parse({});
    expect(defaults.maxUses).toBe(INVITATION_DEFAULT_MAX_USES);
    expect(defaults.maxUses).toBe(2);
    expect(defaults.duration).toBe(INVITATION_DEFAULT_DURATION);
    expect(defaults.duration).toBe("7d");

    for (const uses of [1, 2, 3, 4, 5]) {
      expect(createInvitationSchema.safeParse({ maxUses: uses, duration: "24h" }).success).toBe(
        true,
      );
    }
    expect(createInvitationSchema.safeParse({ maxUses: 0 }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ maxUses: 6 }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ maxUses: 2.5 }).success).toBe(false);

    for (const duration of ["5h", "24h", "72h", "7d", "30d"] as const) {
      expect(createInvitationSchema.safeParse({ duration }).success).toBe(true);
    }
    expect(createInvitationSchema.safeParse({ duration: "1h" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ duration: "365d" }).success).toBe(false);

    expect(INVITATION_DURATION_MS["5h"]).toBe(5 * 60 * 60 * 1000);
    expect(INVITATION_DURATION_MS["24h"]).toBe(24 * 60 * 60 * 1000);
    expect(INVITATION_DURATION_MS["72h"]).toBe(72 * 60 * 60 * 1000);
    expect(INVITATION_DURATION_MS["7d"]).toBe(7 * 24 * 60 * 60 * 1000);
    expect(INVITATION_DURATION_MS["30d"]).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
