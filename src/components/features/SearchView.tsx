"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  getArtistDetailAction,
  searchArtistsAction,
  setArtistRatingAction,
  setArtistStatusAction,
} from "@/actions/artist-actions";
import type { ArtistDetailDTO, GlobalArtistSearchItemDTO } from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { RatingControl } from "@/components/ui/RatingControl";
import { getArtistExternalLinks } from "@/domain/external-links";
import { festivalCartelPath } from "@/domain/festival-routes";
import { toMediaApiUrl } from "@/domain/media-url";
import type { ArtistStatus } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface SearchViewProps {
  initialArtists: GlobalArtistSearchItemDTO[];
  initialQuery?: string;
}

export function SearchView({ initialArtists, initialQuery = "" }: SearchViewProps) {
  const { dict } = useI18n();
  const inputId = useId();

  const [query, setQuery] = useState(initialQuery);
  const [artists, setArtists] = useState<GlobalArtistSearchItemDTO[]>(initialArtists);
  const [searching, setSearching] = useState(false);

  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ArtistDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === initialQuery.trim()) {
      setArtists(initialArtists);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchArtistsAction(trimmed)
        .then((res) => {
          if (!cancelled && res.ok) {
            setArtists(res.data);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, initialArtists, initialQuery]);

  useEffect(() => {
    if (!selectedArtistId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    void getArtistDetailAction(selectedArtistId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedArtistId]);

  const handleRate = async (artistId: string, rating: number) => {
    const res = await setArtistRatingAction({ artistId, rating });
    if (res.ok) {
      setArtists((prev) =>
        prev.map((a) =>
          a.id === artistId ? { ...a, rating: res.data.rating, status: res.data.status } : a,
        ),
      );
      setDetail((prev) =>
        prev && prev.id === artistId
          ? { ...prev, rating: res.data.rating, status: res.data.status }
          : prev,
      );
    }
  };

  const handleStatus = async (artistId: string, status: ArtistStatus) => {
    const res = await setArtistStatusAction({ artistId, status });
    if (res.ok) {
      setArtists((prev) =>
        prev.map((a) => (a.id === artistId ? { ...a, status: res.data.status } : a)),
      );
      setDetail((prev) =>
        prev && prev.id === artistId ? { ...prev, status: res.data.status } : prev,
      );
    }
  };

  const statusLabels: Array<{ value: ArtistStatus; label: string }> = [
    { value: "PENDING", label: dict.drawer.statusPending },
    { value: "LISTENING", label: dict.drawer.statusListening },
    { value: "RATED", label: dict.drawer.statusRated },
    { value: "DISCARDED", label: dict.drawer.statusDiscarded },
  ];

  const externalLinks = detail ? getArtistExternalLinks(detail.name) : null;

  return (
    <main className="w-full min-h-[calc(100dvh-3rem)] sm:min-h-dvh">
      <div className="border-b border-line px-4 py-5 sm:px-6 sm:py-6">
        <h1
          data-page-heading
          className="font-display text-[clamp(1.85rem,5vw,3.2rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]"
        >
          {dict.search.title}
        </h1>
        <p className="mt-1.5 hidden font-serif text-[1.1rem] italic text-ink-muted desktop:block">
          {dict.search.subtitle}
        </p>

        <div className="mt-4 flex items-center gap-3 border border-line bg-surface px-3.5 py-2.5 focus-within:border-acid">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-4 w-4 shrink-0 text-ink-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dict.search.placeholder}
            aria-label={dict.search.aria}
            className="w-full min-w-0 bg-transparent font-sans text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          {searching ? (
            <span className="shrink-0 font-mono text-[0.68rem] uppercase text-ink-muted">
              {dict.common.searching}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.1em] sm:px-6">
        <span className="font-semibold text-ink">
          {query.trim() ? dict.search.resultsTitle(artists.length) : dict.search.recentArtistsTitle}
        </span>
        <span className="text-ink-muted">{artists.length}</span>
      </div>

      {artists.length === 0 ? (
        <EmptyState
          title={query.trim() ? dict.search.noMatchesTitle : dict.search.emptyTitle}
          description={
            query.trim() ? dict.search.noMatchesDescription : dict.search.emptyDescription
          }
        />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 tablet-h:grid-cols-3 desktop:grid-cols-4">
          {artists.map((artist) => {
            const imgUrl = toMediaApiUrl(artist.imagePath);
            const isHigh = artist.rating !== null && artist.rating >= 4;
            return (
              <li
                key={artist.id}
                className="border-b border-line transition-colors hover:bg-surface sm:border-r"
              >
                <button
                  type="button"
                  onClick={() => setSelectedArtistId(artist.id)}
                  className="flex h-full w-full cursor-pointer flex-col gap-3 p-4 text-left"
                >
                  <div className="flex items-center gap-3.5">
                    <Artwork
                      src={imgUrl}
                      alt={artist.name}
                      seedText={artist.name}
                      variant="artist"
                      className="h-14 w-14 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate font-display text-[1.08rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                          {artist.name}
                        </div>
                        {artist.rating !== null ? (
                          <span
                            className={`shrink-0 border px-1.5 py-0.5 font-mono text-[0.7rem] ${
                              isHigh
                                ? "border-acid bg-acid font-semibold text-acid-ink"
                                : "border-line-strong text-ink"
                            }`}
                          >
                            {artist.rating}/5
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                        {[artist.country, dict.search.festivalsAppearances(artist.festivals.length)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>

                  {artist.festivals.length > 0 ? (
                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                      {artist.festivals.slice(0, 4).map((fest) => (
                        <span
                          key={fest.editionId}
                          className={`border px-1.5 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] ${
                            fest.isInMyFestivals
                              ? "border-acid bg-acid font-semibold text-acid-ink"
                              : "border-line text-ink-muted"
                          }`}
                        >
                          {fest.name} {fest.year}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={selectedArtistId !== null}
        onClose={() => setSelectedArtistId(null)}
        headerLabel={detail?.name ?? dict.drawer.defaultHeader}
        ariaLabel={detail ? dict.drawer.artistAria(detail.name) : dict.drawer.defaultAria}
      >
        {loadingDetail || !detail ? (
          <div className="p-6 font-mono text-xs uppercase text-ink-muted">
            {dict.drawer.loadingInfo}
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6">
            <Artwork
              src={toMediaApiUrl(detail.imagePath)}
              alt={detail.name}
              seedText={detail.name}
              variant="artist"
              className="aspect-[16/8] w-full"
            />

            <div>
              <h2 className="font-display text-[clamp(1.8rem,4vw,2.75rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                {detail.name}
              </h2>
              {detail.country ? (
                <p className="mt-1.5 font-mono text-[0.74rem] uppercase text-ink-muted">
                  {detail.country}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 border-y border-line py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-wrap gap-1.5">
                {statusLabels.map((item) => (
                  <HairlineButton
                    key={item.value}
                    variant={detail.status === item.value ? "inverted" : "default"}
                    onClick={() => void handleStatus(detail.id, item.value)}
                  >
                    {item.label}
                  </HairlineButton>
                ))}
              </div>
              <RatingControl
                value={detail.rating}
                onRate={(val) => void handleRate(detail.id, val)}
              />
            </div>

            {externalLinks ? (
              <div className="grid grid-cols-3 border border-line">
                <a
                  href={externalLinks.appleMusic}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center border-r border-line px-2 py-3 text-center font-mono text-[0.68rem] uppercase tracking-[0.04em] transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink"
                >
                  Apple Music ↗
                </a>
                <a
                  href={externalLinks.youtube}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center border-r border-line px-2 py-3 text-center font-mono text-[0.68rem] uppercase tracking-[0.04em] transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink"
                >
                  YouTube ↗
                </a>
                <a
                  href={externalLinks.youtubeLive}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center px-2 py-3 text-center font-mono text-[0.68rem] uppercase tracking-[0.04em] transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink"
                >
                  YouTube Live ↗
                </a>
              </div>
            ) : null}

            {/* All Festivals where this artist plays/played — highlighting user's own festivals */}
            <div>
              <div className="mb-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                {dict.drawer.festivalHistoryTitle}
              </div>
              <div className="border-t border-line">
                {detail.festivals.map((appearance) => {
                  const href = festivalCartelPath(
                    { brandSlug: appearance.festivalBrandSlug, year: appearance.festivalYear },
                    { q: detail.name },
                  );
                  return (
                    <Link
                      key={appearance.entryId}
                      href={href}
                      onClick={() => setSelectedArtistId(null)}
                      className={`flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 transition-colors hover:bg-surface ${
                        appearance.isInMyFestivals ? "border-l-4 border-l-acid bg-surface pl-3" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base font-extrabold uppercase tracking-[-0.02em] text-ink">
                            {appearance.festivalName} {appearance.festivalYear}
                          </span>
                          {appearance.isInMyFestivals ? (
                            <span className="bg-acid px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-acid-ink">
                              {dict.search.inMyFestivalsBadge}
                            </span>
                          ) : null}
                        </div>
                        {appearance.day || appearance.stage ? (
                          <div className="mt-0.5 font-mono text-[0.68rem] uppercase text-ink-muted">
                            {[appearance.day, appearance.stage, appearance.setTime]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                      </div>
                      <span className="font-mono text-[0.68rem] uppercase text-ink-muted">
                        {dict.search.openInFestival}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {detail.bio ? (
              <div>
                <div className="mb-2 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                  {dict.drawer.biography}
                </div>
                <p className="font-serif text-[1.12rem] leading-[1.45] text-ink">{detail.bio}</p>
              </div>
            ) : null}
          </div>
        )}
      </Drawer>
    </main>
  );
}
