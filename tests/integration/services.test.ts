import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

let tempDir = "";
let db: PrismaClient;

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
  await db.festivalEntryArtist.deleteMany();
  await db.festivalEntry.deleteMany();
  await db.album.deleteMany();
  await db.artist.deleteMany();
  await db.festival.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("integration: services against real database", () => {
  it("deduplicates artists across multiple festivals and builds cross-festival history", async () => {
    const rewire = await createFestival({ name: "Rewire", year: 2027, location: "La Haya" }, db);
    const unsound = await createFestival({ name: "Unsound", year: 2026, location: "Cracovia" }, db);

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
    expect(second.newArtistsCount).toBe(0); // Tim Hecker reused!

    const allArtists = await db.artist.findMany();
    expect(allArtists).toHaveLength(2);

    const tim = allArtists.find((a) => a.normalizedName === "tim hecker");
    if (!tim) {
      throw new Error("Expected Tim Hecker artist");
    }

    const detail = await getArtistDetail(tim.id, db);
    expect(detail?.festivals).toHaveLength(2);
    expect(detail?.festivals.map((f) => f.festivalSlug)).toEqual(["rewire-2027", "unsound-2026"]);
  });

  it("links N:M collaborations without duplicating artists and supports dual ratings", async () => {
    const rewire = await createFestival({ name: "Rewire", year: 2027 }, db);
    const rows = parseRawLineup(
      "Mabe Fratti & Bill Orcutt | Sábado 10 | Korzo\nMabe Fratti (solo) | Domingo 11 | Amare",
    ).map((r) => ({ ...r, included: true }));

    await importFestivalLineup({ festivalId: rewire.id, rows }, { db, enqueueSync: false });

    const artists = await db.artist.findMany();
    expect(artists).toHaveLength(2); // Mabe Fratti + Bill Orcutt

    const mabe = artists.find((a) => a.normalizedName === "mabe fratti");
    if (!mabe) {
      throw new Error("Expected Mabe Fratti artist");
    }
    expect(mabe.status).toBe("PENDING");

    // Pre-festival rating promotes PENDING -> RATED
    const ratedMabe = await updateArtistRating({ artistId: mabe.id, rating: 5 }, db);
    expect(ratedMabe.rating).toBe(5);
    expect(ratedMabe.status).toBe("RATED");

    await updateArtistNotes(
      { artistId: mabe.id, notes: "Cello eléctrico hipnótico imprescindible" },
      db,
    );

    // Post-festival liveRating is independent per FestivalEntry
    const entries = await listFestivalEntries(rewire.id, {}, db);
    expect(entries).toHaveLength(2);
    const collabEntry = entries.find((e) => e.billingName.includes("Bill Orcutt"));
    if (!collabEntry) {
      throw new Error("Expected collaboration entry");
    }
    expect(collabEntry.artists).toHaveLength(2);

    const updatedEntry = await updateEntrySchedule(
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

    // Search filter matches personal notes and rating >= 4
    const byNotes = await listFestivalEntries(
      rewire.id,
      { query: "hipnotico", rating: "MUST" },
      db,
    );
    expect(byNotes).toHaveLength(2);
  });

  it("pins albums to top of discography shelf and preserves rating/notes on disambiguation", async () => {
    const rewire = await createFestival({ name: "Rewire", year: 2027 }, db);
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
    await updateArtistRating({ artistId: helen.id, rating: 5 }, db);
    await updateArtistNotes({ artistId: helen.id, notes: "Proyecto de Liz Harris" }, db);

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

    await updateAlbumPin({ albumId: olderAlbum.id, isPinned: true }, db);
    await updateAlbumCustomUrl(
      { albumId: olderAlbum.id, customUrl: "https://helen.bandcamp.com/album/the-original-faces" },
      db,
    );

    const beforeDisambig = await getArtistDetail(helen.id, db);
    expect(beforeDisambig?.albums[0]?.id).toBe(olderAlbum.id); // Pinned album moved to index 0!
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
    expect(updated.rating).toBe(5);
    expect(updated.status).toBe("RATED");
    expect(updated.notes).toBe("Proyecto de Liz Harris");
    expect(updated.syncStatus).toBe("PENDING");

    // Non-pinned wrong-artist album removed; pinned/customUrl album preserved
    const remainingAlbums = await db.album.findMany({ where: { artistId: helen.id } });
    expect(remainingAlbums).toHaveLength(1);
    expect(remainingAlbums[0]?.id).toBe(olderAlbum.id);
  });
});
