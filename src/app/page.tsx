import Link from "next/link";
import { type HomeUpcomingCard, HomeView } from "@/components/features/HomeView";
import type { HomeArtistItemDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listHomeArtists, listUserEditionsWithCounts } from "@/server/services/festivals";
import { listFriendsActivityFeed } from "@/server/services/profile";

export const dynamic = "force-dynamic";

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

export default async function HomePage() {
  const user = await requirePageUser("/");
  const [{ locale, dict }, rawEditions, homeArtists, friendsPosts] = await Promise.all([
    getServerDictionary(),
    listUserEditionsWithCounts(user.id),
    listHomeArtists(user.id),
    listFriendsActivityFeed(user.id, { limit: 8 }),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const placesLang = getPlacesApiLanguage(locale);

  const upcomingRaw = rawEditions
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
    })
    .slice(0, 3);

  const featuredSource = upcomingRaw.length > 0 ? upcomingRaw : rawEditions.slice(0, 1);

  const upcomingCards: HomeUpcomingCard[] = await Promise.all(
    featuredSource.map(async (ed) => {
      const startDate = ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null;
      const endDate = ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null;
      const localizedLocation = await getLocalizedPlaceName(
        ed.locationPlaceId,
        placesLang,
        ed.location,
      );
      return {
        id: ed.id,
        festivalId: ed.festival.id,
        brandSlug: ed.festival.slug,
        slug: ed.slug,
        name: ed.festival.name,
        year: ed.year,
        location: localizedLocation,
        startDate,
        endDate,
        entriesCount: ed._count.entries,
        daysUntil: computeDaysUntil(startDate, todayIso),
      };
    }),
  );

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
      festivalBrandSlug: artist.edition.festival.slug,
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

  if (upcomingCards.length === 0 && friendsPosts.length === 0) {
    return (
      <main className="w-full min-h-[calc(100dvh-3rem)] sm:min-h-dvh">
        <EmptyState
          title={dict.home.emptyTitle}
          description={
            user.role === "ADMIN" ? dict.home.emptyDescription : dict.home.emptyDescriptionUser
          }
          action={
            <Link
              href="/festivals"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
            >
              {dict.home.emptyAction}
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <HomeView
      upcomingFestivals={upcomingCards}
      upNextArtists={upNextArtists}
      recentlyRatedArtists={recentlyRatedArtists}
      friendsPosts={friendsPosts}
    />
  );
}
