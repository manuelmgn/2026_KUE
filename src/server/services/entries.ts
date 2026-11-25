import { type EntryFilterCriteria, matchesEntryFilters } from "@/domain/rating";
import { type UpdateEntryScheduleInput, updateEntryScheduleSchema } from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

export async function listFestivalEntries(
  festivalId: string,
  filters: EntryFilterCriteria = {},
  db: PrismaClient = getDb(),
) {
  const rows = await db.festivalEntry.findMany({
    where: { festivalId },
    orderBy: [{ sortOrder: "asc" }, { billingName: "asc" }],
    include: {
      artists: {
        orderBy: { position: "asc" },
        include: {
          artist: true,
        },
      },
    },
  });

  return rows.filter((entry) =>
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
  festivalId: string,
  options: { day?: string; onlyMustSee?: boolean } = {},
  db: PrismaClient = getDb(),
) {
  const entries = await listFestivalEntries(
    festivalId,
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

export async function updateEntrySchedule(
  rawInput: UpdateEntryScheduleInput,
  db: PrismaClient = getDb(),
) {
  const input = updateEntryScheduleSchema.parse(rawInput);

  const data: {
    day?: string | null;
    stage?: string | null;
    setTime?: string | null;
    liveRating?: number | null;
    liveNotes?: string;
  } = {};

  if (input.day !== undefined) {
    data.day = input.day || null;
  }
  if (input.stage !== undefined) {
    data.stage = input.stage || null;
  }
  if (input.setTime !== undefined) {
    data.setTime = input.setTime || null;
  }
  if (input.liveRating !== undefined) {
    data.liveRating = input.liveRating;
  }
  if (input.liveNotes !== undefined) {
    data.liveNotes = input.liveNotes;
  }

  return db.festivalEntry.update({
    where: { id: input.entryId },
    data,
  });
}
