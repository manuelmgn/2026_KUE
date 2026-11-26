"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { createFestivalAction } from "@/actions/festival-actions";
import { PlaceAutocomplete } from "@/components/features/PlaceAutocomplete";
import type { FestivalArchiveItemDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import type { PlaceCandidate } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface FestivalsViewProps {
  initialFestivals: FestivalArchiveItemDTO[];
  activeFestivalSlug: string | null;
  todayIso: string;
}

function isPastFestival(festival: FestivalArchiveItemDTO, todayIso: string): boolean {
  if (festival.endDate) {
    return festival.endDate < todayIso;
  }
  if (festival.startDate) {
    return festival.startDate < todayIso;
  }
  const currentYear = Number(todayIso.slice(0, 4));
  return festival.year < currentYear;
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

export function FestivalsView({
  initialFestivals,
  activeFestivalSlug,
  todayIso,
}: FestivalsViewProps) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const formId = useId();
  const [festivals, setFestivals] = useState<FestivalArchiveItemDTO[]>(initialFestivals);
  const [showCreate, setShowCreate] = useState(initialFestivals.length === 0);
  const [name, setName] = useState("");
  const [year, setYear] = useState(todayIso.slice(0, 4));
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(null);
  const [locationInvalid, setLocationInvalid] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lineupSourceUrl, setLineupSourceUrl] = useState("");
  const [syncSchedule, setSyncSchedule] = useState<"once" | "12" | "24" | "168">("24");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    const yearMatch = nextStart.match(/^(\d{4})-/);
    if (yearMatch?.[1]) {
      setYear(yearMatch[1]);
    }
    if (endDate && nextStart && endDate < nextStart) {
      setEndDate("");
    }
  };

  const handleCreate = async () => {
    setError(null);
    setCreateNotice(null);
    if (locationQuery.trim().length > 0 && !selectedPlace) {
      setLocationInvalid(true);
      setError(dict.importer.locationInvalidError);
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError(dict.importer.dateOrderError);
      return;
    }

    const trimmedUrl = lineupSourceUrl.trim();
    const autoSyncEnabled = trimmedUrl.length > 0 && syncSchedule !== "once";
    const syncIntervalHours = syncSchedule === "once" ? 24 : Number(syncSchedule);

    setCreating(true);
    try {
      const res = await createFestivalAction({
        name,
        year: Number(year),
        location: selectedPlace ? selectedPlace.name : undefined,
        locationProvince: selectedPlace?.province ?? null,
        locationRegion: selectedPlace?.region ?? null,
        locationCountry: selectedPlace?.country ?? null,
        locationCountryCode: selectedPlace?.countryCode ?? null,
        locationLatitude: selectedPlace?.latitude ?? null,
        locationLongitude: selectedPlace?.longitude ?? null,
        locationPlaceId: selectedPlace?.placeId ?? null,
        startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined,
        endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined,
        lineupSourceUrl: trimmedUrl || null,
        autoSyncEnabled,
        syncIntervalHours,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }

      const createdItem: FestivalArchiveItemDTO = {
        id: res.data.id,
        slug: res.data.slug,
        name: res.data.name,
        year: res.data.year,
        location: res.data.location,
        startDate: startDate || null,
        endDate: endDate || null,
        entriesCount: res.data.initialEntriesCount,
      };
      setFestivals((prev) => [createdItem, ...prev]);
      setShowCreate(false);
      setName("");
      setLocationQuery("");
      setSelectedPlace(null);
      setLocationInvalid(false);
      setStartDate("");
      setEndDate("");
      setLineupSourceUrl("");
      setSyncSchedule("24");
      if (res.data.initialSyncError) {
        setCreateNotice(dict.manage.autoSync.initialImportWarning(res.data.initialSyncError));
      } else if (res.data.initialEntriesCount > 0) {
        setCreateNotice(
          dict.importer.importedSummary(
            res.data.initialEntriesCount,
            res.data.initialNewArtistsCount,
          ),
        );
      }
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const upcoming = festivals
    .filter((fest) => !isPastFestival(fest, todayIso))
    .sort((a, b) => {
      const aKey = a.startDate ?? `${a.year}-99-99`;
      const bKey = b.startDate ?? `${b.year}-99-99`;
      return aKey.localeCompare(bKey);
    });

  const past = festivals
    .filter((fest) => isPastFestival(fest, todayIso))
    .sort((a, b) => {
      const aKey = a.endDate ?? a.startDate ?? `${a.year}-00-00`;
      const bKey = b.endDate ?? b.startDate ?? `${b.year}-00-00`;
      return bKey.localeCompare(aKey);
    });

  const renderSectionList = (items: FestivalArchiveItemDTO[], isPast: boolean) => (
    <ul>
      {items.map((fest, index) => {
        const isActive = fest.slug === activeFestivalSlug;
        const formattedDates = formatDateRange(fest.startDate, fest.endDate, fest.year, locale);
        return (
          <li key={fest.id} className="border-b border-line">
            <Link
              href={`/lineup?festival=${encodeURIComponent(fest.slug)}`}
              className={`flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated sm:px-6 ${
                isActive ? "border-l-4 border-l-acid bg-surface pl-4 sm:pl-5" : ""
              } ${isPast ? "opacity-80 hover:opacity-100" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formattedDates}</span>
                </div>
                <div className="mt-1 font-display text-[1.28rem] font-extrabold uppercase leading-tight tracking-[-0.02em] text-ink">
                  {fest.name} {fest.year}
                </div>
                {fest.location ? (
                  <p className="mt-0.5 font-serif text-[1.02rem] italic text-ink-muted">
                    {fest.location}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {isActive ? (
                  <span className="border border-acid bg-acid px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-acid-ink">
                    {dict.settings.activeBadge}
                  </span>
                ) : (
                  <span className="border border-line px-2 py-0.5 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted">
                    {dict.festivals.openAction}
                  </span>
                )}
                <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                  {dict.workspace.artistsBadgeShort(fest.entriesCount)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <main className="mx-auto w-full max-w-[820px] min-h-[calc(100dvh-56px)] md:border-x md:border-line">
      <div className="flex items-end justify-between gap-4 border-b border-line px-5 py-6 sm:px-6">
        <div>
          <h1 className="font-display text-[clamp(2rem,6vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
            {dict.festivals.title}
          </h1>
          <p className="mt-2 font-serif text-[1.15rem] italic text-ink-muted">
            {dict.festivals.subtitle}
          </p>
        </div>

        <HairlineButton
          variant={showCreate ? "default" : "acid"}
          size="md"
          onClick={() => {
            setError(null);
            setShowCreate((prev) => !prev);
          }}
        >
          {showCreate ? dict.festivals.closeForm : dict.festivals.newFestival}
        </HairlineButton>
      </div>

      {showCreate ? (
        <section
          aria-label={dict.importer.createFestivalAria}
          className="border-b border-line-strong bg-surface px-5 py-5 sm:px-6"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-name`}
                className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.importer.nameLabel}
              </label>
              <input
                id={`${formId}-name`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={dict.importer.namePlaceholder}
                className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-location`}
                className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.importer.locationLabel}
              </label>
              <PlaceAutocomplete
                id={`${formId}-location`}
                value={locationQuery}
                selectedPlace={selectedPlace}
                invalid={locationInvalid}
                onInputChange={(nextValue) => {
                  setLocationQuery(nextValue);
                  setLocationInvalid(false);
                }}
                onSelectPlace={(place) => {
                  setSelectedPlace(place);
                  setLocationInvalid(false);
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-start`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.startDateLabel}
                </label>
                <input
                  id={`${formId}-start`}
                  type="date"
                  value={startDate}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-end`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.endDateLabel}
                </label>
                <input
                  id={`${formId}-end`}
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-year`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.yearLabel}
                </label>
                <input
                  id={`${formId}-year`}
                  type="number"
                  min={1950}
                  max={2100}
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-lineup-url`}
                className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.manage.autoSync.sourceUrlOptionalLabel}
              </label>
              <input
                id={`${formId}-lineup-url`}
                type="url"
                value={lineupSourceUrl}
                onChange={(event) => setLineupSourceUrl(event.target.value)}
                placeholder={dict.manage.autoSync.sourceUrlPlaceholder}
                className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-sync-schedule`}
                className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.manage.autoSync.intervalLabel}
              </label>
              <select
                id={`${formId}-sync-schedule`}
                value={syncSchedule}
                disabled={lineupSourceUrl.trim().length === 0}
                onChange={(event) =>
                  setSyncSchedule(event.target.value as "once" | "12" | "24" | "168")
                }
                className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none disabled:opacity-50"
              >
                <option value="once">{dict.manage.autoSync.intervalOnce}</option>
                <option value="12">{dict.manage.autoSync.intervalHours(12)}</option>
                <option value="24">{dict.manage.autoSync.intervalDays(1)}</option>
                <option value="168">{dict.manage.autoSync.intervalWeek}</option>
              </select>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 border border-line-strong bg-bg px-3 py-2 font-mono text-xs text-ink"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <HairlineButton
              variant="acid"
              size="md"
              disabled={creating || name.trim().length === 0}
              onClick={() => void handleCreate()}
            >
              {creating
                ? lineupSourceUrl.trim().length > 0
                  ? dict.manage.autoSync.creatingAndImporting
                  : dict.importer.creating
                : dict.festivals.createSubmit}
            </HairlineButton>
          </div>
        </section>
      ) : null}

      {createNotice ? (
        <div
          role="status"
          className="border-b border-acid bg-surface px-5 py-3 font-mono text-xs text-ink sm:px-6"
        >
          {createNotice}
        </div>
      ) : null}

      {festivals.length === 0 ? (
        <EmptyState
          title={dict.festivals.emptyTitle}
          description={dict.festivals.emptyDescription}
        />
      ) : (
        <>
          <section aria-labelledby="festivals-upcoming-heading">
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
              <h2 id="festivals-upcoming-heading" className="font-semibold text-ink">
                {dict.festivals.upcomingTitle}
              </h2>
              <span className="text-ink-muted">{upcoming.length}</span>
            </div>
            {upcoming.length > 0 ? (
              renderSectionList(upcoming, false)
            ) : (
              <p className="border-b border-line px-5 py-5 font-serif text-[1.02rem] italic text-ink-muted sm:px-6">
                {dict.festivals.emptyUpcoming}
              </p>
            )}
          </section>

          <section aria-labelledby="festivals-past-heading">
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
              <h2 id="festivals-past-heading" className="font-semibold text-ink-muted">
                {dict.festivals.pastTitle}
              </h2>
              <span className="text-ink-muted">{past.length}</span>
            </div>
            {past.length > 0 ? (
              renderSectionList(past, true)
            ) : (
              <p className="border-b border-line px-5 py-5 font-serif text-[1.02rem] italic text-ink-muted sm:px-6">
                {dict.festivals.emptyPast}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
