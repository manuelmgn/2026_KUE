import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { updateArtistNotes, updateArtistRating } from "@/server/services/artists";
import { listFestivalEntries } from "@/server/services/entries";
import { createFestival } from "@/server/services/festivals";
import { importFestivalLineup } from "@/server/services/importer";
import {
  applyPendingLineupDiff,
  checkFestivalLineupSync,
  updateFestivalSyncConfig,
} from "@/server/services/lineup-sync";

let tempDir = "";
let db: PrismaClient;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-sync-int-db-"));
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

describe("integration: festival lineup auto-sync", () => {
  it("stores pending diff in REVIEW mode and applies changes without touching ratings or notes", async () => {
    const festival = await createFestival({ name: "Rewire", year: 2027 }, db);
    await importFestivalLineup(
      {
        festivalId: festival.id,
        rows: [
          {
            billingName: "Mabe Fratti",
            artistNames: ["Mabe Fratti"],
            subtitle: null,
            day: null,
            stage: null,
            setTime: null,
            included: true,
          },
        ],
      },
      { db, enqueueSync: false },
    );

    const existingArtist = await db.artist.findFirstOrThrow({
      where: { name: "Mabe Fratti" },
    });
    await updateArtistRating({ artistId: existingArtist.id, rating: 5 }, db);
    await updateArtistNotes({ artistId: existingArtist.id, notes: "Imprescindible" }, db);

    await updateFestivalSyncConfig(
      {
        festivalId: festival.id,
        lineupSourceUrl: "https://example.com/rewire-2027",
        autoSyncEnabled: true,
        autoSyncMode: "REVIEW",
        syncIntervalHours: 24,
      },
      db,
    );

    const htmlWave2 = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "MusicFestival",
              "subEvent": [
                {
                  "@type": "MusicEvent",
                  "startDate": "2027-04-09T21:00:00+02:00",
                  "location": { "@type": "Place", "name": "Amare" },
                  "performer": [
                    { "@type": "Person", "name": "Mabe Fratti" },
                    { "@type": "MusicGroup", "name": "Autechre" }
                  ]
                }
              ]
            }
          </script>
        </head>
        <body>Rewire Wave 2</body>
      </html>
    `;

    const checkResult = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: async () =>
        new Response(htmlWave2, { status: 200, headers: { "content-type": "text/html" } }),
    });

    expect(checkResult.status).toBe("pending_review");
    expect(checkResult.addedCount).toBe(1);
    expect(checkResult.updatedCount).toBe(1);

    const applied = await applyPendingLineupDiff(
      { festivalId: festival.id },
      { db, enqueueSync: false },
    );
    expect(applied.createdEntriesCount).toBe(1);
    expect(applied.updatedEntriesCount).toBe(1);
    expect(applied.newArtistsCount).toBe(1);

    const entries = await listFestivalEntries(festival.id, {}, db);
    expect(entries).toHaveLength(2);

    const mabeEntry = entries.find((e) => e.billingName === "Mabe Fratti");
    expect(mabeEntry?.stage).toBe("Amare");
    expect(mabeEntry?.setTime).toBe("21:00");
    expect(mabeEntry?.artists[0]?.artist.rating).toBe(5);
    expect(mabeEntry?.artists[0]?.artist.notes).toBe("Imprescindible");

    // Re-checking same HTML short-circuits via content hash
    const unchanged = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: async () =>
        new Response(htmlWave2, { status: 200, headers: { "content-type": "text/html" } }),
    });
    expect(unchanged.status).toBe("unchanged");
  });

  it("applies new acts automatically in AUTO mode while never auto-deleting missing acts", async () => {
    const festival = await createFestival({ name: "Sónar", year: 2027 }, db);
    await importFestivalLineup(
      {
        festivalId: festival.id,
        rows: [
          {
            billingName: "Legacy Act",
            artistNames: ["Legacy Act"],
            subtitle: null,
            day: null,
            stage: null,
            setTime: null,
            included: true,
          },
        ],
      },
      { db, enqueueSync: false },
    );

    await updateFestivalSyncConfig(
      {
        festivalId: festival.id,
        lineupSourceUrl: "https://example.com/sonar.txt",
        autoSyncEnabled: true,
        autoSyncMode: "AUTO",
        syncIntervalHours: 12,
      },
      db,
    );

    const checkResult = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: async () =>
        new Response("Arca\nOneohtrix Point Never", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });

    expect(checkResult.status).toBe("applied");
    expect(checkResult.addedCount).toBe(2);
    expect(checkResult.missingCount).toBe(1);
    expect(checkResult.pendingDiff?.missing).toHaveLength(1);

    const entries = await listFestivalEntries(festival.id, {}, db);
    // Original entry is still preserved (never auto-deleted) + 2 newly added
    expect(entries).toHaveLength(3);
  });
});
