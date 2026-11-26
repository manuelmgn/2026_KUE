"use client";

import type { LineupEntryDTO } from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { toMediaApiUrl } from "@/domain/media-url";
import { getEffectiveEntryRating, getEffectiveEntryStatus } from "@/domain/rating";
import { useI18n } from "@/i18n/context";

interface LineupGridProps {
  entries: LineupEntryDTO[];
  onSelectEntry: (entryId: string) => void;
  selectedEntryId?: string | null;
  compactForPane?: boolean;
}

export function LineupGrid({
  entries,
  onSelectEntry,
  selectedEntryId = null,
  compactForPane = false,
}: LineupGridProps) {
  const { dict } = useI18n();

  return (
    <section
      aria-label={dict.workspace.gridAria}
      className={`grid grid-cols-1 sm:grid-cols-2 tablet-h:grid-cols-3 desktop:grid-cols-4 ${
        compactForPane ? "wide:grid-cols-3" : "wide:grid-cols-5"
      }`}
    >
      {entries.map((entry, idx) => {
        const lead = entry.artists[0];
        const rating = getEffectiveEntryRating(entry.artists);
        const status = getEffectiveEntryStatus(entry.artists);
        const isDiscarded = status === "DISCARDED";
        const isSelected = selectedEntryId === entry.id;
        const imageUrl = toMediaApiUrl(lead?.imagePath);
        const noteText = entry.artists.find((a) => a.notes.trim().length > 0)?.notes ?? "";

        const ratingClass =
          rating !== null && rating >= 4
            ? "border-acid bg-acid font-semibold text-acid-ink"
            : rating !== null
              ? "border-line text-ink"
              : "border-line text-ink-muted";

        return (
          <article
            key={entry.id}
            className={`group flex cursor-pointer flex-col gap-3.5 border-b border-line p-4 transition-colors hover:bg-surface sm:border-r ${
              isDiscarded ? "opacity-[0.38]" : ""
            } ${isSelected ? "bg-surface ring-1 ring-inset ring-acid" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelectEntry(entry.id)}
              className="flex flex-1 cursor-pointer flex-col gap-3.5 text-left"
            >
              <div className="flex items-center justify-between font-mono text-[0.72rem] tracking-[0.05em] text-ink-muted">
                <span className="truncate uppercase">
                  {String(idx + 1).padStart(2, "0")} · {entry.day ?? dict.common.tba}
                  {entry.stage ? ` · ${entry.stage}` : ""}
                </span>
                <span
                  className={`shrink-0 border px-2 py-0.5 font-mono text-[0.74rem] ${ratingClass}`}
                >
                  {rating !== null ? `${rating}/5` : "—"}
                </span>
              </div>

              <div className="relative w-full">
                <Artwork
                  src={imageUrl}
                  alt={entry.billingName}
                  seedText={entry.billingName}
                  variant="artist"
                  className="aspect-[16/10] w-full"
                />
                {entry.artists.length > 1 ? (
                  <span className="absolute bottom-0 left-0 border-t border-r border-line bg-bg px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-ink">
                    {dict.workspace.artistsBadge(entry.artists.length)}
                  </span>
                ) : null}
              </div>

              <div>
                <h2
                  className={`font-display text-[1.3rem] font-extrabold leading-[1.05] tracking-[-0.02em] ${
                    isDiscarded ? "line-through" : ""
                  }`}
                >
                  {entry.billingName}
                </h2>
                {entry.subtitle ? (
                  <p className="mt-1 font-serif text-[1.1rem] italic text-ink-muted">
                    {entry.subtitle}
                  </p>
                ) : null}
              </div>

              {noteText ? (
                <p className="mt-auto truncate border-t border-line pt-2.5 font-serif text-[1rem] text-ink-muted">
                  {noteText}
                </p>
              ) : null}
            </button>
          </article>
        );
      })}
    </section>
  );
}
