"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { deleteEntryAction } from "@/actions/entry-actions";
import { updateFestivalAction } from "@/actions/festival-actions";
import { importLineupAction } from "@/actions/import-actions";
import { FestivalAutoSyncPanel } from "@/components/features/FestivalAutoSyncPanel";
import { PlaceAutocomplete } from "@/components/features/PlaceAutocomplete";
import type { FestivalEditDTO, LineupEntryDTO } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { parseRawLineup } from "@/domain/lineup-parser";
import type { PlaceCandidate } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface FestivalManageViewProps {
  festival: FestivalEditDTO;
  initialEntries: LineupEntryDTO[];
  hasGeminiApiKey: boolean;
}

type ManageTab = "details" | "artists" | "import" | "autosync";

interface EditableImportRow {
  key: string;
  included: boolean;
  billingName: string;
  artistsCsv: string;
  subtitle: string;
  day: string;
  stage: string;
  setTime: string;
}

function buildInitialPlace(festival: FestivalEditDTO): PlaceCandidate | null {
  if (!festival.location) {
    return null;
  }
  return {
    placeId: festival.locationPlaceId ?? `saved-${festival.id}`,
    name: festival.location,
    province: festival.locationProvince,
    region: festival.locationRegion,
    country: festival.locationCountry,
    countryCode: festival.locationCountryCode,
    latitude: festival.locationLatitude ?? 0,
    longitude: festival.locationLongitude ?? 0,
  };
}

export function FestivalManageView({
  festival,
  initialEntries,
  hasGeminiApiKey,
}: FestivalManageViewProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const formId = useId();

  const [activeTab, setActiveTab] = useState<ManageTab>("details");

  // 1. Festival details state
  const [name, setName] = useState(festival.name);
  const [year, setYear] = useState(String(festival.year));
  const [locationQuery, setLocationQuery] = useState(festival.location ?? "");
  const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(() =>
    buildInitialPlace(festival),
  );
  const [locationInvalid, setLocationInvalid] = useState(false);
  const [startDate, setStartDate] = useState(festival.startDate ?? "");
  const [endDate, setEndDate] = useState(festival.endDate ?? "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // 2. Artists removal state
  const [entries, setEntries] = useState<LineupEntryDTO[]>(initialEntries);
  const [artistQuery, setArtistQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  // 3. Import new artists state
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<EditableImportRow[]>([]);
  const [showScheduleColumns, setShowScheduleColumns] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    createdEntriesCount: number;
    newArtistsCount: number;
  } | null>(null);

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    setDetailsSaved(false);
    const yearMatch = nextStart.match(/^(\d{4})-/);
    if (yearMatch?.[1]) {
      setYear(yearMatch[1]);
    }
    if (endDate && nextStart && endDate < nextStart) {
      setEndDate("");
    }
  };

  const handleSaveDetails = async () => {
    setDetailsError(null);
    setDetailsSaved(false);

    if (locationQuery.trim().length > 0 && !selectedPlace) {
      setLocationInvalid(true);
      setDetailsError(dict.importer.locationInvalidError);
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setDetailsError(dict.importer.dateOrderError);
      return;
    }

    setSavingDetails(true);
    try {
      const hasLocation = locationQuery.trim().length > 0 && selectedPlace !== null;
      const isSavedPlaceholderPlace = selectedPlace?.placeId === `saved-${festival.id}`;

      const res = await updateFestivalAction({
        festivalId: festival.id,
        name,
        year: Number(year),
        location: hasLocation ? selectedPlace.name : null,
        locationProvince: hasLocation ? selectedPlace.province : null,
        locationRegion: hasLocation ? selectedPlace.region : null,
        locationCountry: hasLocation ? selectedPlace.country : null,
        locationCountryCode: hasLocation ? selectedPlace.countryCode : null,
        locationLatitude: hasLocation ? selectedPlace.latitude : null,
        locationLongitude: hasLocation ? selectedPlace.longitude : null,
        locationPlaceId:
          hasLocation && !isSavedPlaceholderPlace
            ? selectedPlace.placeId
            : hasLocation
              ? festival.locationPlaceId
              : null,
        startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
        endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
      });

      if (!res.ok) {
        setDetailsError(res.error);
        return;
      }

      setDetailsSaved(true);
      router.refresh();
    } finally {
      setSavingDetails(false);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    setRemoveError(null);
    setRemovingId(entryId);
    try {
      const res = await deleteEntryAction({ entryId });
      if (!res.ok) {
        setRemoveError(res.error);
        return;
      }
      setEntries((prev) => prev.filter((item) => item.id !== entryId));
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  };

  const handleParse = () => {
    setImportError(null);
    setImportSummary(null);
    const parsed = parseRawLineup(rawText);
    setRows(
      parsed.map((item, idx) => ({
        key: `${idx}-${item.billingName}`,
        included: true,
        billingName: item.billingName,
        artistsCsv: item.artistNames.join(", "),
        subtitle: item.subtitle ?? "",
        day: item.day ?? "",
        stage: item.stage ?? "",
        setTime: item.setTime ?? "",
      })),
    );
  };

  const updateImportRow = (index: number, patch: Partial<EditableImportRow>) => {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const handleConfirmImport = async () => {
    const includedRows = rows
      .filter((row) => row.included && row.billingName.trim().length > 0)
      .map((row) => ({
        billingName: row.billingName.trim(),
        artistNames: row.artistsCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        subtitle: row.subtitle.trim() || null,
        day: showScheduleColumns ? row.day.trim() || null : null,
        stage: showScheduleColumns ? row.stage.trim() || null : null,
        setTime: showScheduleColumns ? row.setTime.trim() || null : null,
        included: true,
      }))
      .filter((row) => row.artistNames.length > 0);

    if (includedRows.length === 0) {
      setImportError(dict.importer.noValidRowsError);
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      const res = await importLineupAction({
        festivalId: festival.id,
        rows: includedRows,
      });
      if (!res.ok) {
        setImportError(res.error);
        return;
      }
      setImportSummary({
        createdEntriesCount: res.data.createdEntriesCount,
        newArtistsCount: res.data.newArtistsCount,
      });
      setRawText("");
      setRows([]);
      router.refresh();
    } finally {
      setImporting(false);
    }
  };

  const filteredEntries = artistQuery.trim()
    ? entries.filter((entry) => {
        const needle = artistQuery.trim().toLowerCase();
        return (
          entry.billingName.toLowerCase().includes(needle) ||
          (entry.subtitle?.toLowerCase().includes(needle) ?? false) ||
          entry.artists.some((artist) => artist.name.toLowerCase().includes(needle))
        );
      })
    : entries;

  const includedCount = rows.filter((row) => row.included).length;
  const pendingDiffCount =
    (festival.pendingLineupDiff?.added.length ?? 0) +
    (festival.pendingLineupDiff?.updated.length ?? 0);

  return (
    <main className="mx-auto w-full max-w-[880px] min-h-[calc(100dvh-56px)] md:border-x md:border-line">
      {/* Editorial festival header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-6 sm:px-6">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink-muted">
            {dict.nav.manage}
          </p>
          <h1
            data-festival-heading
            className="mt-1 font-display text-[clamp(1.85rem,5vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]"
          >
            {name || festival.name} {year || festival.year}
          </h1>
        </div>

        <Link
          href={`/lineup?festival=${encodeURIComponent(festival.slug)}`}
          className="inline-flex border border-line px-3.5 py-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
        >
          {dict.importer.viewLineup}
        </Link>
      </div>

      {/* 4-section hairline tab bar */}
      <div role="tablist" className="grid grid-cols-2 border-b border-line bg-bg sm:grid-cols-4">
        {(
          [
            { id: "details", label: dict.manage.tabDetails },
            { id: "artists", label: dict.manage.tabArtists(entries.length) },
            { id: "import", label: dict.manage.tabImport },
            { id: "autosync", label: dict.manage.tabAutoSync(pendingDiffCount) },
          ] as const
        ).map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer px-3 py-3 font-mono text-[0.74rem] uppercase tracking-[0.08em] transition-colors ${
                idx < 3 ? "sm:border-r sm:border-line" : ""
              } ${idx % 2 === 0 ? "border-r border-line sm:border-r" : ""} ${
                idx < 2 ? "border-b border-line sm:border-b-0" : ""
              } ${
                isActive
                  ? "bg-acid font-semibold text-acid-ink"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Edit festival details */}
      {activeTab === "details" ? (
        <section className="flex flex-col gap-5 px-5 py-6 sm:px-6">
          <div>
            <h2 className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink">
              {dict.manage.detailsTitle}
            </h2>
            <p className="mt-1 font-serif text-[1.05rem] italic text-ink-muted">
              {dict.manage.detailsDescription}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
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
                onChange={(event) => {
                  setName(event.target.value);
                  setDetailsSaved(false);
                }}
                placeholder={dict.importer.namePlaceholder}
                className="border border-line bg-surface px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
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
                  setDetailsSaved(false);
                }}
                onSelectPlace={(place) => {
                  setSelectedPlace(place);
                  setLocationInvalid(false);
                  setDetailsSaved(false);
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
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
                  className="border border-line bg-surface px-3 py-2.5 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
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
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setDetailsSaved(false);
                  }}
                  className="border border-line bg-surface px-3 py-2.5 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
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
                  onChange={(event) => {
                    setYear(event.target.value);
                    setDetailsSaved(false);
                  }}
                  className="border border-line bg-surface px-3 py-2.5 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>
            </div>
          </div>

          {detailsError ? (
            <p
              role="alert"
              className="border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-xs text-ink"
            >
              {detailsError}
            </p>
          ) : null}

          {detailsSaved ? (
            <p
              role="status"
              className="border border-line bg-surface px-3.5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ink-muted"
            >
              {dict.manage.detailsSaved}
            </p>
          ) : null}

          <div className="flex justify-end pt-2">
            <HairlineButton
              variant="acid"
              size="md"
              disabled={savingDetails || name.trim().length === 0}
              onClick={() => void handleSaveDetails()}
            >
              {savingDetails ? dict.common.saving : dict.manage.saveDetails}
            </HairlineButton>
          </div>
        </section>
      ) : null}

      {/* TAB 2: Remove artists from this festival */}
      {activeTab === "artists" ? (
        <section className="flex flex-col">
          <div className="border-b border-line px-5 py-5 sm:px-6">
            <h2 className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink">
              {dict.manage.artistsTitle}
            </h2>
            <p className="mt-1 font-serif text-[1.02rem] italic text-ink-muted">
              {dict.manage.artistsDescription}
            </p>

            {entries.length > 0 ? (
              <input
                type="search"
                value={artistQuery}
                onChange={(event) => setArtistQuery(event.target.value)}
                placeholder={dict.manage.filterPlaceholder}
                aria-label={dict.manage.filterAria}
                className="mt-4 w-full border border-line bg-surface px-3.5 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
              />
            ) : null}

            {removeError ? (
              <p
                role="alert"
                className="mt-3 border border-line-strong bg-surface px-3.5 py-2 font-mono text-xs text-ink"
              >
                {removeError}
              </p>
            ) : null}
          </div>

          {entries.length === 0 ? (
            <p className="px-5 py-8 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
              {dict.manage.noArtists}
            </p>
          ) : filteredEntries.length === 0 ? (
            <p className="px-5 py-8 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
              {dict.manage.noFilterMatches}
            </p>
          ) : (
            <ul>
              {filteredEntries.map((entry, idx) => {
                const isRemoving = removingId === entry.id;
                const meta = [entry.day, entry.stage, entry.setTime].filter(Boolean).join(" · ");
                return (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                        {String(idx + 1).padStart(2, "0")}
                        {meta ? ` · ${meta}` : ""}
                      </div>
                      <div className="mt-0.5 truncate font-display text-[1.08rem] font-extrabold leading-tight tracking-[-0.02em]">
                        {entry.billingName}
                      </div>
                      {entry.subtitle ? (
                        <div className="truncate font-serif text-[0.95rem] italic text-ink-muted">
                          {entry.subtitle}
                        </div>
                      ) : null}
                    </div>

                    <HairlineButton
                      variant="default"
                      size="sm"
                      disabled={isRemoving}
                      onClick={() => void handleRemoveEntry(entry.id)}
                    >
                      {isRemoving ? dict.manage.removingArtist : dict.manage.removeArtist}
                    </HairlineButton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {/* TAB 3: Import new artists into this festival */}
      {activeTab === "import" ? (
        <section className="flex flex-col gap-5 px-5 py-6 sm:px-6">
          <div>
            <h2 className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink">
              {dict.manage.importTitle}
            </h2>
            <p className="mt-1 font-serif text-[1.05rem] italic text-ink-muted">
              {dict.manage.importDescription}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`${formId}-raw`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
            >
              {dict.importer.rawLineupLabel}
            </label>
            <textarea
              id={`${formId}-raw`}
              rows={7}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={
                "Mabe Fratti & Bill Orcutt\nWilliam Basinski 'Passing the Cup of Sorrows'\nBIG|BRAVE"
              }
              className="w-full border border-line bg-surface p-3.5 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <HairlineButton
              variant="acid"
              size="md"
              disabled={rawText.trim().length === 0}
              onClick={handleParse}
            >
              {dict.importer.analyzeButton}
            </HairlineButton>

            {rows.length > 0 ? (
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                {dict.importer.rowsReady(includedCount, rows.length)}
              </span>
            ) : null}
          </div>

          {importError ? (
            <p
              role="alert"
              className="border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-xs text-ink"
            >
              {importError}
            </p>
          ) : null}

          {importSummary ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 border border-acid bg-surface px-4 py-3"
            >
              <span className="font-mono text-xs text-ink">
                {dict.importer.importedSummary(
                  importSummary.createdEntriesCount,
                  importSummary.newArtistsCount,
                )}
              </span>
              <Link
                href={`/lineup?festival=${encodeURIComponent(festival.slug)}`}
                className="border border-acid bg-acid px-3 py-1.5 font-mono text-[0.72rem] font-semibold uppercase text-acid-ink"
              >
                {dict.importer.viewLineup}
              </Link>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="flex flex-col gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                <input
                  type="checkbox"
                  checked={showScheduleColumns}
                  onChange={(event) => setShowScheduleColumns(event.target.checked)}
                />
                <span>{dict.importer.scheduleToggle}</span>
              </label>

              <div className="overflow-x-auto border border-line">
                <table className="w-full border-collapse text-left font-sans text-xs">
                  <thead>
                    <tr className="border-b border-line bg-surface font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                      <th className="px-2.5 py-2">{dict.importer.colInclude}</th>
                      <th className="px-2.5 py-2">{dict.importer.colBillingName}</th>
                      <th className="px-2.5 py-2">{dict.importer.colArtists}</th>
                      <th className="px-2.5 py-2">{dict.importer.colSubtitle}</th>
                      {showScheduleColumns ? (
                        <>
                          <th className="px-2.5 py-2">{dict.importer.colDay}</th>
                          <th className="px-2.5 py-2">{dict.importer.colStage}</th>
                          <th className="px-2.5 py-2">{dict.importer.colTime}</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.key} className="border-b border-line">
                        <td className="px-2.5 py-1.5">
                          <input
                            type="checkbox"
                            checked={row.included}
                            aria-label={dict.importer.includeAria(row.billingName)}
                            onChange={(event) =>
                              updateImportRow(idx, { included: event.target.checked })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.billingName}
                            aria-label={dict.importer.billingNameRowAria(idx + 1)}
                            onChange={(event) =>
                              updateImportRow(idx, { billingName: event.target.value })
                            }
                            className="w-full min-w-[140px] border border-line bg-bg px-2 py-1 text-ink focus:border-ink focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.artistsCsv}
                            aria-label={dict.importer.artistsRowAria(idx + 1)}
                            onChange={(event) =>
                              updateImportRow(idx, { artistsCsv: event.target.value })
                            }
                            className="w-full min-w-[140px] border border-line bg-bg px-2 py-1 text-ink focus:border-ink focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.subtitle}
                            aria-label={dict.importer.subtitleRowAria(idx + 1)}
                            onChange={(event) =>
                              updateImportRow(idx, { subtitle: event.target.value })
                            }
                            className="w-full min-w-[120px] border border-line bg-bg px-2 py-1 text-ink focus:border-ink focus:outline-none"
                          />
                        </td>
                        {showScheduleColumns ? (
                          <>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.day}
                                aria-label={dict.importer.dayRowAria(idx + 1)}
                                onChange={(event) =>
                                  updateImportRow(idx, { day: event.target.value })
                                }
                                className="w-full min-w-[90px] border border-line bg-bg px-2 py-1 text-ink focus:border-ink focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.stage}
                                aria-label={dict.importer.stageRowAria(idx + 1)}
                                onChange={(event) =>
                                  updateImportRow(idx, { stage: event.target.value })
                                }
                                className="w-full min-w-[90px] border border-line bg-bg px-2 py-1 text-ink focus:border-ink focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.setTime}
                                aria-label={dict.importer.timeRowAria(idx + 1)}
                                onChange={(event) =>
                                  updateImportRow(idx, { setTime: event.target.value })
                                }
                                className="w-full min-w-[70px] border border-line bg-bg px-2 py-1 text-ink focus:border-ink focus:outline-none"
                              />
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <HairlineButton
                  variant="acid"
                  size="md"
                  disabled={importing || includedCount === 0}
                  onClick={() => void handleConfirmImport()}
                >
                  {importing ? dict.importer.importing : dict.importer.importEntries(includedCount)}
                </HairlineButton>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* TAB 4: Auto-sync lineup source */}
      {activeTab === "autosync" ? (
        <FestivalAutoSyncPanel festival={festival} hasGeminiApiKey={hasGeminiApiKey} />
      ) : null}
    </main>
  );
}
