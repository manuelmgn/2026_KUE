import { DomainError, ForbiddenError } from "@/domain/errors";
import { type EntryFilterCriteria, matchesEntryFilters } from "@/domain/rating";
import {
  type DeleteEntryInput,
  deleteEntrySchema,
  type UpdateEntryScheduleInput,
  updateEntryScheduleSchema,
} from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

export async function listFestivalEntries(
  userId: string,
  editionId: string,
  filters: EntryFilterCriteria = {},
  db: PrismaClient = getDb(),
) {
  const rows = await db.festivalEntry.findMany({
    where: { editionId },
    orderBy: [{ sortOrder: "asc" }, { billingName: "asc" }],
    include: {
      userStates: {
        where: { userId },
        take: 1,
      },
      artists: {
        orderBy: { position: "asc" },
        include: {
          artist: {
            include: {
              userStates: {
                where: { userId },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  const hydrated = rows.map((entry) => {
    const entryState = entry.userStates[0];
    return {
      id: entry.id,
      editionId: entry.editionId,
      billingName: entry.billingName,
      subtitle: entry.subtitle,
      day: entry.day,
      stage: entry.stage,
      setTime: entry.setTime,
      liveRating: entryState?.liveRating ?? null,
      liveNotes: entryState?.liveNotes ?? "",
      artists: entry.artists.map((link) => {
        const artistState = link.artist.userStates[0];
        return {
          position: link.position,
          artist: {
            id: link.artist.id,
            name: link.artist.name,
            country: link.artist.country,
            imagePath: link.artist.imagePath,
            rating: artistState?.rating ?? null,
            status: artistState?.status ?? ("PENDING" as const),
            notes: artistState?.notes ?? "",
            syncStatus: link.artist.syncStatus,
          },
        };
      }),
    };
  });

  return hydrated.filter((entry) =>
    matchesEntryFilters(
      {
        billingName: entry.billingName,
        subtitle: entry.subtitle,
        day: entry.day,
        stage: entry.stage,
        artists: entry.artists.map((link) => ({
          name: link.artist.name,
          rating: link.artist.rating,
          status: link.artist.status,
          notes: link.artist.notes,
        })),
      },
      filters,
    ),
  );
}

export async function getFestivalModeEntries(
  userId: string,
  editionId: string,
  options: { day?: string; onlyMustSee?: boolean } = {},
  db: PrismaClient = getDb(),
) {
  const entries = await listFestivalEntries(
    userId,
    editionId,
    options.onlyMustSee ? { rating: "MUST" } : {},
    db,
  );

  const nonDiscarded = entries.filter((entry) =>
    entry.artists.some((link) => link.artist.status !== "DISCARDED"),
  );

  if (!options.day || options.day === "TODOS") {
    return nonDiscarded;
  }

  return nonDiscarded.filter((entry) => entry.day === options.day);
}

/**
 * Updates shared schedule (`day`, `stage`, `setTime`) on `FestivalEntry` and private
 * post-concert review (`liveRating`, `liveNotes`) on `UserEntryState` for `userId`.
 */
export async function updateEntrySchedule(
  userId: string,
  rawInput: UpdateEntryScheduleInput,
  db: PrismaClient = getDb(),
  options: { allowSharedSchedule?: boolean } = {},
) {
  const input = updateEntryScheduleSchema.parse(rawInput);

  const existing = await db.festivalEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true, day: true, stage: true, setTime: true },
  });
  if (!existing) {
    throw new DomainError("Entrada de cartel no encontrada");
  }

  const nextDay = input.day !== undefined ? input.day || null : existing.day;
  const nextStage = input.stage !== undefined ? input.stage || null : existing.stage;
  const nextSetTime = input.setTime !== undefined ? input.setTime || null : existing.setTime;
  const modifiesShared =
    nextDay !== existing.day || nextStage !== existing.stage || nextSetTime !== existing.setTime;

  if (modifiesShared && options.allowSharedSchedule === false) {
    throw new ForbiddenError("Solo un administrador puede modificar los horarios del cartel");
  }

  const sharedData: {
    day?: string | null;
    stage?: string | null;
    setTime?: string | null;
  } = {};

  if (options.allowSharedSchedule !== false) {
    if (input.day !== undefined) {
      sharedData.day = input.day || null;
    }
    if (input.stage !== undefined) {
      sharedData.stage = input.stage || null;
    }
    if (input.setTime !== undefined) {
      sharedData.setTime = input.setTime || null;
    }
  }

  const updatedEntry =
    Object.keys(sharedData).length > 0
      ? await db.festivalEntry.update({
          where: { id: input.entryId },
          data: sharedData,
        })
      : existing;

  const hasPersonalUpdate = input.liveRating !== undefined || input.liveNotes !== undefined;
  let personalState: { liveRating: number | null; liveNotes: string };

  if (hasPersonalUpdate) {
    const upserted = await db.userEntryState.upsert({
      where: { userId_entryId: { userId, entryId: input.entryId } },
      create: {
        userId,
        entryId: input.entryId,
        liveRating: input.liveRating ?? null,
        liveNotes: input.liveNotes ?? "",
      },
      update: {
        ...(input.liveRating !== undefined ? { liveRating: input.liveRating } : {}),
        ...(input.liveNotes !== undefined ? { liveNotes: input.liveNotes } : {}),
      },
    });
    personalState = { liveRating: upserted.liveRating, liveNotes: upserted.liveNotes };
  } else {
    const current = await db.userEntryState.findUnique({
      where: { userId_entryId: { userId, entryId: input.entryId } },
    });
    personalState = {
      liveRating: current?.liveRating ?? null,
      liveNotes: current?.liveNotes ?? "",
    };
  }

  return {
    id: updatedEntry.id,
    day: updatedEntry.day,
    stage: updatedEntry.stage,
    setTime: updatedEntry.setTime,
    liveRating: personalState.liveRating,
    liveNotes: personalState.liveNotes,
  };
}

export async function deleteFestivalEntry(rawInput: DeleteEntryInput, db: PrismaClient = getDb()) {
  const input = deleteEntrySchema.parse(rawInput);
  return db.festivalEntry.delete({
    where: { id: input.entryId },
  });
}
