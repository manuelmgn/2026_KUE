"use client";

import Link from "next/link";
import { SocialPostList } from "@/components/features/SocialPostList";
import type {
  FestivalArchiveItemDTO,
  HomeArtistItemDTO,
  SocialPostItemDTO,
} from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { toMediaApiUrl } from "@/domain/media-url";
import { useI18n } from "@/i18n/context";

interface HomeViewProps {
  featuredFestival: FestivalArchiveItemDTO;
  isUpcoming: boolean;
  daysUntil: number | null;
  upNextArtists: HomeArtistItemDTO[];
  recentlyRatedArtists: HomeArtistItemDTO[];
  friendsPosts?: SocialPostItemDTO[];
  unreadNotificationsCount?: number;
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  year: number,
  locale: string,
): string {
  if (!startDate && !endDate) {
    return String(year);
  }
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const shortFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  if (startDate && endDate && startDate !== endDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (start.getUTCFullYear() === end.getUTCFullYear()) {
      return `${shortFmt.format(start)} – ${fmt.format(end)}`;
    }
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  const single = new Date(`${startDate ?? endDate}T00:00:00.000Z`);
  return fmt.format(single);
}

export function HomeView({
  featuredFestival,
  isUpcoming,
  daysUntil,
  upNextArtists,
  recentlyRatedArtists,
  friendsPosts = [],
  unreadNotificationsCount = 0,
}: HomeViewProps) {
  const { locale, dict } = useI18n();
  const formattedDates = formatDateRange(
    featuredFestival.startDate,
    featuredFestival.endDate,
    featuredFestival.year,
    locale,
  );
  const festParam = encodeURIComponent(featuredFestival.slug);

  return (
    <main className="mx-auto w-full max-w-[1040px] min-h-[calc(100dvh-56px)] md:border-x md:border-line">
      {unreadNotificationsCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line border-l-4 border-l-acid bg-surface px-4 py-2.5 sm:px-6">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-ink">
            {dict.home.unreadNotificationsBanner(unreadNotificationsCount)}
          </span>
          <Link
            href="/notifications"
            className="border border-acid bg-acid px-2.5 py-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
          >
            {dict.home.viewNotificationsAction}
          </Link>
        </div>
      ) : null}

      {/* Featured Next Festival Hero */}
      <section className="border-b border-line px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink-muted">
            {isUpcoming ? dict.home.nextFestivalLabel : dict.home.latestFestivalLabel}
          </span>
          {daysUntil !== null && daysUntil >= 0 ? (
            <span className="border border-acid bg-acid px-2 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-acid-ink">
              {daysUntil === 0 ? dict.home.countdownToday : dict.home.countdownDays(daysUntil)}
            </span>
          ) : null}
        </div>

        <h1
          data-festival-heading
          className="mt-2 font-display text-[clamp(2.25rem,8vw,4.75rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.04em]"
        >
          {featuredFestival.name} {featuredFestival.year}
        </h1>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {featuredFestival.location ? (
            <p className="font-serif text-[1.25rem] italic text-ink-muted sm:text-[1.45rem]">
              {featuredFestival.location}
            </p>
          ) : null}
          <span className="font-mono text-[0.74rem] uppercase tracking-[0.06em] text-ink-muted">
            {formattedDates} · {dict.workspace.artistsBadge(featuredFestival.entriesCount)}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Link
            href={`/lineup?festival=${festParam}`}
            className="inline-flex border border-acid bg-acid px-4 py-2.5 font-mono text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-acid-ink transition-opacity hover:opacity-90"
          >
            {dict.home.viewLineup}
          </Link>
          <Link
            href={`/festival-mode?festival=${festParam}`}
            className="inline-flex border border-line px-4 py-2.5 font-mono text-[0.76rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
          >
            {dict.home.viewSchedule}
          </Link>
          <Link
            href={`/festivals?festival=${festParam}`}
            className="inline-flex border border-transparent px-2 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:text-ink"
          >
            {dict.home.viewAllFestivals}
          </Link>
        </div>
      </section>

      {/* Up Next: Listening & Pending */}
      <section aria-labelledby="home-up-next-heading" className="border-b border-line">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
          <h2 id="home-up-next-heading" className="font-semibold text-ink">
            {dict.home.upNextTitle}
          </h2>
          <span className="text-ink-muted">{upNextArtists.length}</span>
        </div>

        {upNextArtists.length === 0 ? (
          <p className="px-4 py-6 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
            {dict.home.upNextEmpty}
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {upNextArtists.map((artist) => {
              const imageUrl = toMediaApiUrl(artist.imagePath);
              const isListening = artist.status === "LISTENING";
              return (
                <li
                  key={artist.id}
                  className="border-b border-line transition-colors hover:bg-surface sm:border-r"
                >
                  <Link
                    href={`/lineup?festival=${encodeURIComponent(artist.festivalSlug)}&q=${encodeURIComponent(artist.name)}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
                  >
                    <Artwork
                      src={imageUrl}
                      alt={artist.name}
                      seedText={artist.name}
                      variant="artist"
                      className="h-12 w-12 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.08em] ${
                            isListening
                              ? "bg-acid font-semibold text-acid-ink"
                              : "border border-line text-ink-muted"
                          }`}
                        >
                          {isListening ? dict.drawer.statusListening : dict.drawer.statusPending}
                        </span>
                        <span className="truncate font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                          {artist.festivalName} {artist.festivalYear}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-display text-[1.05rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                        {artist.name}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recently Rated */}
      <section aria-labelledby="home-recently-rated-heading" className="border-b border-line">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
          <h2 id="home-recently-rated-heading" className="font-semibold text-ink">
            {dict.home.recentlyRatedTitle}
          </h2>
          <span className="text-ink-muted">{recentlyRatedArtists.length}</span>
        </div>

        {recentlyRatedArtists.length === 0 ? (
          <p className="px-4 py-6 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
            {dict.home.recentlyRatedEmpty}
          </p>
        ) : (
          <ul>
            {recentlyRatedArtists.map((artist, idx) => {
              const isHigh = artist.rating !== null && artist.rating >= 4;
              return (
                <li
                  key={artist.id}
                  className="border-b border-line transition-colors hover:bg-surface"
                >
                  <Link
                    href={`/lineup?festival=${encodeURIComponent(artist.festivalSlug)}&q=${encodeURIComponent(artist.name)}`}
                    className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                        {String(idx + 1).padStart(2, "0")} · {artist.festivalName}{" "}
                        {artist.festivalYear}
                      </div>
                      <div className="mt-0.5 truncate font-display text-[1.1rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                        {artist.name}
                      </div>
                      {artist.notes.trim() ? (
                        <p className="mt-0.5 line-clamp-1 font-serif text-[0.98rem] italic text-ink-muted">
                          {artist.notes}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 border px-2 py-0.5 font-mono text-[0.74rem] ${
                        isHigh
                          ? "border-acid bg-acid font-semibold text-acid-ink"
                          : "border-line text-ink"
                      }`}
                    >
                      {artist.rating}/5
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Friends Activity */}
      <section aria-labelledby="home-friends-activity-heading">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
          <h2 id="home-friends-activity-heading" className="font-semibold text-ink">
            {dict.home.friendsActivityTitle}
          </h2>
          <Link href="/social" className="text-ink-muted transition-colors hover:text-ink">
            {dict.home.viewAllActivity}
          </Link>
        </div>

        {friendsPosts.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
            <p className="font-serif text-[1.05rem] italic text-ink-muted">
              {dict.social.emptyFeedDescription}
            </p>
            <Link
              href="/social?tab=friends"
              className="inline-flex border border-line px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
            >
              {dict.home.viewAllActivity}
            </Link>
          </div>
        ) : (
          <SocialPostList posts={friendsPosts} showAuthor />
        )}
      </section>
    </main>
  );
}
