import { notFound } from "next/navigation";
import { FestivalHomeView } from "@/components/features/FestivalHomeView";
import type { FestivalArchiveItemDTO, HomeArtistItemDTO } from "@/components/features/types";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getLocalizedPlaceName } from "@/server/clients/places";
import {
  getEditionByBrandAndYear,
  isEditionInUserFestivals,
  listEditionHomeArtists,
} from "@/server/services/festivals";

export const dynamic = "force-dynamic";

interface FestivalHomePageProps {
  params: Promise<{ brandSlug: string; year: string }>;
}

function isPastDate(startDate: string | null, endDate: string | null, year: number, today: string) {
  if (endDate) return endDate < today;
  if (startDate) return startDate < today;
  return year < Number(today.slice(0, 4));
}

function computeDaysUntil(startDate: string | null, todayIso: string): number | null {
  if (!startDate) return null;
  const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
  const todayMs = Date.parse(`${todayIso}T00:00:00.000Z`);
  if (Number.isNaN(startMs) || Number.isNaN(todayMs)) return null;
  const diff = Math.round((startMs - todayMs) / 86_400_000);
  return diff >= 0 ? diff : null;
}

export default async function FestivalHomePage({ params }: FestivalHomePageProps) {
  const { brandSlug, year: yearParam } = await params;
  const year = Number(yearParam);
  const user = await requirePageUser(`/festivals/${encodeURIComponent(brandSlug)}/${yearParam}`);

  const [{ locale }, edition] = await Promise.all([
    getServerDictionary(),
    getEditionByBrandAndYear(brandSlug, year),
  ]);

  if (!edition) {
    notFound();
  }

  const [localizedLocation, inMyFestivals, editionArtists] = await Promise.all([
    getLocalizedPlaceName(edition.locationPlaceId, getPlacesApiLanguage(locale), edition.location),
    isEditionInUserFestivals(user.id, edition.id),
    listEditionHomeArtists(user.id, edition.id),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const startDate = edition.startDate ? edition.startDate.toISOString().slice(0, 10) : null;
  const endDate = edition.endDate ? edition.endDate.toISOString().slice(0, 10) : null;

  const festivalDTO: FestivalArchiveItemDTO = {
    id: edition.id,
    festivalId: edition.festival.id,
    brandSlug: edition.festival.slug,
    slug: edition.slug,
    name: edition.festival.name,
    year: edition.year,
    location: localizedLocation,
    startDate,
    endDate,
    entriesCount: edition._count.entries,
    lineupSourceUrl: edition.lineupSourceUrl,
  };

  const mapArtist = (
    artist: Awaited<ReturnType<typeof listEditionHomeArtists>>["queue"][number],
  ): HomeArtistItemDTO => ({
    id: artist.id,
    name: artist.name,
    imagePath: artist.imagePath,
    rating: artist.rating,
    status: artist.status,
    notes: artist.notes,
    festivalSlug: edition.slug,
    festivalBrandSlug: edition.festival.slug,
    festivalName: edition.festival.name,
    festivalYear: edition.year,
  });

  return (
    <FestivalHomeView
      festival={festivalDTO}
      isInMyFestivals={inMyFestivals}
      isUpcoming={!isPastDate(startDate, endDate, edition.year, todayIso)}
      daysUntil={computeDaysUntil(startDate, todayIso)}
      upNextArtists={editionArtists.queue.map(mapArtist)}
      recentlyRatedArtists={editionArtists.recentlyRated.map(mapArtist)}
    />
  );
}
