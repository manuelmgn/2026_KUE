import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { parseRawLineup } from "@/domain/lineup-parser";
import { PrismaClient } from "@/generated/prisma/client";
import {
  disambiguateArtist,
  getArtistDetail,
  updateAlbumCustomUrl,
  updateAlbumPin,
  updateArtistNotes,
  updateArtistRating,
} from "@/server/services/artists";
import { listFestivalEntries, updateEntrySchedule } from "@/server/services/entries";
import { createFestival } from "@/server/services/festivals";
import { importFestivalLineup } from "@/server/services/importer";
import { toFestivalSummary } from "@/server/services/mappers";

let tempDir = "";
let db: PrismaClient;
let testUserId = "";

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-int-db-"));
  const dbFile = path.join(tempDir, "test.db");
  const dbUrl = `file:${dbFile}`;

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  db = new PrismaClient({ adapter });
});

beforeEach(async () => {
  await db.session.deleteMany();
  await db.userEntryState.deleteMany();
  await db.userAlbumState.deleteMany();
  await db.userArtistState.deleteMany();
  await db.userFestivalEdition.deleteMany();
  await db.festivalEntryArtist.deleteMany();
  await db.festivalEntry.deleteMany();
  await db.album.deleteMany();
  await db.artist.deleteMany();
  await db.festivalEdition.deleteMany();
  await db.festival.deleteMany();
  await db.user.deleteMany();

  const user = await db.user.create({
    data: {
      username: "tester",
      normalizedUsername: "tester",
      email: "tester@example.com",
      normalizedEmail: "tester@example.com",
      passwordHash: "scrypt$16384$8$1$00$00",
      role: "ADMIN",
    },
  });
  testUserId = user.id;
});

afterAll(async () => {
  await db.$disconnect();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("integration: services against real database", () => {
  it("persists structured location metadata and dates on FestivalEdition without exposing extra fields in summary", async () => {
    const rewire = await createFestival(
      {
        name: "Rewire",
        year: 2027,
        location: "La Haya",
        locationProvince: "Gemeente Den Haag",
        locationRegion: "Holanda Meridional",
        locationCountry: "Países Bajos",
        locationCountryCode: "NL",
        locationLatitude: 52.07667,
        locationLongitude: 4.29861,
        locationPlaceId: "2747373",
        startDate: new Date("2027-04-08T00:00:00.000Z"),
        endDate: new Date("2027-04-11T00:00:00.000Z"),
      },
      testUserId,
      db,
    );

    expect(rewire.location).toBe("La Haya");
    expect(rewire.locationProvince).toBe("Gemeente Den Haag");
    expect(rewire.locationRegion).toBe("Holanda Meridional");
    expect(rewire.locationCountry).toBe("Países Bajos");
    expect(rewire.locationCountryCode).toBe("NL");
    expect(rewire.locationLatitude).toBeCloseTo(52.07667);
    expect(rewire.locationLongitude).toBeCloseTo(4.29861);
    expect(rewire.locationPlaceId).toBe("2747373");
    expect(rewire.startDate?.toISOString().slice(0, 10)).toBe("2027-04-08");
    expect(rewire.endDate?.toISOString().slice(0, 10)).toBe("2027-04-11");

    const summary = toFestivalSummary(rewire);
    expect(summary).toEqual({
      id: rewire.id,
      festivalId: rewire.festival.id,
      slug: "rewire-2027",
      name: "Rewire",
      year: 2027,
      location: "La Haya",
    });
  });

  it("deduplicates artists across multiple festivals and builds cross-festival history", async () => {
    const rewire = await createFestival(
      { name: "Rewire", year: 2027, location: "La Haya" },
      testUserId,
      db,
    );
    const unsound = await createFestival(
      { name: "Unsound", year: 2026, location: "Cracovia" },
      testUserId,
      db,
    );

    const rewireRows = parseRawLineup(
      "Tim Hecker | Viernes 09 | Grote Kerk\nSarah Davachi 'The Will of Tongues' | Domingo 11 | Lutherse Kerk",
    ).map((r) => ({ ...r, included: true }));

    const unsoundRows = parseRawLineup("TIM HECKER | Saturday | Hotel Forum").map((r) => ({
      ...r,
      included: true,
    }));

    const first = await importFestivalLineup(
      { festivalId: rewire.id, rows: rewireRows },
      { db, enqueueSync: false },
    );
    const second = await importFestivalLineup(
      { festivalId: unsound.id, rows: unsoundRows },
      { db, enqueueSync: false },
    );

    expect(first.newArtistsCount).toBe(2);
    expect(second.newArtistsCount).toBe(0);

    const allArtists = await db.artist.findMany();
    expect(allArtists).toHaveLength(2);

    const tim = allArtists.find((a) => a.normalizedName === "tim hecker");
    if (!tim) {
      throw new Error("Expected Tim Hecker artist");
    }

    const detail = await getArtistDetail(testUserId, tim.id, db);
    expect(detail?.festivals).toHaveLength(2);
    expect(detail?.festivals.map((f) => f.festivalSlug)).toEqual(["rewire-2027", "unsound-2026"]);
  });

  it("links N:M collaborations without duplicating artists and supports dual ratings", async () => {
    const rewire = await createFestival({ name: "Rewire", year: 2027 }, testUserId, db);
    const rows = parseRawLineup(
      "Mabe Fratti & Bill Orcutt | Sábado 10 | Korzo\nMabe Fratti (solo) | Domingo 11 | Amare",
    ).map((r) => ({ ...r, included: true }));

    await importFestivalLineup({ festivalId: rewire.id, rows }, { db, enqueueSync: false });

    const artists = await db.artist.findMany();
    expect(artists).toHaveLength(2);

    const mabe = artists.find((a) => a.normalizedName === "mabe fratti");
    if (!mabe) {
      throw new Error("Expected Mabe Fratti artist");
    }

    const ratedMabe = await updateArtistRating(testUserId, { artistId: mabe.id, rating: 5 }, db);
    expect(ratedMabe.rating).toBe(5);
    expect(ratedMabe.status).toBe("RATED");

    await updateArtistNotes(
      testUserId,
      { artistId: mabe.id, notes: "Cello eléctrico hipnótico imprescindible" },
      db,
    );

    const entries = await listFestivalEntries(testUserId, rewire.id, {}, db);
    expect(entries).toHaveLength(2);
    const collabEntry = entries.find((e) => e.billingName.includes("Bill Orcutt"));
    if (!collabEntry) {
      throw new Error("Expected collaboration entry");
    }
    expect(collabEntry.artists).toHaveLength(2);

    const updatedEntry = await updateEntrySchedule(
      testUserId,
      {
        entryId: collabEntry.id,
        setTime: "19:30",
        liveRating: 4,
        liveNotes: "Sonido brutal en Korzo",
      },
      db,
    );
    expect(updatedEntry.liveRating).toBe(4);
    expect(updatedEntry.liveNotes).toBe("Sonido brutal en Korzo");

    const byNotes = await listFestivalEntries(
      testUserId,
      rewire.id,
      { query: "hipnotico", rating: "MUST" },
      db,
    );
    expect(byNotes).toHaveLength(2);
  });

  it("pins albums to top of discography shelf and preserves rating/notes on disambiguation", async () => {
    const rewire = await createFestival({ name: "Rewire", year: 2027 }, testUserId, db);
    await importFestivalLineup(
      {
        festivalId: rewire.id,
        rows: [
          {
            billingName: "Helen",
            artistNames: ["Helen"],
            subtitle: null,
            day: "Domingo 11",
            stage: "PAARD",
            setTime: null,
            included: true,
          },
        ],
      },
      { db, enqueueSync: false },
    );

    const helen = await db.artist.findFirstOrThrow({ where: { normalizedName: "helen" } });
    await updateArtistRating(testUserId, { artistId: helen.id, rating: 5 }, db);
    await updateArtistNotes(
      testUserId,
      { artistId: helen.id, notes: "Proyecto de Liz Harris" },
      db,
    );

    const olderAlbum = await db.album.create({
      data: {
        artistId: helen.id,
        mbid: "rg-old",
        title: "The Original Faces",
        releaseYear: 2015,
        releaseType: "ALBUM",
      },
    });
    await db.album.create({
      data: {
        artistId: helen.id,
        mbid: "rg-new",
        title: "Wrong Artist Album",
        releaseYear: 2024,
        releaseType: "ALBUM",
      },
    });

    await updateAlbumPin(testUserId, { albumId: olderAlbum.id, isPinned: true }, db);
    await updateAlbumCustomUrl(
      testUserId,
      { albumId: olderAlbum.id, customUrl: "https://helen.bandcamp.com/album/the-original-faces" },
      db,
    );

    const beforeDisambig = await getArtistDetail(testUserId, helen.id, db);
    expect(beforeDisambig?.albums[0]?.id).toBe(olderAlbum.id);
    expect(beforeDisambig?.albums[0]?.customUrl).toBe(
      "https://helen.bandcamp.com/album/the-original-faces",
    );

    const newMbid = "11111111-1111-4111-8111-111111111111";
    const updated = await disambiguateArtist(
      { artistId: helen.id, mbid: newMbid, country: "US" },
      { db, enqueueSync: false },
    );

    expect(updated.mbid).toBe(newMbid);
    expect(updated.country).toBe("US");
    expect(updated.syncStatus).toBe("PENDING");

    // User's rating, status, and notes remain preserved
    const afterDisambig = await getArtistDetail(testUserId, helen.id, db);
    expect(afterDisambig?.rating).toBe(5);
    expect(afterDisambig?.status).toBe("RATED");
    expect(afterDisambig?.notes).toBe("Proyecto de Liz Harris");

    const remainingAlbums = await db.album.findMany({ where: { artistId: helen.id } });
    expect(remainingAlbums).toHaveLength(1);
    expect(remainingAlbums[0]?.id).toBe(olderAlbum.id);

    const other = await db.artist.create({
      data: { name: "Other Helen", normalizedName: "other helen" },
    });
    await expect(
      disambiguateArtist(
        { artistId: other.id, mbid: newMbid, country: "GB" },
        { db, enqueueSync: false },
      ),
    ).rejects.toBeInstanceOf(DomainError);

    await expect(
      importFestivalLineup(
        {
          festivalId: "non-existent-festival-id",
          rows: [
            {
              billingName: "Test",
              artistNames: ["Test"],
              subtitle: null,
              day: null,
              stage: null,
              setTime: null,
              included: true,
            },
          ],
        },
        { db, enqueueSync: false },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
