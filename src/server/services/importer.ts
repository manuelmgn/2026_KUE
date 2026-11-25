import { normalizeArtistName } from "@/domain/artist-matching";
import { type ImportLineupInput, importLineupSchema } from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { getSyncQueue, type SyncQueue } from "@/server/sync/queue";

export interface ImportLineupResult {
  createdEntriesCount: number;
  linkedArtistsCount: number;
  newArtistsCount: number;
  enqueuedArtistIds: string[];
}

export async function importFestivalLineup(
  rawInput: ImportLineupInput,
  options: { db?: PrismaClient; queue?: SyncQueue; enqueueSync?: boolean } = {},
): Promise<ImportLineupResult> {
  const input = importLineupSchema.parse(rawInput);
  const db = options.db ?? getDb();
  const shouldEnqueue = options.enqueueSync ?? true;

  const includedRows = input.rows.filter((row) => row.included);
  if (includedRows.length === 0) {
    return {
      createdEntriesCount: 0,
      linkedArtistsCount: 0,
      newArtistsCount: 0,
      enqueuedArtistIds: [],
    };
  }

  const txResult = await db.$transaction(async (tx) => {
    const existingMax = await tx.festivalEntry.aggregate({
      where: { festivalId: input.festivalId },
      _max: { sortOrder: true },
    });
    let nextSortOrder = (existingMax._max.sortOrder ?? -1) + 1;

    const artistCache = new Map<string, string>();
    const newArtistIds: string[] = [];
    let linkedArtistsCount = 0;
    let createdEntriesCount = 0;

    for (const row of includedRows) {
      const resolvedArtistIds: string[] = [];
      const seenInEntry = new Set<string>();

      for (const rawName of row.artistNames) {
        const displayName = rawName.trim();
        const normalized = normalizeArtistName(displayName);
        if (!normalized || seenInEntry.has(normalized)) {
          continue;
        }
        seenInEntry.add(normalized);

        let artistId = artistCache.get(normalized);
        if (!artistId) {
          const existingArtist = await tx.artist.findUnique({
            where: { normalizedName: normalized },
            select: { id: true, syncStatus: true },
          });

          if (existingArtist) {
            artistId = existingArtist.id;
          } else {
            const createdArtist = await tx.artist.create({
              data: {
                name: displayName,
                normalizedName: normalized,
                syncStatus: "PENDING",
              },
              select: { id: true },
            });
            artistId = createdArtist.id;
            newArtistIds.push(artistId);
          }

          artistCache.set(normalized, artistId);
        }

        resolvedArtistIds.push(artistId);
      }

      if (resolvedArtistIds.length === 0) {
        continue;
      }

      await tx.festivalEntry.create({
        data: {
          festivalId: input.festivalId,
          billingName: row.billingName,
          subtitle: row.subtitle,
          day: row.day,
          stage: row.stage,
          setTime: row.setTime,
          sortOrder: nextSortOrder,
          artists: {
            create: resolvedArtistIds.map((artistId, position) => ({
              artistId,
              position,
            })),
          },
        },
      });

      nextSortOrder += 1;
      createdEntriesCount += 1;
      linkedArtistsCount += resolvedArtistIds.length;
    }

    return {
      createdEntriesCount,
      linkedArtistsCount,
      newArtistsCount: newArtistIds.length,
      enqueuedArtistIds: newArtistIds,
    };
  });

  if (shouldEnqueue && txResult.enqueuedArtistIds.length > 0) {
    const queue = options.queue ?? getSyncQueue();
    queue.enqueueMany(txResult.enqueuedArtistIds);
  }

  return txResult;
}
