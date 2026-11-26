import Link from "next/link";
import { Suspense } from "react";
import { HomeView } from "@/components/features/HomeView";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalArchiveItemDTO, HomeArtistItemDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listHomeArtists, listUserEditionsWithCounts } from "@/server/services/festivals";
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
  const user = await requirePageUser("/");
  const [params, { locale, dict }, rawEditions, homeArtists] = await Promise.all([
    searchParams,
    getServerDictionary(),
    listUserEditionsWithCounts(user.id),
    listHomeArtists(user.id),
  ]);

  const festivalSummaries = rawEditions.map(toFestivalSummary);
  const todayIso = new Date().toISOString().slice(0, 10);

  const upcomingEditions = rawEditions
    .filter(
      (ed) =>
        !isPastDate(
          ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null,
          ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null,
          ed.year,
          todayIso,
        ),
    )
    .sort((a, b) => {
      const aKey = a.startDate ? a.startDate.toISOString().slice(0, 10) : `${a.year}-99-99`;
      const bKey = b.startDate ? b.startDate.toISOString().slice(0, 10) : `${b.year}-99-99`;
      return aKey.localeCompare(bKey);
    });

  const featuredRaw = params.festival
    ? resolveActiveFestival(rawEditions, params.festival)
    : (upcomingEditions[0] ?? rawEditions[0] ?? null);

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
      festivalId: featuredRaw.festival.id,
      slug: featuredRaw.slug,
      name: featuredRaw.festival.name,
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
    if (!artist.edition) return null;
    return {
      id: artist.id,
      name: artist.name,
      imagePath: artist.imagePath,
      rating: artist.rating,
      status: artist.status,
      notes: artist.notes,
      festivalSlug: artist.edition.slug,
      festivalName: artist.edition.festival.name,
      festivalYear: artist.edition.year,
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
        <TopBar
          festivals={festivalSummaries}
          activeFestivalSlug={featuredFestival?.slug ?? null}
          currentUser={user}
        />
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
