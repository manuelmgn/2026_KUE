import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/errors";
import { PrismaClient } from "@/generated/prisma/client";
import { listFestivalEntries } from "@/server/services/entries";
import { createFestival } from "@/server/services/festivals";
import { importFestivalLineup } from "@/server/services/importer";
import {
  applyPendingLineupDiff,
  checkFestivalLineupSync,
  dismissPendingLineupDiff,
  runScheduledLineupSyncs,
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
  it("supports REVIEW mode diffing, unchanged hash short-circuit, and selective apply", async () => {
    const festival = await createFestival({ name: "Rewire", year: 2027, location: "La Haya" }, db);

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

    await updateFestivalSyncConfig(
      {
        festivalId: festival.id,
        lineupSourceUrl: "https://example.com/rewire-2027.txt",
        autoSyncEnabled: true,
        autoSyncMode: "REVIEW",
        syncIntervalHours: 24,
      },
      db,
    );

    const mockFetch = vi.fn(
      async () =>
        new Response("Mabe Fratti | Friday | Amare\nAutechre | Saturday | Paard\n", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    );

    const checkResult = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: mockFetch,
    });

    expect(checkResult.status).toBe("pending_review");
    expect(checkResult.addedCount).toBe(1);
    expect(checkResult.updatedCount).toBe(1);
    expect(checkResult.missingCount).toBe(0);

    // Repeating with unchanged content short-circuits
    const secondCheck = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: mockFetch,
    });
    expect(secondCheck.status).toBe("unchanged");
    expect(secondCheck.pendingDiff?.added).toHaveLength(1);

    // Apply all pending changes
    const applied = await applyPendingLineupDiff(
      { festivalId: festival.id },
      { db, enqueueSync: false },
    );
    expect(applied).toEqual({
      createdEntriesCount: 1,
      updatedEntriesCount: 1,
      newArtistsCount: 1,
    });

    const entries = await listFestivalEntries(festival.id, {}, db);
    expect(entries).toHaveLength(2);
    const mabe = entries.find((e) => e.billingName === "Mabe Fratti");
    expect(mabe?.day).toBe("Friday");
    expect(mabe?.stage).toBe("Amare");
  });

  it("applies additions automatically in AUTO mode while keeping missing entries for manual review", async () => {
    const festival = await createFestival(
      { name: "Unsound", year: 2027, location: "Cracovia" },
      db,
    );

    await importFestivalLineup(
      {
        festivalId: festival.id,
        rows: [
          {
            billingName: "Removed Act",
            artistNames: ["Removed Act"],
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
        lineupSourceUrl: "https://example.com/unsound.txt",
        autoSyncEnabled: true,
        autoSyncMode: "AUTO",
        syncIntervalHours: 12,
      },
      db,
    );

    const result = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: async () =>
        new Response("Kali Malone\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });

    expect(result.status).toBe("applied");
    expect(result.addedCount).toBe(1);
    expect(result.missingCount).toBe(1);
    // Missing entries are never auto-deleted
    const entries = await listFestivalEntries(festival.id, {}, db);
    expect(entries).toHaveLength(2);

    // Dismissing clears pending diff, and unknown festival throws DomainError
    await dismissPendingLineupDiff(festival.id, db);
    await expect(dismissPendingLineupDiff("non-existent-id", db)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("skips ended festivals in runScheduledLineupSyncs", async () => {
    const pastFestival = await createFestival(
      {
        name: "Past Fest",
        year: 2025,
        startDate: new Date("2025-04-01T00:00:00.000Z"),
        endDate: new Date("2025-04-03T00:00:00.000Z"),
      },
      db,
    );

    await updateFestivalSyncConfig(
      {
        festivalId: pastFestival.id,
        lineupSourceUrl: "https://example.com/past.txt",
        autoSyncEnabled: true,
        autoSyncMode: "REVIEW",
        syncIntervalHours: 24,
      },
      db,
    );

    const scheduled = await runScheduledLineupSyncs({
      db,
      now: new Date("2026-11-26T12:00:00.000Z"),
      enqueueSync: false,
    });
    expect(scheduled).toEqual({ checked: 0, failed: 0 });
  });

  it("supports creating a festival with lineupSourceUrl for one-time import (applyDirectly)", async () => {
    const festival = await createFestival(
      {
        name: "Primavera",
        year: 2027,
        lineupSourceUrl: "https://example.com/primavera.txt",
        autoSyncEnabled: false,
        syncIntervalHours: 24,
      },
      db,
    );

    expect(festival.lineupSourceUrl).toBe("https://example.com/primavera.txt");
    expect(festival.autoSyncEnabled).toBe(false);

    const checkResult = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      applyDirectly: true,
      fetchImpl: async () =>
        new Response("FKA twigs\nFour Tet", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });

    expect(checkResult.status).toBe("applied");
    expect(checkResult.addedCount).toBe(2);

    const entries = await listFestivalEntries(festival.id, {}, db);
    expect(entries).toHaveLength(2);
  });
});
