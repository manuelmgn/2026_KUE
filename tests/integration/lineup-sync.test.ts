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
  runOneTimeEmptyLineupRecheck,
  runScheduledLineupSyncs,
  updateFestivalSyncConfig,
} from "@/server/services/lineup-sync";

let tempDir = "";
let db: PrismaClient;
let testUserId = "";

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
      username: "synctester",
      normalizedUsername: "synctester",
      email: "synctester@example.com",
      normalizedEmail: "synctester@example.com",
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

describe("integration: festival lineup auto-sync", () => {
  it("supports REVIEW mode diffing, unchanged hash short-circuit, and selective apply", async () => {
    const festival = await createFestival(
      { name: "Rewire", year: 2027, location: "La Haya" },
      testUserId,
      db,
    );

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

    const secondCheck = await checkFestivalLineupSync(festival.id, {
      db,
      enqueueSync: false,
      fetchImpl: mockFetch,
    });
    expect(secondCheck.status).toBe("unchanged");
    expect(secondCheck.pendingDiff?.added).toHaveLength(1);

    const applied = await applyPendingLineupDiff(
      { festivalId: festival.id },
      { db, enqueueSync: false },
    );
    expect(applied).toEqual({
      createdEntriesCount: 1,
      updatedEntriesCount: 1,
      newArtistsCount: 1,
    });

    const entries = await listFestivalEntries(testUserId, festival.id, {}, db);
    expect(entries).toHaveLength(2);
    const mabe = entries.find((e) => e.billingName === "Mabe Fratti");
    expect(mabe?.day).toBe("Friday");
    expect(mabe?.stage).toBe("Amare");
  });

  it("applies additions automatically in AUTO mode while keeping missing entries for manual review", async () => {
    const festival = await createFestival(
      { name: "Unsound", year: 2027, location: "Cracovia" },
      testUserId,
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
    const entries = await listFestivalEntries(testUserId, festival.id, {}, db);
    expect(entries).toHaveLength(2);

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
      testUserId,
      db,
    );

    await db.festivalEdition.update({
      where: { id: pastFestival.id },
      data: {
        lineupSourceUrl: "https://example.com/past.txt",
        autoSyncEnabled: true,
        autoSyncMode: "REVIEW",
        syncIntervalHours: 24,
      },
    });

    const scheduled = await runScheduledLineupSyncs({
      db,
      now: new Date("2026-11-26T12:00:00.000Z"),
      enqueueSync: false,
    });
    expect(scheduled).toEqual({ checked: 0, failed: 0 });

    const persisted = await db.festivalEdition.findUnique({
      where: { id: pastFestival.id },
      select: { autoSyncEnabled: true },
    });
    expect(persisted?.autoSyncEnabled).toBe(false);
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
      testUserId,
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

    const entries = await listFestivalEntries(testUserId, festival.id, {}, db);
    expect(entries).toHaveLength(2);
  });

  it("force-rechecks only empty editions with lineupSourceUrl once and persists marker", async () => {
    const emptyWithUrl = await createFestival(
      {
        name: "Semibreve",
        year: 2026,
        lineupSourceUrl: "https://example.com/semibreve.txt",
        autoSyncEnabled: false,
      },
      testUserId,
      db,
    );
    const alreadyPopulated = await createFestival(
      {
        name: "WOS",
        year: 2026,
        lineupSourceUrl: "https://example.com/wos.txt",
        autoSyncEnabled: false,
      },
      testUserId,
      db,
    );
    await createFestival(
      {
        name: "No Link Fest",
        year: 2026,
      },
      testUserId,
      db,
    );

    await importFestivalLineup(
      {
        festivalId: alreadyPopulated.id,
        rows: [
          {
            billingName: "Existing Artist",
            artistNames: ["Existing Artist"],
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

    const fetchMock = vi.fn(
      async (_input: string | URL | Request) =>
        new Response("Suzan Peeters\nNoémi Büchi", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );

    const markerPath = path.join(tempDir, ".one-time-recheck.done");
    const first = await runOneTimeEmptyLineupRecheck({
      db,
      markerPath,
      enqueueSync: false,
      fetchImpl: fetchMock,
    });

    expect(first).toEqual({ skipped: false, checked: 1, imported: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/semibreve.txt");

    const importedEntries = await listFestivalEntries(testUserId, emptyWithUrl.id, {}, db);
    expect(importedEntries).toHaveLength(2);

    // Subsequent startup/compose up must skip because marker file exists
    const second = await runOneTimeEmptyLineupRecheck({
      db,
      markerPath,
      enqueueSync: false,
      fetchImpl: fetchMock,
    });
    expect(second).toEqual({ skipped: true, checked: 0, imported: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("permanently disables auto-sync after 6 months (180 days) and blocks re-enabling", async () => {
    const edition = await createFestival(
      {
        name: "Endless Fest",
        year: 2027,
        lineupSourceUrl: "https://example.com/endless.txt",
        autoSyncEnabled: true,
        syncIntervalHours: 24,
      },
      testUserId,
      db,
    );

    // Move createdAt 181 days into the past (past the 6-month hard cap)
    const oldCreatedAt = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    await db.festivalEdition.update({
      where: { id: edition.id },
      data: { createdAt: oldCreatedAt },
    });

    const scheduled = await runScheduledLineupSyncs({
      db,
      now: new Date(),
      enqueueSync: false,
    });
    expect(scheduled).toEqual({ checked: 0, failed: 0 });

    const updated = await db.festivalEdition.findUnique({
      where: { id: edition.id },
      select: { autoSyncEnabled: true },
    });
    expect(updated?.autoSyncEnabled).toBe(false);

    await expect(
      updateFestivalSyncConfig(
        {
          festivalId: edition.id,
          lineupSourceUrl: "https://example.com/endless.txt",
          autoSyncEnabled: true,
          autoSyncMode: "REVIEW",
          syncIntervalHours: 24,
        },
        db,
      ),
    ).rejects.toThrow("límite máximo de 6 meses");
  });
});
