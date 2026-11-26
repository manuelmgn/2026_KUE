"use client";

import { useEffect, useRef } from "react";
import type { LineupEntryDTO } from "@/components/features/types";
import { RatingControl } from "@/components/ui/RatingControl";
import { getEffectiveEntryRating, getEffectiveEntryStatus } from "@/domain/rating";
import { useI18n } from "@/i18n/context";

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
  const { dict } = useI18n();
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const row = rowRefs.current.get(focusedIndex);
    row?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  return (
    <section aria-label={dict.workspace.indexAria} className="w-full">
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
            ref={(el) => {
              if (el) {
                rowRefs.current.set(idx, el);
              } else {
                rowRefs.current.delete(idx);
              }
            }}
            data-focused={isFocused ? "true" : "false"}
            className={`grid min-h-[58px] grid-cols-[40px_1fr] items-center border-b border-line border-l-4 py-2.5 pr-4 transition-colors md:grid-cols-[54px_minmax(180px,2fr)_140px_minmax(140px,2fr)_216px] md:py-0 md:pr-0 ${
              isFocused
                ? "border-l-acid bg-surface"
                : "border-l-transparent hover:border-l-acid hover:bg-surface"
            } ${isDiscarded ? "opacity-40" : ""}`}
          >
            <div className="pl-3 font-mono text-[0.74rem] text-ink-muted md:pl-3.5 md:text-[0.76rem]">
              {String(idx + 1).padStart(2, "0")}
            </div>

            <button
              type="button"
              onMouseEnter={() => onFocusIndex(idx)}
              onFocus={() => onFocusIndex(idx)}
              onClick={() => onSelectEntry(entry.id)}
              className="flex min-w-0 cursor-pointer flex-wrap items-baseline gap-x-2 px-2 py-1 text-left md:px-3 md:py-2.5"
            >
              <span
                className={`font-display text-[1.08rem] font-bold leading-snug md:text-[1.05rem] ${
                  isDiscarded ? "line-through" : ""
                }`}
              >
                {entry.billingName}
              </span>
              {entry.subtitle ? (
                <span className="font-serif text-[0.98rem] italic text-ink-muted md:text-[1rem]">
                  {entry.subtitle}
                </span>
              ) : null}
              {entry.artists.length > 1 ? (
                <span className="border border-line px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-ink-muted">
                  {dict.workspace.artistsBadgeShort(entry.artists.length)}
                </span>
              ) : null}
            </button>

            <div className="truncate font-mono text-[0.74rem] uppercase text-ink-muted max-md:hidden">
              {entry.day ?? dict.common.tba}
              {entry.stage ? ` · ${entry.stage}` : ""}
            </div>

            <div className="truncate px-3 font-serif text-[1rem] text-ink-muted max-md:hidden">
              {noteText}
            </div>

            <div className="col-span-2 mt-2 pl-10 md:col-span-1 md:mt-0 md:flex md:justify-end md:pl-0 md:pr-4">
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
