import { DomainError } from "@/domain/errors";
import {
  computeLineupDiff,
  hasPendingDiffChanges,
  type PendingLineupDiff,
} from "@/domain/lineup-diff";
import {
  type ApplyLineupDiffInput,
  applyLineupDiffSchema,
  type UpdateFestivalSyncConfigInput,
  updateFestivalSyncConfigSchema,
} from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  type FetchLineupSourceOptions,
  fetchAndExtractFestivalLineup,
  validateLineupSourceUrl,
} from "@/server/clients/lineup-source";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { importFestivalLineup } from "@/server/services/importer";
import { getSyncQueue, type SyncQueue } from "@/server/sync/queue";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const globalForLineupSync = globalThis as typeof globalThis & {
  kueInFlightLineupSyncs?: Map<string, Promise<CheckFestivalLineupResult>>;
};

function getInFlightLineupSyncs(): Map<string, Promise<CheckFestivalLineupResult>> {
  globalForLineupSync.kueInFlightLineupSyncs ??= new Map();
  return globalForLineupSync.kueInFlightLineupSyncs;
}

export interface CheckFestivalLineupResult {
  status: "unchanged" | "applied" | "pending_review" | "up_to_date";
  method: PendingLineupDiff["method"] | null;
  addedCount: number;
  updatedCount: number;
  missingCount: number;
  newArtistsCount: number;
  pendingDiff: PendingLineupDiff | null;
}

export interface ApplyLineupDiffResult {
  createdEntriesCount: number;
  updatedEntriesCount: number;
  newArtistsCount: number;
}

export function parsePendingLineupDiff(raw: string | null | undefined): PendingLineupDiff | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingLineupDiff;
    if (
      parsed &&
      typeof parsed.checkedAt === "string" &&
      typeof parsed.sourceUrl === "string" &&
      Array.isArray(parsed.added) &&
      Array.isArray(parsed.updated) &&
      Array.isArray(parsed.missing)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function updateFestivalSyncConfig(
  rawInput: UpdateFestivalSyncConfigInput,
  db: PrismaClient = getDb(),
) {
  const input = updateFestivalSyncConfigSchema.parse(rawInput);
  const cleanedUrl = input.lineupSourceUrl?.trim() || null;

  if (cleanedUrl) {
    validateLineupSourceUrl(cleanedUrl);
  }
  if (input.autoSyncEnabled && !cleanedUrl) {
    throw new DomainError("Indica una URL del cartel para activar la actualización automática");
  }

  const current = await db.festivalEdition.findUnique({
    where: { id: input.festivalId },
    select: { id: true, lineupSourceUrl: true },
  });
  if (!current) {
    throw new DomainError("Edición de festival no encontrada");
  }

  const urlChanged = current.lineupSourceUrl !== cleanedUrl;

  return db.festivalEdition.update({
    where: { id: input.festivalId },
    data: {
      lineupSourceUrl: cleanedUrl,
      autoSyncEnabled: cleanedUrl ? input.autoSyncEnabled : false,
      autoSyncMode: input.autoSyncMode,
      syncIntervalHours: input.syncIntervalHours,
      ...(urlChanged
        ? {
            lastLineupContentHash: null,
            lastLineupSyncError: null,
            pendingLineupDiff: null,
          }
        : {}),
    },
  });
}

async function applyDiffChanges(
  editionId: string,
  diff: Pick<PendingLineupDiff, "added" | "updated">,
  options: {
    db?: PrismaClient | undefined;
    queue?: SyncQueue | undefined;
    enqueueSync?: boolean | undefined;
  } = {},
): Promise<ApplyLineupDiffResult> {
  const db = options.db ?? getDb();

  let createdEntriesCount = 0;
  let newArtistsCount = 0;

  if (diff.added.length > 0) {
    const importOptions: { db: PrismaClient; queue?: SyncQueue; enqueueSync?: boolean } = { db };
    if (options.queue !== undefined) {
      importOptions.queue = options.queue;
    }
    if (options.enqueueSync !== undefined) {
      importOptions.enqueueSync = options.enqueueSync;
    }

    const importResult = await importFestivalLineup(
      {
        festivalId: editionId,
        rows: diff.added.map((row) => ({
          billingName: row.billingName,
          artistNames: row.artistNames,
          subtitle: row.subtitle,
          day: row.day,
          stage: row.stage,
          setTime: row.setTime,
          included: true,
        })),
      },
      importOptions,
    );
    createdEntriesCount = importResult.createdEntriesCount;
    newArtistsCount = importResult.newArtistsCount;
  }

  let updatedEntriesCount = 0;
  if (diff.updated.length > 0) {
    await db.$transaction(async (tx) => {
      for (const item of diff.updated) {
        const data: {
          subtitle?: string;
          day?: string;
          stage?: string;
          setTime?: string;
        } = {};
        if (item.changes.subtitle) data.subtitle = item.changes.subtitle;
        if (item.changes.day) data.day = item.changes.day;
        if (item.changes.stage) data.stage = item.changes.stage;
        if (item.changes.setTime) data.setTime = item.changes.setTime;

        if (Object.keys(data).length === 0) {
          continue;
        }

        const updated = await tx.festivalEntry.updateMany({
          where: { id: item.entryId, editionId },
          data,
        });
        if (updated.count > 0) {
          updatedEntriesCount += 1;
        }
      }
    });
  }

  return {
    createdEntriesCount,
    updatedEntriesCount,
    newArtistsCount,
  };
}

export async function checkFestivalLineupSync(
  editionId: string,
  options: {
    force?: boolean | undefined;
    applyDirectly?: boolean | undefined;
    db?: PrismaClient | undefined;
    queue?: SyncQueue | undefined;
    enqueueSync?: boolean | undefined;
    fetchImpl?: FetchLineupSourceOptions["fetchImpl"];
    llmExtractor?: FetchLineupSourceOptions["llmExtractor"];
    geminiApiKey?: string | undefined;
    geminiModel?: string | undefined;
  } = {},
): Promise<CheckFestivalLineupResult> {
  const inFlight = getInFlightLineupSyncs();
  const existingPromise = inFlight.get(editionId);
  if (existingPromise) {
    return existingPromise;
  }

  const runPromise = runCheckFestivalLineupSync(editionId, options).finally(() => {
    if (inFlight.get(editionId) === runPromise) {
      inFlight.delete(editionId);
    }
  });
  inFlight.set(editionId, runPromise);
  return runPromise;
}

async function runCheckFestivalLineupSync(
  editionId: string,
  options: {
    force?: boolean | undefined;
    applyDirectly?: boolean | undefined;
    db?: PrismaClient | undefined;
    queue?: SyncQueue | undefined;
    enqueueSync?: boolean | undefined;
    fetchImpl?: FetchLineupSourceOptions["fetchImpl"];
    llmExtractor?: FetchLineupSourceOptions["llmExtractor"];
    geminiApiKey?: string | undefined;
    geminiModel?: string | undefined;
  },
): Promise<CheckFestivalLineupResult> {
  const db = options.db ?? getDb();
  const edition = await db.festivalEdition.findUnique({
    where: { id: editionId },
    include: {
      festival: { select: { name: true } },
      entries: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          artists: {
            orderBy: { position: "asc" },
            include: {
              artist: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });

  if (!edition) {
    throw new DomainError("Edición de festival no encontrada");
  }

  if (!edition.lineupSourceUrl) {
    throw new DomainError("Este festival no tiene configurada una URL de cartel");
  }

  let envGeminiApiKey = options.geminiApiKey;
  let envGeminiModel = options.geminiModel;
  if (envGeminiApiKey === undefined || envGeminiModel === undefined) {
    try {
      const env = getEnv();
      envGeminiApiKey ??= env.GEMINI_API_KEY;
      envGeminiModel ??= env.GEMINI_MODEL;
    } catch {
      // Allow tests without full env
    }
  }

  const now = new Date();

  try {
    const fetched = await fetchAndExtractFestivalLineup(edition.lineupSourceUrl, {
      festivalName: edition.festival.name,
      festivalYear: edition.year,
      previousContentHash: edition.lastLineupContentHash,
      ...(options.force !== undefined ? { force: options.force } : {}),
      ...(envGeminiApiKey !== undefined ? { geminiApiKey: envGeminiApiKey } : {}),
      ...(envGeminiModel !== undefined ? { geminiModel: envGeminiModel } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.llmExtractor !== undefined ? { llmExtractor: options.llmExtractor } : {}),
    });

    if (fetched.unchanged) {
      await db.festivalEdition.update({
        where: { id: edition.id },
        data: {
          lastLineupSyncAt: now,
          lastLineupSyncError: null,
        },
      });
      return {
        status: "unchanged",
        method: null,
        addedCount: 0,
        updatedCount: 0,
        missingCount: 0,
        newArtistsCount: 0,
        pendingDiff: parsePendingLineupDiff(edition.pendingLineupDiff),
      };
    }

    const existingSnapshots = edition.entries.map((entry) => ({
      id: entry.id,
      billingName: entry.billingName,
      subtitle: entry.subtitle,
      day: entry.day,
      stage: entry.stage,
      setTime: entry.setTime,
      artistNames: entry.artists.map((link) => link.artist.name),
    }));

    const diffParts = computeLineupDiff(existingSnapshots, fetched.entries);
    const fullDiff: PendingLineupDiff = {
      checkedAt: now.toISOString(),
      sourceUrl: edition.lineupSourceUrl,
      method: fetched.method ?? "gemini",
      ...diffParts,
    };

    if (!hasPendingDiffChanges(diffParts)) {
      await db.festivalEdition.update({
        where: { id: edition.id },
        data: {
          lastLineupSyncAt: now,
          lastLineupContentHash: fetched.contentHash,
          lastLineupSyncError: null,
          pendingLineupDiff: null,
        },
      });
      return {
        status: "up_to_date",
        method: fullDiff.method,
        addedCount: 0,
        updatedCount: 0,
        missingCount: 0,
        newArtistsCount: 0,
        pendingDiff: null,
      };
    }

    if (options.applyDirectly || edition.autoSyncMode === "AUTO") {
      const applied = await applyDiffChanges(
        edition.id,
        { added: diffParts.added, updated: diffParts.updated },
        {
          db,
          queue: options.queue ?? getSyncQueue(),
          ...(options.enqueueSync !== undefined ? { enqueueSync: options.enqueueSync } : {}),
        },
      );

      const remainingDiff: PendingLineupDiff | null =
        diffParts.missing.length > 0
          ? {
              ...fullDiff,
              added: [],
              updated: [],
            }
          : null;

      await db.festivalEdition.update({
        where: { id: edition.id },
        data: {
          lastLineupSyncAt: now,
          lastLineupContentHash: fetched.contentHash,
          lastLineupSyncError: null,
          pendingLineupDiff: remainingDiff ? JSON.stringify(remainingDiff) : null,
        },
      });

      return {
        status: "applied",
        method: fullDiff.method,
        addedCount: applied.createdEntriesCount,
        updatedCount: applied.updatedEntriesCount,
        missingCount: diffParts.missing.length,
        newArtistsCount: applied.newArtistsCount,
        pendingDiff: remainingDiff,
      };
    }

    await db.festivalEdition.update({
      where: { id: edition.id },
      data: {
        lastLineupSyncAt: now,
        lastLineupContentHash: fetched.contentHash,
        lastLineupSyncError: null,
        pendingLineupDiff: JSON.stringify(fullDiff),
      },
    });

    return {
      status: "pending_review",
      method: fullDiff.method,
      addedCount: fullDiff.added.length,
      updatedCount: fullDiff.updated.length,
      missingCount: fullDiff.missing.length,
      newArtistsCount: 0,
      pendingDiff: fullDiff,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar";
    await db.festivalEdition.update({
      where: { id: edition.id },
      data: {
        lastLineupSyncAt: now,
        lastLineupSyncError: message.slice(0, 500),
      },
    });
    if (error instanceof DomainError) {
      throw error;
    }
    throw new DomainError(message);
  }
}

export async function applyPendingLineupDiff(
  rawInput: ApplyLineupDiffInput,
  options: { db?: PrismaClient; queue?: SyncQueue; enqueueSync?: boolean } = {},
): Promise<ApplyLineupDiffResult> {
  const input = applyLineupDiffSchema.parse(rawInput);
  const db = options.db ?? getDb();

  const edition = await db.festivalEdition.findUnique({
    where: { id: input.festivalId },
    select: { id: true, pendingLineupDiff: true },
  });
  if (!edition) {
    throw new DomainError("Edición de festival no encontrada");
  }

  const pending = parsePendingLineupDiff(edition.pendingLineupDiff);
  if (!pending) {
    return { createdEntriesCount: 0, updatedEntriesCount: 0, newArtistsCount: 0 };
  }

  const selectedAdded =
    input.addedIndexes !== undefined
      ? pending.added.filter((_, index) => input.addedIndexes?.includes(index))
      : pending.added;

  const selectedUpdated =
    input.updatedEntryIds !== undefined
      ? pending.updated.filter((item) => input.updatedEntryIds?.includes(item.entryId))
      : pending.updated;

  const applied = await applyDiffChanges(
    edition.id,
    { added: selectedAdded, updated: selectedUpdated },
    {
      db,
      queue: options.queue ?? getSyncQueue(),
      ...(options.enqueueSync !== undefined ? { enqueueSync: options.enqueueSync } : {}),
    },
  );

  await db.festivalEdition.update({
    where: { id: edition.id },
    data: { pendingLineupDiff: null },
  });

  return applied;
}

export async function dismissPendingLineupDiff(
  editionId: string,
  db: PrismaClient = getDb(),
): Promise<void> {
  const result = await db.festivalEdition.updateMany({
    where: { id: editionId },
    data: { pendingLineupDiff: null },
  });
  if (result.count === 0) {
    throw new DomainError("Edición de festival no encontrada");
  }
}

export async function runScheduledLineupSyncs(
  options: { now?: Date; db?: PrismaClient; queue?: SyncQueue; enqueueSync?: boolean } = {},
): Promise<{ checked: number; failed: number }> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();

  const candidates = await db.festivalEdition.findMany({
    where: {
      autoSyncEnabled: true,
      lineupSourceUrl: { not: null },
    },
    select: {
      id: true,
      endDate: true,
      syncIntervalHours: true,
      lastLineupSyncAt: true,
    },
    orderBy: [{ lastLineupSyncAt: "asc" }],
  });

  let checked = 0;
  let failed = 0;

  for (const edition of candidates) {
    if (edition.endDate && edition.endDate.getTime() + DAY_MS < now.getTime()) {
      continue;
    }

    const intervalMs = Math.max(1, edition.syncIntervalHours) * HOUR_MS;
    if (
      edition.lastLineupSyncAt &&
      now.getTime() - edition.lastLineupSyncAt.getTime() < intervalMs
    ) {
      continue;
    }

    try {
      await checkFestivalLineupSync(edition.id, {
        db,
        ...(options.queue !== undefined ? { queue: options.queue } : {}),
        ...(options.enqueueSync !== undefined ? { enqueueSync: options.enqueueSync } : {}),
      });
      checked += 1;
    } catch (error: unknown) {
      failed += 1;
      if (process.env.NODE_ENV !== "test") {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[KUE] Scheduled lineup sync failed for edition ${edition.id}: ${message}`);
      }
    }
  }

  return { checked, failed };
}
