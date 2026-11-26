"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addEditionToMyFestivalsAction } from "@/actions/festival-actions";
import { FestivalHeaderNav } from "@/components/features/FestivalHeaderNav";
import type { FestivalArchiveItemDTO, HomeArtistItemDTO } from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { HairlineButton } from "@/components/ui/HairlineButton";
import {
  deriveFestivalExternalLinks,
  festivalAgendaPath,
  festivalCartelPath,
} from "@/domain/festival-routes";
import { toMediaApiUrl } from "@/domain/media-url";
import { useI18n } from "@/i18n/context";

interface FestivalHomeViewProps {
  festival: FestivalArchiveItemDTO;
  isInMyFestivals: boolean;
  isUpcoming: boolean;
  daysUntil: number | null;
  upNextArtists: HomeArtistItemDTO[];
  recentlyRatedArtists: HomeArtistItemDTO[];
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

export function FestivalHomeView({
  festival,
  isInMyFestivals,
  isUpcoming,
  daysUntil,
  upNextArtists,
  recentlyRatedArtists,
}: FestivalHomeViewProps) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const [inMine, setInMine] = useState(isInMyFestivals);
  const [adding, setAdding] = useState(false);

  const formattedDates = formatDateRange(
    festival.startDate,
    festival.endDate,
    festival.year,
    locale,
  );
  const routeTarget = { brandSlug: festival.brandSlug, year: festival.year };
  const externalLinks = deriveFestivalExternalLinks(festival.name, festival.lineupSourceUrl);

  const handleAdd = async () => {
    setAdding(true);
    try {
      const res = await addEditionToMyFestivalsAction(festival.id);
      if (res.ok) {
        setInMine(true);
        router.refresh();
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <main className="w-full min-h-[calc(100dvh-3rem)] sm:min-h-dvh">
      {/* Monumental Festival Hero */}
      <section className="px-4 py-6 sm:px-6 sm:py-9">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink-muted">
            {isUpcoming ? dict.festivalHome.summaryLabel : dict.festivalHome.pastEditionLabel}
          </span>
          <div className="flex items-center gap-2">
            {daysUntil !== null && daysUntil >= 0 ? (
              <span className="border border-acid bg-acid px-2 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-acid-ink">
                {daysUntil === 0 ? dict.home.countdownToday : dict.home.countdownDays(daysUntil)}
              </span>
            ) : null}
            {!inMine ? (
              <HairlineButton
                variant="acid"
                size="sm"
                disabled={adding}
                onClick={() => void handleAdd()}
              >
                {dict.catalog.addEditionAction}
              </HairlineButton>
            ) : null}
          </div>
        </div>

        <h1
          data-festival-heading
          className="mt-2 font-display text-[clamp(2.25rem,7vw,4.75rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.04em]"
        >
          {festival.name} {festival.year}
        </h1>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {festival.location ? (
              <p className="font-serif text-[1.25rem] italic text-ink-muted sm:text-[1.45rem]">
                {festival.location}
              </p>
            ) : null}
            <span className="font-mono text-[0.74rem] uppercase tracking-[0.06em] text-ink-muted">
              {formattedDates} · {dict.workspace.artistsBadge(festival.entriesCount)}
            </span>
          </div>

          {/* Official Website & Social Links (prepared for automatic population) */}
          <div className="grid w-full grid-cols-3 border border-line bg-surface font-mono text-[0.66rem] uppercase tracking-[0.04em] sm:inline-flex sm:w-auto sm:text-[0.68rem] sm:tracking-[0.06em]">
            <a
              href={externalLinks.officialWeb}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center justify-center truncate border-r border-line px-2 py-2 text-ink transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink sm:px-3"
            >
              {dict.festivalHome.officialWeb}
            </a>
            <a
              href={externalLinks.instagram}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center justify-center truncate border-r border-line px-2 py-2 text-ink transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink sm:px-3"
            >
              {dict.festivalHome.instagram}
            </a>
            <a
              href={externalLinks.youtube}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center justify-center truncate px-2 py-2 text-ink transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink sm:px-3"
            >
              {dict.festivalHome.youtube}
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Link
            href={festivalCartelPath(routeTarget)}
            className="inline-flex border border-acid bg-acid px-4 py-2.5 font-mono text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-acid-ink transition-opacity hover:opacity-90"
          >
            {dict.home.viewLineup}
          </Link>
          <Link
            href={festivalAgendaPath(routeTarget)}
            className="inline-flex border border-line px-4 py-2.5 font-mono text-[0.76rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
          >
            {dict.home.viewSchedule}
          </Link>
        </div>
      </section>

      {/* Level 2 Festival Navigation Strip */}
      <FestivalHeaderNav
        brandSlug={festival.brandSlug}
        name={festival.name}
        year={festival.year}
        activeTab="home"
        tabsOnly
      />

      {/* Festival-scoped Personal Activity (2-column split on Tablet H / Desktop / Wide) */}
      <div className="grid grid-cols-1 tablet-h:grid-cols-[1.2fr_1fr]">
        {/* Up Next in this Festival */}
        <section
          aria-labelledby="fest-home-up-next-heading"
          className="border-b border-line tablet-h:border-r tablet-h:border-b-0"
        >
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
            <h2 id="fest-home-up-next-heading" className="font-semibold text-ink">
              {dict.home.upNextTitle}
            </h2>
            <span className="text-ink-muted">{upNextArtists.length}</span>
          </div>

          {upNextArtists.length === 0 ? (
            <p className="px-4 py-6 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
              {dict.home.upNextEmpty}
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2">
              {upNextArtists.map((artist) => {
                const imageUrl = toMediaApiUrl(artist.imagePath);
                const isListening = artist.status === "LISTENING";
                return (
                  <li
                    key={artist.id}
                    className="border-b border-line transition-colors hover:bg-surface sm:border-r"
                  >
                    <Link
                      href={festivalCartelPath(routeTarget, { q: artist.name })}
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
                        <span
                          className={`inline-block px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.08em] ${
                            isListening
                              ? "bg-acid font-semibold text-acid-ink"
                              : "border border-line text-ink-muted"
                          }`}
                        >
                          {isListening ? dict.drawer.statusListening : dict.drawer.statusPending}
                        </span>
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

        {/* Recently Rated in this Festival */}
        <section aria-labelledby="fest-home-recently-rated-heading">
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
            <h2 id="fest-home-recently-rated-heading" className="font-semibold text-ink">
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
                      href={festivalCartelPath(routeTarget, { q: artist.name })}
                      className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                          {String(idx + 1).padStart(2, "0")}
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
      </div>
    </main>
  );
}
