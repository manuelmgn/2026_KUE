import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
import { notifyFestivalLineupUpdated } from "@/server/services/notifications";
import { getSyncQueue, type SyncQueue } from "@/server/sync/queue";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const MAX_AUTO_SYNC_DAYS = 180; // Hard 6-month lifetime cap for automatic updates
const MAX_AUTO_SYNC_DURATION_MS = MAX_AUTO_SYNC_DAYS * DAY_MS;

export function isEditionAutoSyncExpired(
  edition: { createdAt: Date; endDate: Date | null },
  now: Date = new Date(),
): boolean {
  if (edition.createdAt.getTime() + MAX_AUTO_SYNC_DURATION_MS <= now.getTime()) {
    return true;
  }
  if (edition.endDate && edition.endDate.getTime() + DAY_MS < now.getTime()) {
    return true;
  }
  return false;
}

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
    select: { id: true, lineupSourceUrl: true, createdAt: true, endDate: true },
  });
  if (!current) {
    throw new DomainError("Edición de festival no encontrada");
  }

  if (input.autoSyncEnabled) {
    const now = new Date();
    if (current.createdAt.getTime() + MAX_AUTO_SYNC_DURATION_MS <= now.getTime()) {
      throw new DomainError(
        "La actualización automática tiene un límite máximo de 6 meses desde la creación del festival y ya ha expirado",
      );
    }
    if (current.endDate && current.endDate.getTime() + DAY_MS < now.getTime()) {
      throw new DomainError(
        "No se puede activar la actualización automática en un festival ya finalizado",
      );
    }
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
    actorUserId?: string | null | undefined;
  } = {},
): Promise<ApplyLineupDiffResult> {
  const db = options.db ?? getDb();

  let createdEntriesCount = 0;
  let newArtistsCount = 0;

  if (diff.added.length > 0) {
    const importOptions: {
      db: PrismaClient;
      queue?: SyncQueue;
      enqueueSync?: boolean;
      suppressNotifications: boolean;
    } = { db, suppressNotifications: true };
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

  if (createdEntriesCount > 0 || updatedEntriesCount > 0) {
    await notifyFestivalLineupUpdated(
      editionId,
      { addedCount: createdEntriesCount, updatedCount: updatedEntriesCount },
      { excludeUserId: options.actorUserId ?? null, db },
    );
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
    actorUserId?: string | null | undefined;
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
    actorUserId?: string | null | undefined;
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

  const effectiveForce = options.force === true || edition.entries.length === 0;

  try {
    const fetched = await fetchAndExtractFestivalLineup(edition.lineupSourceUrl, {
      festivalName: edition.festival.name,
      festivalYear: edition.year,
      previousContentHash: edition.lastLineupContentHash,
      force: effectiveForce,
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
          ...(options.actorUserId !== undefined ? { actorUserId: options.actorUserId } : {}),
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
  options: {
    db?: PrismaClient;
    queue?: SyncQueue;
    enqueueSync?: boolean;
    actorUserId?: string | null;
  } = {},
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
      ...(options.actorUserId !== undefined ? { actorUserId: options.actorUserId } : {}),
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
      createdAt: true,
      endDate: true,
      syncIntervalHours: true,
      lastLineupSyncAt: true,
    },
    orderBy: [{ lastLineupSyncAt: "asc" }],
  });

  let checked = 0;
  let failed = 0;

  for (const edition of candidates) {
    if (isEditionAutoSyncExpired(edition, now)) {
      await db.festivalEdition.update({
        where: { id: edition.id },
        data: { autoSyncEnabled: false },
      });
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

const ONE_TIME_EMPTY_RECHECK_MARKER = ".recheck-empty-lineups-v2.done";
const ONE_TIME_EMPTY_RECHECK_SETTING_KEY = "recheck_empty_lineups_v2_done";

function resolveOneTimeRecheckMarkerPath(overridePath?: string): string {
  if (overridePath) {
    return overridePath;
  }
  const mediaDir = path.resolve(
    /* turbopackIgnore: true */ process.env.MEDIA_DIR?.trim() || "./data/media",
  );
  return path.join(mediaDir, ONE_TIME_EMPTY_RECHECK_MARKER);
}

export interface OneTimeEmptyLineupRecheckResult {
  skipped: boolean;
  checked: number;
  imported: number;
  failed: number;
}

/**
 * Runs a one-time forced lineup re-import for all festival editions that have a `lineupSourceUrl`
 * but currently have 0 entries. Persists a marker file in `MEDIA_DIR` so subsequent restarts
 * and `docker compose up` runs skip it automatically.
 */
export async function runOneTimeEmptyLineupRecheck(
  options: {
    db?: PrismaClient;
    markerPath?: string;
    queue?: SyncQueue;
    enqueueSync?: boolean;
    fetchImpl?: FetchLineupSourceOptions["fetchImpl"];
    llmExtractor?: FetchLineupSourceOptions["llmExtractor"];
    geminiApiKey?: string;
    geminiModel?: string;
  } = {},
): Promise<OneTimeEmptyLineupRecheckResult> {
  const db = options.db ?? getDb();
  const useDbMarker = !options.markerPath && Boolean(process.env.VERCEL);
  const markerPath = useDbMarker ? null : resolveOneTimeRecheckMarkerPath(options.markerPath);

  if (useDbMarker) {
    const existing = await db.appSetting
      .findUnique({ where: { key: ONE_TIME_EMPTY_RECHECK_SETTING_KEY } })
      .catch(() => null);
    if (existing) {
      return { skipped: true, checked: 0, imported: 0, failed: 0 };
    }
  } else if (markerPath) {
    try {
      await access(markerPath);
      return { skipped: true, checked: 0, imported: 0, failed: 0 };
    } catch {
      // Marker does not exist yet -> run once
    }
  }

  const candidates = await db.festivalEdition.findMany({
    where: {
      lineupSourceUrl: { not: null },
      entries: { none: {} },
    },
    select: {
      id: true,
      year: true,
      lineupSourceUrl: true,
      festival: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  let checked = 0;
  let imported = 0;
  let failed = 0;

  if (process.env.NODE_ENV !== "test") {
    console.info(
      `[KUE] One-time forced lineup recheck started (${candidates.length} empty editions with source URL).`,
    );
  }

  for (const edition of candidates) {
    if (!edition.lineupSourceUrl?.trim()) {
      continue;
    }

    try {
      const result = await checkFestivalLineupSync(edition.id, {
        force: true,
        applyDirectly: true,
        db,
        ...(options.queue !== undefined ? { queue: options.queue } : {}),
        ...(options.enqueueSync !== undefined ? { enqueueSync: options.enqueueSync } : {}),
        ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.llmExtractor !== undefined ? { llmExtractor: options.llmExtractor } : {}),
        ...(options.geminiApiKey !== undefined ? { geminiApiKey: options.geminiApiKey } : {}),
        ...(options.geminiModel !== undefined ? { geminiModel: options.geminiModel } : {}),
      });
      checked += 1;
      imported += result.addedCount;
      if (process.env.NODE_ENV !== "test") {
        console.info(
          `[KUE] One-time lineup recheck OK: ${edition.festival.name} ${edition.year} (+${result.addedCount} entries)`,
        );
      }
    } catch (error: unknown) {
      failed += 1;
      if (process.env.NODE_ENV !== "test") {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[KUE] One-time lineup recheck failed for ${edition.festival.name} ${edition.year}: ${message}`,
        );
      }
    }
  }

  const markerPayload = JSON.stringify({
    completedAt: new Date().toISOString(),
    checked,
    imported,
    failed,
  });

  if (useDbMarker) {
    try {
      await db.appSetting.upsert({
        where: { key: ONE_TIME_EMPTY_RECHECK_SETTING_KEY },
        create: { key: ONE_TIME_EMPTY_RECHECK_SETTING_KEY, value: markerPayload },
        update: { value: markerPayload },
      });
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== "test") {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[KUE] Could not save one-time recheck marker in DB: ${message}`);
      }
    }
  } else if (markerPath) {
    try {
      await mkdir(path.dirname(markerPath), { recursive: true });
      await writeFile(markerPath, markerPayload, "utf8");
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== "test") {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[KUE] Could not write one-time recheck marker (${markerPath}): ${message}`);
      }
    }
  }

  return { skipped: false, checked, imported, failed };
}
