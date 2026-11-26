"use client";

import Link from "next/link";
import { SocialPostList } from "@/components/features/SocialPostList";
import type {
  FestivalArchiveItemDTO,
  HomeArtistItemDTO,
  SocialPostItemDTO,
} from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { festivalCartelPath, festivalHomePath } from "@/domain/festival-routes";
import { toMediaApiUrl } from "@/domain/media-url";
import { useI18n } from "@/i18n/context";

export interface HomeUpcomingCard extends FestivalArchiveItemDTO {
  daysUntil: number | null;
}

interface HomeViewProps {
  upcomingFestivals: HomeUpcomingCard[];
  upNextArtists: HomeArtistItemDTO[];
  recentlyRatedArtists: HomeArtistItemDTO[];
  friendsPosts: SocialPostItemDTO[];
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
  upcomingFestivals,
  upNextArtists,
  recentlyRatedArtists,
  friendsPosts,
}: HomeViewProps) {
  const { locale, dict } = useI18n();

  const gridColsClass =
    upcomingFestivals.length <= 1
      ? "grid-cols-1"
      : upcomingFestivals.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 tablet-h:grid-cols-[1.35fr_1fr_1fr]";

  return (
    <main className="w-full min-h-[calc(100dvh-3rem)] sm:min-h-dvh">
      <h1 data-page-heading className="sr-only">
        {dict.nav.home}
      </h1>

      {/* Top Block: Up to 3 upcoming festivals (closest first) */}
      <section aria-labelledby="home-upcoming-heading" className="border-b border-line">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
          <h2 id="home-upcoming-heading" className="font-semibold text-ink">
            {dict.nav.upcomingFestivals}
          </h2>
          <Link href="/festivals" className="text-ink-muted transition-colors hover:text-ink">
            {dict.home.viewAllFestivals}
          </Link>
        </div>

        <div className={`grid ${gridColsClass}`}>
          {upcomingFestivals.map((fest, idx) => {
            const isClosest = idx === 0;
            const formattedDates = formatDateRange(fest.startDate, fest.endDate, fest.year, locale);
            const href = festivalHomePath({ brandSlug: fest.brandSlug, year: fest.year });
            return (
              <Link
                key={fest.id}
                href={href}
                className={`group flex flex-col justify-between gap-4 border-b border-line p-4 transition-colors hover:bg-surface sm:border-r sm:p-5 tablet-h:border-b-0 ${
                  isClosest ? "border-l-4 border-l-acid bg-surface" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted">
                      {isClosest ? dict.home.closestLabel : dict.home.upcomingLabel}
                    </span>
                    {fest.daysUntil !== null && fest.daysUntil >= 0 ? (
                      <span
                        className={`px-2 py-0.5 font-mono text-[0.66rem] uppercase tracking-[0.08em] ${
                          isClosest
                            ? "border border-acid bg-acid font-semibold text-acid-ink"
                            : "border border-line text-ink-muted"
                        }`}
                      >
                        {fest.daysUntil === 0
                          ? dict.home.countdownToday
                          : dict.home.countdownDays(fest.daysUntil)}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`mt-2 font-display font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-ink ${
                      isClosest
                        ? "text-[clamp(1.75rem,3.6vw,2.75rem)]"
                        : "text-[clamp(1.45rem,2.6vw,2rem)]"
                    }`}
                  >
                    {fest.name} {fest.year}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    {fest.location ? (
                      <span className="font-serif text-[1.08rem] italic text-ink-muted">
                        {fest.location}
                      </span>
                    ) : null}
                    <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                      {formattedDates}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-line pt-2.5 font-mono text-[0.68rem] uppercase tracking-[0.06em]">
                  <span className="text-ink-muted">
                    {dict.workspace.artistsBadge(fest.entriesCount)}
                  </span>
                  <span
                    className={
                      isClosest
                        ? "font-semibold text-ink group-hover:underline"
                        : "text-ink-muted group-hover:text-ink"
                    }
                  >
                    {dict.home.enterFestival}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Main Split: Friends Activity (Left) + Your Queue & Recently Rated (Right) */}
      <div className="grid grid-cols-1 tablet-h:grid-cols-[1.15fr_1fr]">
        {/* Friends Recent Ratings (all scores 1–5, no private text notes) */}
        <section
          aria-labelledby="home-friends-activity-heading"
          className="border-b border-line tablet-h:border-r tablet-h:border-b-0"
        >
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
            <h2 id="home-friends-activity-heading" className="font-semibold text-ink">
              {dict.home.friendsActivityTitle}
            </h2>
            <Link href="/social" className="text-ink-muted transition-colors hover:text-ink">
              {dict.home.viewAllActivity}
            </Link>
          </div>

          {friendsPosts.length === 0 ? (
            <p className="px-4 py-6 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
              {dict.social.emptyFeedDescription}
            </p>
          ) : (
            <SocialPostList posts={friendsPosts} showAuthor />
          )}
        </section>

        {/* Your Listening Queue + Your Recently Rated */}
        <div className="flex flex-col">
          <section aria-labelledby="home-up-next-heading" className="border-b border-line">
            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
              <h2 id="home-up-next-heading" className="font-semibold text-ink">
                {dict.home.yourQueueTitle}
              </h2>
              <span className="text-ink-muted">{upNextArtists.length}</span>
            </div>

            {upNextArtists.length === 0 ? (
              <p className="px-4 py-6 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
                {dict.home.upNextEmpty}
              </p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 tablet-h:grid-cols-1 desktop:grid-cols-2">
                {upNextArtists.map((artist) => {
                  const imageUrl = toMediaApiUrl(artist.imagePath);
                  const isListening = artist.status === "LISTENING";
                  return (
                    <li
                      key={artist.id}
                      className="border-b border-line transition-colors hover:bg-surface sm:border-r tablet-h:border-r-0 desktop:border-r"
                    >
                      <Link
                        href={festivalCartelPath(
                          { brandSlug: artist.festivalBrandSlug, year: artist.festivalYear },
                          { q: artist.name },
                        )}
                        className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
                      >
                        <Artwork
                          src={imageUrl}
                          alt={artist.name}
                          seedText={artist.name}
                          variant="artist"
                          className="h-11 w-11 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] ${
                                isListening
                                  ? "bg-acid font-semibold text-acid-ink"
                                  : "border border-line text-ink-muted"
                              }`}
                            >
                              {isListening
                                ? dict.drawer.statusListening
                                : dict.drawer.statusPending}
                            </span>
                            <span className="truncate font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink-muted">
                              {artist.festivalName} {artist.festivalYear}
                            </span>
                          </div>
                          <div className="mt-1 truncate font-display text-[1.02rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
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

          <section aria-labelledby="home-recently-rated-heading">
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
                {recentlyRatedArtists.slice(0, 5).map((artist) => {
                  const isHigh = artist.rating !== null && artist.rating >= 4;
                  return (
                    <li
                      key={artist.id}
                      className="border-b border-line transition-colors hover:bg-surface"
                    >
                      <Link
                        href={festivalCartelPath(
                          { brandSlug: artist.festivalBrandSlug, year: artist.festivalYear },
                          { q: artist.name },
                        )}
                        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink-muted">
                            {artist.festivalName} {artist.festivalYear}
                          </div>
                          <div className="mt-0.5 truncate font-display text-[1.05rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                            {artist.name}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 border px-2 py-0.5 font-mono text-[0.74rem] ${
                            isHigh
                              ? "border-acid bg-acid font-semibold text-acid-ink"
                              : "border-line-strong text-ink"
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
        </div>
      </div>
    </main>
  );
}
