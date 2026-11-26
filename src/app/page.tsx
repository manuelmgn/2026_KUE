import Link from "next/link";
import { Suspense } from "react";
import { HomeView } from "@/components/features/HomeView";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalArchiveItemDTO, HomeArtistItemDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listFestivalsWithCounts, listHomeArtists } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface HomePageProps {
  searchParams: Promise<{ festival?: string }>;
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

export default async function HomePage({ searchParams }: HomePageProps) {
  const [params, { locale, dict }, rawFestivals, homeArtists] = await Promise.all([
    searchParams,
    getServerDictionary(),
    listFestivalsWithCounts(),
    listHomeArtists(),
  ]);

  const festivalSummaries = rawFestivals.map(toFestivalSummary);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Pick the requested festival if specified, otherwise the nearest upcoming festival,
  // falling back to the most recent festival.
  const upcomingFestivals = rawFestivals
    .filter(
      (fest) =>
        !isPastDate(
          fest.startDate ? fest.startDate.toISOString().slice(0, 10) : null,
          fest.endDate ? fest.endDate.toISOString().slice(0, 10) : null,
          fest.year,
          todayIso,
        ),
    )
    .sort((a, b) => {
      const aKey = a.startDate ? a.startDate.toISOString().slice(0, 10) : `${a.year}-99-99`;
      const bKey = b.startDate ? b.startDate.toISOString().slice(0, 10) : `${b.year}-99-99`;
      return aKey.localeCompare(bKey);
    });

  const featuredRaw = params.festival
    ? resolveActiveFestival(rawFestivals, params.festival)
    : (upcomingFestivals[0] ?? rawFestivals[0] ?? null);

  let featuredFestival: FestivalArchiveItemDTO | null = null;
  let isUpcoming = false;
  let daysUntil: number | null = null;

  if (featuredRaw) {
    const startDate = featuredRaw.startDate
      ? featuredRaw.startDate.toISOString().slice(0, 10)
      : null;
    const endDate = featuredRaw.endDate ? featuredRaw.endDate.toISOString().slice(0, 10) : null;
    const localizedLocation = await getLocalizedPlaceName(
      featuredRaw.locationPlaceId,
      getPlacesApiLanguage(locale),
      featuredRaw.location,
    );

    featuredFestival = {
      id: featuredRaw.id,
      slug: featuredRaw.slug,
      name: featuredRaw.name,
      year: featuredRaw.year,
      location: localizedLocation,
      startDate,
      endDate,
      entriesCount: featuredRaw._count.entries,
    };
    isUpcoming = !isPastDate(startDate, endDate, featuredRaw.year, todayIso);
    daysUntil = computeDaysUntil(startDate, todayIso);
  }

  const mapArtist = (
    artist: Awaited<ReturnType<typeof listHomeArtists>>["queue"][number],
  ): HomeArtistItemDTO | null => {
    const firstFestival = artist.entries[0]?.entry.festival;
    if (!firstFestival) return null;
    return {
      id: artist.id,
      name: artist.name,
      imagePath: artist.imagePath,
      rating: artist.rating,
      status: artist.status,
      notes: artist.notes,
      festivalSlug: firstFestival.slug,
      festivalName: firstFestival.name,
      festivalYear: firstFestival.year,
    };
  };

  const upNextArtists = homeArtists.queue
    .map(mapArtist)
    .filter((item): item is HomeArtistItemDTO => item !== null);
  const recentlyRatedArtists = homeArtists.recentlyRated
    .map(mapArtist)
    .filter((item): item is HomeArtistItemDTO => item !== null);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={festivalSummaries} activeFestivalSlug={featuredFestival?.slug ?? null} />
      </Suspense>

      {featuredFestival ? (
        <HomeView
          featuredFestival={featuredFestival}
          isUpcoming={isUpcoming}
          daysUntil={daysUntil}
          upNextArtists={upNextArtists}
          recentlyRatedArtists={recentlyRatedArtists}
        />
      ) : (
        <EmptyState
          title={dict.home.emptyTitle}
          description={dict.home.emptyDescription}
          action={
            <Link
              href="/festivals"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
            >
              {dict.home.emptyAction}
            </Link>
          }
        />
      )}
    </div>
  );
}
