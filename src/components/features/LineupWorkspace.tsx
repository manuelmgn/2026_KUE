"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setArtistRatingAction, setArtistStatusAction } from "@/actions/artist-actions";
import { ArtistDrawer } from "@/components/features/ArtistDrawer";
import { FilterBar } from "@/components/features/FilterBar";
import { LineupGrid } from "@/components/features/LineupGrid";
import { LineupIndex } from "@/components/features/LineupIndex";
import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { matchesEntryFilters, resolveStatusOnRating } from "@/domain/rating";
import type { ArtistStatus, RatingFilter, StatusFilter, ViewMode } from "@/domain/schemas";

interface LineupWorkspaceProps {
  festival: FestivalSummary;
  initialEntries: LineupEntryDTO[];
  initialQuery: string;
  initialStatus: StatusFilter;
  initialRating: RatingFilter;
  initialView: ViewMode;
}

type OptimisticAction =
  | { type: "rate"; artistId: string; rating: number }
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
  initialEntries,
  initialQuery,
  initialStatus,
  initialRating,
  initialView,
}: LineupWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [baseEntries, setBaseEntries] = useState<LineupEntryDTO[]>(initialEntries);
  const [optimisticEntries, addOptimistic] = useOptimistic(baseEntries, applyOptimistic);
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [rating, setRating] = useState<RatingFilter>(initialRating);
  const [view, setView] = useState<ViewMode>(initialView);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  useEffect(() => {
    setBaseEntries(initialEntries);
  }, [initialEntries]);

  const syncUrlParams = (patch: {
    q?: string;
    status?: StatusFilter;
    rating?: RatingFilter;
    view?: ViewMode;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("festival", festival.slug);

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

    router.replace(`/?${params.toString()}`, { scroll: false });
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
    startTransition(async () => {
      addOptimistic({ type: "rate", artistId, rating: value });
      const updated = await setArtistRatingAction({ artistId, rating: value });
      setBaseEntries((prev) =>
        applyOptimistic(prev, {
          type: "rate",
          artistId: updated.id,
          rating: updated.rating ?? value,
        }),
      );
    });
  };

  const handleStatusArtist = (artistId: string, nextStatus: ArtistStatus) => {
    startTransition(async () => {
      addOptimistic({ type: "status", artistId, status: nextStatus });
      const updated = await setArtistStatusAction({ artistId, status: nextStatus });
      setBaseEntries((prev) =>
        applyOptimistic(prev, { type: "status", artistId: updated.id, status: updated.status }),
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
        if (openEntryId) {
          setOpenEntryId(null);
        } else if (isTyping && target instanceof HTMLElement) {
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

  return (
    <main>
      <section className="flex flex-wrap items-end justify-between gap-4 px-6 pt-10 pb-8">
        <h1 className="font-display text-[clamp(2.5rem,6vw,5.5rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.04em]">
          {festival.name} {festival.year}
        </h1>
        {festival.location ? (
          <p className="font-serif text-[clamp(1.35rem,2.4vw,1.9rem)] italic leading-[1.1] text-ink-muted">
            {festival.location}
          </p>
        ) : null}
      </section>

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

      {visibleEntries.length === 0 ? (
        <EmptyState
          title={baseEntries.length === 0 ? "Cartel vacío" : "Sin coincidencias"}
          description={
            baseEntries.length === 0
              ? "Pega un anuncio o lista de artistas en el importador para poblar este festival."
              : "Prueba ajustando la búsqueda, el estado o el filtro de nota."
          }
          action={
            baseEntries.length === 0 ? (
              <Link
                href={`/import?festival=${encodeURIComponent(festival.slug)}`}
                className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
              >
                Importar cartel →
              </Link>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <LineupGrid entries={visibleEntries} onSelectEntry={(id) => setOpenEntryId(id)} />
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

      <ArtistDrawer
        entry={openEntry}
        onClose={() => setOpenEntryId(null)}
        onRateArtist={handleRateArtist}
        onStatusArtist={handleStatusArtist}
        onNotesSaved={handleNotesSaved}
        onEntryUpdated={handleEntryUpdated}
      />
    </main>
  );
}
