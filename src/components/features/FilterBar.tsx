"use client";

import { type RefObject, useEffect, useState } from "react";
import type { RatingFilter, StatusFilter, ViewMode } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface FilterBarProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  status: StatusFilter;
  rating: RatingFilter;
  view: ViewMode;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onRatingChange: (value: RatingFilter) => void;
  onViewChange: (value: ViewMode) => void;
}

export function FilterBar({
  searchInputRef,
  query,
  status,
  rating,
  view,
  onQueryChange,
  onStatusChange,
  onRatingChange,
  onViewChange,
}: FilterBarProps) {
  const { dict } = useI18n();
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <section
      aria-label={dict.filters.sectionAria}
      className="sticky top-[calc(var(--kue-sticky-top)+2.75rem)] z-30 flex flex-col border-b border-line bg-bg sm:h-[50px] sm:flex-row sm:items-stretch sm:overflow-x-auto"
    >
      <div className="flex h-[46px] items-stretch border-b border-line sm:h-auto sm:min-w-[180px] sm:flex-1 sm:border-r sm:border-b-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 sm:px-[18px]">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={isCompact ? dict.nav.search : dict.filters.searchPlaceholder}
            aria-label={dict.filters.searchAria}
            className="w-full min-w-0 bg-transparent font-sans text-[0.92rem] text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <span
            aria-hidden="true"
            className="hidden border border-line px-1.5 py-0.5 font-mono text-[0.72rem] text-ink-muted sm:inline-block"
          >
            /
          </span>
        </div>

        {/* Mobile Grid/Index toggle inline with search */}
        <div className="flex shrink-0 items-stretch border-l border-line sm:hidden">
          <button
            type="button"
            onClick={() => onViewChange("grid")}
            aria-pressed={view === "grid"}
            className={`cursor-pointer px-3 font-mono text-[0.7rem] uppercase tracking-[0.06em] transition-colors ${
              view === "grid"
                ? "bg-acid font-semibold text-acid-ink"
                : "text-ink-muted hover:bg-surface-elevated hover:text-ink"
            }`}
          >
            {dict.filters.viewGrid}
          </button>
          <button
            type="button"
            onClick={() => onViewChange("index")}
            aria-pressed={view === "index"}
            className={`cursor-pointer border-l border-line px-3 font-mono text-[0.7rem] uppercase tracking-[0.06em] transition-colors ${
              view === "index"
                ? "bg-acid font-semibold text-acid-ink"
                : "text-ink-muted hover:bg-surface-elevated hover:text-ink"
            }`}
          >
            {dict.filters.viewIndex}
          </button>
        </div>
      </div>

      <div className="grid h-[42px] grid-cols-2 items-stretch sm:flex sm:h-auto sm:shrink-0">
        <div className="flex min-w-0 items-center border-r border-line px-3 sm:px-3.5">
          <select
            aria-label={dict.filters.statusAria}
            value={status}
            onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
            className="w-full min-w-0 cursor-pointer truncate bg-bg pr-1.5 font-mono text-[0.74rem] uppercase tracking-[0.06em] text-ink outline-none sm:w-auto"
          >
            <option value="ALL" className="bg-bg text-ink">
              {dict.filters.statusAll}
            </option>
            <option value="PENDING" className="bg-bg text-ink">
              {dict.filters.statusPending}
            </option>
            <option value="LISTENING" className="bg-bg text-ink">
              {dict.filters.statusListening}
            </option>
            <option value="RATED" className="bg-bg text-ink">
              {dict.filters.statusRated}
            </option>
            <option value="DISCARDED" className="bg-bg text-ink">
              {dict.filters.statusDiscarded}
            </option>
          </select>
        </div>

        <div className="flex min-w-0 items-center px-3 sm:border-r sm:border-line sm:px-3.5">
          <select
            aria-label={dict.filters.ratingAria}
            value={rating}
            onChange={(event) => onRatingChange(event.target.value as RatingFilter)}
            className="w-full min-w-0 cursor-pointer truncate bg-bg pr-1.5 font-mono text-[0.74rem] uppercase tracking-[0.06em] text-ink outline-none sm:w-auto"
          >
            <option value="ALL" className="bg-bg text-ink">
              {dict.filters.ratingAll}
            </option>
            <option value="MUST" className="bg-bg text-ink">
              {dict.filters.ratingMust}
            </option>
            <option value="5" className="bg-bg text-ink">
              5 / 5
            </option>
            <option value="4" className="bg-bg text-ink">
              4 / 5
            </option>
            <option value="3" className="bg-bg text-ink">
              3 / 5
            </option>
            <option value="LOW" className="bg-bg text-ink">
              {dict.filters.ratingLow}
            </option>
            <option value="UNRATED" className="bg-bg text-ink">
              {dict.filters.ratingUnrated}
            </option>
          </select>
        </div>
      </div>

      {/* Desktop Grid/Index toggle */}
      <div className="hidden shrink-0 items-stretch sm:flex">
        <button
          type="button"
          onClick={() => onViewChange("grid")}
          aria-pressed={view === "grid"}
          className={`cursor-pointer px-4 font-mono text-[0.74rem] uppercase tracking-[0.08em] transition-colors ${
            view === "grid"
              ? "bg-acid font-semibold text-acid-ink"
              : "text-ink-muted hover:bg-surface-elevated hover:text-ink"
          }`}
        >
          {dict.filters.viewGrid}
        </button>
        <button
          type="button"
          onClick={() => onViewChange("index")}
          aria-pressed={view === "index"}
          className={`cursor-pointer border-l border-line px-4 font-mono text-[0.74rem] uppercase tracking-[0.08em] transition-colors ${
            view === "index"
              ? "bg-acid font-semibold text-acid-ink"
              : "text-ink-muted hover:bg-surface-elevated hover:text-ink"
          }`}
        >
          {dict.filters.viewIndex}
        </button>
      </div>
    </section>
  );
}
