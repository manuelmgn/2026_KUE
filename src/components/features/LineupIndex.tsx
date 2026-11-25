"use client";

import type { LineupEntryDTO } from "@/components/features/types";
import { RatingControl } from "@/components/ui/RatingControl";
import { getEffectiveEntryRating, getEffectiveEntryStatus } from "@/domain/rating";

interface LineupIndexProps {
  entries: LineupEntryDTO[];
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  onSelectEntry: (entryId: string) => void;
  onQuickRate: (artistId: string, rating: number) => void;
  onQuickDiscard: (artistId: string) => void;
}

export function LineupIndex({
  entries,
  focusedIndex,
  onFocusIndex,
  onSelectEntry,
  onQuickRate,
  onQuickDiscard,
}: LineupIndexProps) {
  return (
    <section aria-label="Cartel en índice de triaje" className="w-full">
      {entries.map((entry, idx) => {
        const lead = entry.artists[0];
        if (!lead) {
          return null;
        }
        const rating = getEffectiveEntryRating(entry.artists);
        const status = getEffectiveEntryStatus(entry.artists);
        const isDiscarded = status === "DISCARDED";
        const isFocused = idx === focusedIndex;
        const noteText = entry.artists.find((a) => a.notes.trim().length > 0)?.notes ?? "—";

        return (
          <div
            key={entry.id}
            data-focused={isFocused ? "true" : "false"}
            className={`grid min-h-[58px] grid-cols-[54px_minmax(180px,2fr)_140px_minmax(140px,2fr)_216px] items-center border-b border-line border-l-4 transition-colors max-md:grid-cols-[44px_1fr_auto] ${
              isFocused
                ? "border-l-acid bg-surface"
                : "border-l-transparent hover:border-l-acid hover:bg-surface"
            } ${isDiscarded ? "opacity-40" : ""}`}
          >
            <div className="pl-3.5 font-mono text-[0.76rem] text-ink-muted">
              {String(idx + 1).padStart(2, "0")}
            </div>

            <button
              type="button"
              onMouseEnter={() => onFocusIndex(idx)}
              onFocus={() => onFocusIndex(idx)}
              onClick={() => onSelectEntry(entry.id)}
              className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2.5 text-left"
            >
              <span
                className={`font-display text-[1.05rem] font-bold ${
                  isDiscarded ? "line-through" : ""
                }`}
              >
                {entry.billingName}
              </span>
              {entry.subtitle ? (
                <span className="font-serif text-[1rem] italic text-ink-muted">
                  {entry.subtitle}
                </span>
              ) : null}
              {entry.artists.length > 1 ? (
                <span className="border border-line px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-ink-muted">
                  {entry.artists.length} ART
                </span>
              ) : null}
            </button>

            <div className="truncate font-mono text-[0.74rem] uppercase text-ink-muted max-md:hidden">
              {entry.day ?? "TBA"}
              {entry.stage ? ` · ${entry.stage}` : ""}
            </div>

            <div className="truncate px-3 font-serif text-[1rem] text-ink-muted max-md:hidden">
              {noteText}
            </div>

            <div className="flex justify-end pr-4">
              <RatingControl
                compact
                value={rating}
                isDiscarded={isDiscarded}
                onRate={(value) => onQuickRate(lead.id, value)}
                onDiscard={() => onQuickDiscard(lead.id)}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
