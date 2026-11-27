"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setArtistRatingAction, setArtistStatusAction } from "@/actions/artist-actions";
import { addEditionToMyFestivalsAction } from "@/actions/festival-actions";
import { ArtistDrawer } from "@/components/features/ArtistDrawer";
import { FestivalHeaderNav } from "@/components/features/FestivalHeaderNav";
import { FilterBar } from "@/components/features/FilterBar";
import { LineupGrid } from "@/components/features/LineupGrid";
import { LineupIndex } from "@/components/features/LineupIndex";
import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { festivalCartelPath, festivalEditPath } from "@/domain/festival-routes";
import { matchesEntryFilters, resolveStatusOnRating } from "@/domain/rating";
import type { ArtistStatus, RatingFilter, StatusFilter, ViewMode } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface LineupWorkspaceProps {
  festival: FestivalSummary;
  isInMyFestivals?: boolean;
  isAdmin?: boolean;
  initialEntries: LineupEntryDTO[];
  initialQuery: string;
  initialStatus: StatusFilter;
  initialRating: RatingFilter;
  initialView: ViewMode;
}

type OptimisticAction =
  | { type: "rate"; artistId: string; rating: number | null }
  | { type: "status"; artistId: string; status: ArtistStatus }
  | { type: "notes"; artistId: string; notes: string }
  | {
      type: "entry";
      entryId: string;
      patch: {
        day: string | null;
        stage: string | null;
        setTime: string | null;
        liveRating: number | null;
        liveNotes: string;
      };
    };

function applyOptimistic(entries: LineupEntryDTO[], action: OptimisticAction): LineupEntryDTO[] {
  if (action.type === "entry") {
    return entries.map((entry) =>
      entry.id === action.entryId ? { ...entry, ...action.patch } : entry,
    );
  }

  return entries.map((entry) => ({
    ...entry,
    artists: entry.artists.map((artist) => {
      if (artist.id !== action.artistId) {
        return artist;
      }
      if (action.type === "rate") {
        return {
          ...artist,
          rating: action.rating,
          status: resolveStatusOnRating(artist.status, action.rating),
        };
      }
      if (action.type === "status") {
        return { ...artist, status: action.status };
      }
      return { ...artist, notes: action.notes };
    }),
  }));
}

export function LineupWorkspace({
  festival,
  isInMyFestivals = true,
  isAdmin = false,
  initialEntries,
  initialQuery,
  initialStatus,
  initialRating,
  initialView,
}: LineupWorkspaceProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [inMyFestivals, setInMyFestivals] = useState(isInMyFestivals);
  const [addingToMine, setAddingToMine] = useState(false);

  useEffect(() => {
    setInMyFestivals(isInMyFestivals);
  }, [isInMyFestivals]);

  const handleAddCurrentEdition = async () => {
    setActionError(null);
    setAddingToMine(true);
    try {
      const res = await addEditionToMyFestivalsAction(festival.id);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setInMyFestivals(true);
      router.refresh();
    } finally {
      setAddingToMine(false);
    }
  };

  const [baseEntries, setBaseEntries] = useState<LineupEntryDTO[]>(initialEntries);
  const [optimisticEntries, addOptimistic] = useOptimistic(baseEntries, applyOptimistic);
  const [, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [rating, setRating] = useState<RatingFilter>(initialRating);
  const [view, setView] = useState<ViewMode>(initialView);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [isWideViewport, setIsWideViewport] = useState(false);

  useEffect(() => {
    setBaseEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 100rem)");
    const sync = () => setIsWideViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Update URL search params via native History API (integrated with Next.js 16 router)
  // so typing in the search bar or toggling filters never triggers a server RSC roundtrip.
  const syncUrlParams = (patch: {
    q?: string;
    status?: StatusFilter;
    rating?: RatingFilter;
    view?: ViewMode;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("festival");

    const nextQ = patch.q ?? query;
    const nextStatus = patch.status ?? status;
    const nextRating = patch.rating ?? rating;
    const nextView = patch.view ?? view;

    if (nextQ.trim()) {
      params.set("q", nextQ.trim());
    } else {
      params.delete("q");
    }

    if (nextStatus !== "ALL") {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    if (nextRating !== "ALL") {
      params.set("rating", nextRating);
    } else {
      params.delete("rating");
    }

    if (nextView !== "grid") {
      params.set("view", nextView);
    } else {
      params.delete("view");
    }

    const basePath = festivalCartelPath(festival);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${basePath}?${qs}` : basePath);
  };

  const visibleEntries = optimisticEntries.filter((entry) =>
    matchesEntryFilters(
      {
        billingName: entry.billingName,
        subtitle: entry.subtitle,
        day: entry.day,
        stage: entry.stage,
        artists: entry.artists,
      },
      { query, status, rating },
    ),
  );

  const handleRateArtist = (artistId: string, value: number) => {
    setActionError(null);
    startTransition(async () => {
      addOptimistic({ type: "rate", artistId, rating: value });
      const res = await setArtistRatingAction({ artistId, rating: value });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setBaseEntries((prev) =>
        applyOptimistic(prev, {
          type: "rate",
          artistId: res.data.id,
          rating: res.data.rating,
        }),
      );
    });
  };

  const handleStatusArtist = (artistId: string, nextStatus: ArtistStatus) => {
    setActionError(null);
    startTransition(async () => {
      addOptimistic({ type: "status", artistId, status: nextStatus });
      const res = await setArtistStatusAction({ artistId, status: nextStatus });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setBaseEntries((prev) =>
        applyOptimistic(prev, {
          type: "status",
          artistId: res.data.id,
          status: res.data.status,
        }),
      );
    });
  };

  const handleNotesSaved = (artistId: string, notes: string) => {
    setBaseEntries((prev) => applyOptimistic(prev, { type: "notes", artistId, notes }));
  };

  const handleEntryUpdated = (
    entryId: string,
    patch: {
      day: string | null;
      stage: string | null;
      setTime: string | null;
      liveRating: number | null;
      liveNotes: string;
    },
  ) => {
    setBaseEntries((prev) => applyOptimistic(prev, { type: "entry", entryId, patch }));
  };

  const actionsRef = useRef({
    rate: handleRateArtist,
    status: handleStatusArtist,
  });
  actionsRef.current = {
    rate: handleRateArtist,
    status: handleStatusArtist,
  };

  // Keyboard triage for ÍNDICE view + global '/' search shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        if (!openEntryId && isTyping && target instanceof HTMLElement) {
          target.blur();
        }
        return;
      }

      if (isTyping || openEntryId !== null) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (view !== "index" || visibleEntries.length === 0) {
        return;
      }

      const clampedIdx = Math.min(focusedIndex, visibleEntries.length - 1);
      const current = visibleEntries[clampedIdx];
      const lead = current?.artists[0];

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setFocusedIndex((prev) => Math.min(visibleEntries.length - 1, prev + 1));
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (["1", "2", "3", "4", "5"].includes(event.key) && lead) {
        event.preventDefault();
        actionsRef.current.rate(lead.id, Number(event.key));
      } else if ((event.key === "0" || event.key === "x") && lead) {
        event.preventDefault();
        actionsRef.current.status(lead.id, "DISCARDED");
      } else if (event.key === "Enter" && current) {
        event.preventDefault();
        setOpenEntryId(current.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, visibleEntries, focusedIndex, openEntryId]);

  const openEntry = optimisticEntries.find((entry) => entry.id === openEntryId) ?? null;
  const showInlinePane = isWideViewport && openEntry !== null;

  return (
    <main className="w-full">
      <FestivalHeaderNav
        brandSlug={festival.brandSlug}
        name={festival.name}
        year={festival.year}
        location={festival.location}
        activeTab="cartel"
        isAdmin={isAdmin}
        rightSlot={
          !inMyFestivals ? (
            <HairlineButton
              variant="acid"
              size="sm"
              disabled={addingToMine}
              onClick={() => void handleAddCurrentEdition()}
            >
              {dict.catalog.addEditionAction}
            </HairlineButton>
          ) : undefined
        }
      />

      <FilterBar
        searchInputRef={searchInputRef}
        query={query}
        status={status}
        rating={rating}
        view={view}
        onQueryChange={(next) => {
          setQuery(next);
          setFocusedIndex(0);
          syncUrlParams({ q: next });
        }}
        onStatusChange={(next) => {
          setStatus(next);
          setFocusedIndex(0);
          syncUrlParams({ status: next });
        }}
        onRatingChange={(next) => {
          setRating(next);
          setFocusedIndex(0);
          syncUrlParams({ rating: next });
        }}
        onViewChange={(next) => {
          setView(next);
          syncUrlParams({ view: next });
        }}
      />

      {actionError ? (
        <div
          role="alert"
          className="flex items-center justify-between border-b border-line bg-surface px-6 py-2.5 font-mono text-xs text-ink"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="cursor-pointer font-mono text-xs uppercase text-ink-muted hover:text-ink"
          >
            {dict.common.close}
          </button>
        </div>
      ) : null}

      <div className={showInlinePane ? "wide:grid wide:grid-cols-[minmax(0,1fr)_440px]" : ""}>
        <div className="min-w-0">
          {visibleEntries.length === 0 ? (
            <EmptyState
              title={
                baseEntries.length === 0
                  ? dict.workspace.emptyLineupTitle
                  : dict.workspace.noMatchesTitle
              }
              description={
                baseEntries.length === 0
                  ? dict.workspace.emptyLineupDescription
                  : dict.workspace.noMatchesDescription
              }
              action={
                baseEntries.length === 0 && isAdmin ? (
                  <Link
                    href={festivalEditPath(festival)}
                    className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
                  >
                    {dict.workspace.emptyLineupAction}
                  </Link>
                ) : undefined
              }
            />
          ) : view === "grid" ? (
            <LineupGrid
              entries={visibleEntries}
              selectedEntryId={openEntryId}
              compactForPane={showInlinePane}
              onSelectEntry={(id) => setOpenEntryId(id)}
            />
          ) : (
            <LineupIndex
              entries={visibleEntries}
              focusedIndex={Math.min(focusedIndex, visibleEntries.length - 1)}
              onFocusIndex={setFocusedIndex}
              onSelectEntry={(id) => setOpenEntryId(id)}
              onQuickRate={handleRateArtist}
              onQuickDiscard={(artistId) => handleStatusArtist(artistId, "DISCARDED")}
            />
          )}
        </div>

        {showInlinePane ? (
          <ArtistDrawer
            mode="inline"
            entry={openEntry}
            isAdmin={isAdmin}
            onClose={() => setOpenEntryId(null)}
            onRateArtist={handleRateArtist}
            onStatusArtist={handleStatusArtist}
            onNotesSaved={handleNotesSaved}
            onEntryUpdated={handleEntryUpdated}
          />
        ) : null}
      </div>

      {!isWideViewport ? (
        <ArtistDrawer
          mode="drawer"
          entry={openEntry}
          isAdmin={isAdmin}
          onClose={() => setOpenEntryId(null)}
          onRateArtist={handleRateArtist}
          onStatusArtist={handleStatusArtist}
          onNotesSaved={handleNotesSaved}
          onEntryUpdated={handleEntryUpdated}
        />
      ) : null}
    </main>
  );
}
