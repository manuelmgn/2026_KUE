import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import { getPlacesApiLanguage, type Locale } from "@/i18n/config";
import { getLocalizedPlaceName } from "@/server/clients/places";
import type { listFestivalEntries } from "@/server/services/entries";
import type { EditionWithFestival } from "@/server/services/festivals";

export function toFestivalSummary(edition: EditionWithFestival): FestivalSummary {
  return {
    id: edition.id,
    festivalId: edition.festival.id,
    brandSlug: edition.festival.slug,
    slug: edition.slug,
    name: edition.festival.name,
    year: edition.year,
    location: edition.location,
  };
}

export async function toLocalizedFestivalSummary(
  edition: EditionWithFestival,
  locale: Locale,
): Promise<FestivalSummary> {
  const localizedLocation = await getLocalizedPlaceName(
    edition.locationPlaceId,
    getPlacesApiLanguage(locale),
    edition.location,
  );
  return {
    ...toFestivalSummary(edition),
    location: localizedLocation,
  };
}

export function resolveActiveFestival<T extends { slug: string }>(
  festivals: ReadonlyArray<T>,
  requestedSlug?: string,
): T | null {
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
    festivalId: entry.editionId,
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
