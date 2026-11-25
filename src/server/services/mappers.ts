import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import type { Festival } from "@/generated/prisma/client";
import type { listFestivalEntries } from "@/server/services/entries";

export function toFestivalSummary(festival: Festival): FestivalSummary {
  return {
    id: festival.id,
    slug: festival.slug,
    name: festival.name,
    year: festival.year,
    location: festival.location,
  };
}

/**
 * Picks the requested festival by slug from an already-fetched list, falling back to the
 * first (most recent) festival. Avoids redundant DB roundtrips on every page render.
 */
export function resolveActiveFestival(
  festivals: ReadonlyArray<FestivalSummary>,
  requestedSlug?: string,
): FestivalSummary | null {
  if (requestedSlug) {
    const match = festivals.find((festival) => festival.slug === requestedSlug);
    if (match) {
      return match;
    }
  }
  return festivals[0] ?? null;
}

type RawLineupEntry = Awaited<ReturnType<typeof listFestivalEntries>>[number];

export function toLineupEntryDTO(entry: RawLineupEntry): LineupEntryDTO {
  return {
    id: entry.id,
    festivalId: entry.festivalId,
    billingName: entry.billingName,
    subtitle: entry.subtitle,
    day: entry.day,
    stage: entry.stage,
    setTime: entry.setTime,
    liveRating: entry.liveRating,
    liveNotes: entry.liveNotes,
    artists: entry.artists.map((link) => ({
      id: link.artist.id,
      name: link.artist.name,
      country: link.artist.country,
      imagePath: link.artist.imagePath,
      rating: link.artist.rating,
      status: link.artist.status,
      notes: link.artist.notes,
      syncStatus: link.artist.syncStatus,
    })),
  };
}
