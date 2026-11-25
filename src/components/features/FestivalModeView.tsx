"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { getEffectiveEntryRating } from "@/domain/rating";

interface FestivalModeViewProps {
  festival: FestivalSummary;
  entries: LineupEntryDTO[];
}

export function FestivalModeView({ festival, entries }: FestivalModeViewProps) {
  const [selectedDay, setSelectedDay] = useState<string>("TODOS");
  const [onlyMustSee, setOnlyMustSee] = useState<boolean>(true);
  const [offlineEntries, setOfflineEntries] = useState<LineupEntryDTO[]>(entries);

  useEffect(() => {
    const cacheKey = `kue-festival-mode:${festival.slug}`;
    if (entries.length > 0) {
      setOfflineEntries(entries);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(entries));
      } catch {
        // Ignore storage quota errors
      }
      return;
    }

    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        setOfflineEntries(JSON.parse(saved) as LineupEntryDTO[]);
      }
    } catch {
      // Ignore malformed cache
    }
  }, [festival.slug, entries]);

  const activeEntries = offlineEntries.filter((entry) =>
    entry.artists.some((artist) => artist.status !== "DISCARDED"),
  );

  const ratingFiltered = onlyMustSee
    ? activeEntries.filter((entry) => {
        const rating = getEffectiveEntryRating(entry.artists);
        return rating !== null && rating >= 4;
      })
    : activeEntries;

  const uniqueDays = Array.from(
    new Set(ratingFiltered.map((entry) => entry.day).filter((day): day is string => Boolean(day))),
  );
  const days = ["TODOS", ...uniqueDays];

  const effectiveDay = days.includes(selectedDay) ? selectedDay : "TODOS";
  const visible =
    effectiveDay === "TODOS"
      ? ratingFiltered
      : ratingFiltered.filter((entry) => entry.day === effectiveDay);

  return (
    <main className="mx-auto w-full max-w-[640px] border-x border-line min-h-[calc(100dvh-56px)]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
        <div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[-0.03em]">
            {festival.name} {festival.year}
          </h1>
          {festival.location ? (
            <p className="mt-1 font-serif text-base italic text-ink-muted">{festival.location}</p>
          ) : null}
        </div>

        <button
          type="button"
          aria-pressed={onlyMustSee}
          onClick={() => setOnlyMustSee((prev) => !prev)}
          className={`cursor-pointer border px-3 py-2 font-mono text-[0.72rem] uppercase tracking-[0.06em] transition-colors ${
            onlyMustSee
              ? "border-acid bg-acid font-semibold text-acid-ink"
              : "border-line text-ink-muted hover:border-ink hover:text-ink"
          }`}
        >
          {onlyMustSee ? "≥4★ Imprescindibles" : "Todos los pases"}
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Filtrar por día"
        className="flex overflow-x-auto border-b border-line bg-bg"
      >
        {days.map((day) => {
          const isActive = effectiveDay === day;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedDay(day)}
              className={`shrink-0 cursor-pointer border-r border-line px-3.5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-acid font-semibold text-acid-ink"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Sin pases en esta vista"
          description={
            onlyMustSee
              ? "Todavía no tienes artistas puntuados con 4★ o 5★ para este filtro."
              : "No hay entradas cargadas para este día."
          }
          action={
            onlyMustSee ? (
              <button
                type="button"
                onClick={() => setOnlyMustSee(false)}
                className="cursor-pointer border border-line px-4 py-2 font-mono text-xs uppercase text-ink hover:border-ink"
              >
                Ver todos los pases
              </button>
            ) : (
              <Link
                href={`/?festival=${encodeURIComponent(festival.slug)}`}
                className="inline-flex border border-acid bg-acid px-4 py-2 font-mono text-xs font-semibold uppercase text-acid-ink"
              >
                Volver al cartel
              </Link>
            )
          }
        />
      ) : (
        <ul aria-label="Lista de pases en Modo Festival">
          {visible.map((entry) => {
            const rating = getEffectiveEntryRating(entry.artists);
            const noteText = entry.artists.find((a) => a.notes.trim().length > 0)?.notes ?? "";
            const metaLine = [entry.day ?? "TBA", entry.setTime, entry.stage]
              .filter(Boolean)
              .join(" · ");

            return (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                    {metaLine}
                  </div>
                  <div className="mt-0.5 font-display text-[1.08rem] font-extrabold leading-tight tracking-[-0.02em]">
                    {entry.billingName}
                  </div>
                  {entry.subtitle ? (
                    <div className="font-serif text-[0.98rem] italic text-ink-muted">
                      {entry.subtitle}
                    </div>
                  ) : null}
                  {noteText ? (
                    <p className="mt-1 line-clamp-2 font-serif text-[0.98rem] leading-snug text-ink-muted">
                      {noteText}
                    </p>
                  ) : null}
                </div>

                <span
                  className={`shrink-0 border px-2 py-0.5 font-mono text-[0.74rem] ${
                    rating !== null && rating >= 4
                      ? "border-acid bg-acid font-semibold text-acid-ink"
                      : "border-line text-ink-muted"
                  }`}
                >
                  {rating !== null ? `${rating}/5` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
